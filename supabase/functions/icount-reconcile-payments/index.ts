// Reconciles paid iCount receipts with pending payment rows.
// Safety net for cases where the iCount IPN never reached us: scans receipts
// in a date range, reads each document's cc_page_id (the dynamic paypage we
// created) and marks the matching pending payment as paid.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdminOrSecretary } from "../_shared/requireAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php";

function getAuth() {
  const cid = Deno.env.get("ICOUNT_COMPANY_ID");
  const user = Deno.env.get("ICOUNT_USERNAME");
  const pass = Deno.env.get("ICOUNT_PASSWORD");
  if (!cid || !user || !pass) throw new Error("ICOUNT credentials missing");
  return { cid, user, pass };
}

async function icount(path: string, payload: Record<string, unknown>) {
  const res = await fetch(`${ICOUNT_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...getAuth(), ...payload }),
  });
  return await res.json().catch(() => ({}));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFail = await requireAdminOrSecretary(req, corsHeaders);
  if (authFail) return authFail;

  try {
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false ? body?.dryRun === true : false;
    const today = new Date();
    const from = body?.from ?? new Date(today.getTime() - 90 * 86400000).toISOString().slice(0, 10);
    const to = body?.to ?? today.toISOString().slice(0, 10);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pending rows that still carry a dynamic paypage id
    const [{ data: studentPending }, { data: smPending }] = await Promise.all([
      supabase.from("student_payments")
        .select("id, amount, icount_payment_page_id")
        .eq("payment_status", "pending")
        .not("icount_payment_page_id", "is", null),
      supabase.from("school_music_payments")
        .select("id, amount, icount_payment_page_id")
        .eq("payment_status", "pending")
        .not("icount_payment_page_id", "is", null),
    ]);

    const byPage = new Map<string, { table: string; id: string; amount: number }>();
    for (const r of studentPending ?? []) {
      byPage.set(String(r.icount_payment_page_id), { table: "student_payments", id: r.id, amount: Number(r.amount) });
    }
    for (const r of smPending ?? []) {
      byPage.set(String(r.icount_payment_page_id), { table: "school_music_payments", id: r.id, amount: Number(r.amount) });
    }
    if (byPage.size === 0) {
      return new Response(JSON.stringify({ ok: true, checked: 0, matched: [], message: "no pending links" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const compact = (d: string) => d.replace(/-/g, "");
    const list: any[] = [];
    for (let offset = 0; offset < 2000; offset += 100) {
      const search = await icount("doc/search", {
        doctype: "receipt",
        start_date: compact(from),
        end_date: compact(to),
        from_date: from,
        to_date: to,
        detail_level: 10,
        max_results: 100,
        limit: 100,
        offset,
      });
      if (search?.status === false) break;
      const page: any[] = search?.results_list ?? search?.docs ?? search?.results ?? search?.data ?? [];
      const arr = Array.isArray(page) ? page : Object.values(page || {});
      list.push(...arr);
      if (arr.length < 100) break;
    }

    const pendingAmounts = new Set([...byPage.values()].map((v) => Math.round(v.amount)));

    const matched: any[] = [];
    for (const doc of list) {
      const docnum = doc.docnum ?? doc.doc_number;
      if (!docnum) continue;
      if (Number(doc.is_cancelled) || Number(doc.is_cancellation)) continue;
      const total = Math.round(Number(doc.total ?? doc.doc_total ?? 0));
      if (total > 0 && !pendingAmounts.has(total)) continue;
      const info = await icount("doc/info", { doctype: "receipt", docnum: Number(docnum) || docnum });
      const di = info?.doc_info ?? {};
      if (di.is_cancelled === true || di.is_cancellation === true) continue;

      const pageId = String(di?.custom?.cc_page_id ?? "");
      if (!pageId) continue;
      const target = byPage.get(pageId);
      if (!target) continue;

      const cc = Array.isArray(di.cc) ? di.cc[0] : undefined;
      const update: Record<string, unknown> = {
        payment_status: "paid",
        payment_method: "credit_card",
        paid_at: di.timeissued ?? new Date().toISOString(),
        payment_date: di.dateissued ?? new Date().toISOString().slice(0, 10),
        icount_doc_number: String(docnum),
        icount_doc_type: "receipt",
        icount_transaction_id: cc?.confirmation_code ?? null,
        invoice_url: di.doc_url ?? null,
        installments: Number(cc?.num_of_payments) || 1,
        payment_link_url: null,
        notes: "שולם דרך iCount · אותר בהתאמה אוטומטית",
      };
      matched.push({ table: target.table, id: target.id, docnum, amount: di.total, pageId });
      if (!dryRun) {
        const { error } = await supabase.from(target.table).update(update).eq("id", target.id);
        if (error) console.error("[icount-reconcile] update failed", target, error);
      }
    }

    return new Response(JSON.stringify({ ok: true, dryRun, from, to, scanned: list.length, matched }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-reconcile]", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
