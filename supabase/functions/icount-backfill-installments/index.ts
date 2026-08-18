// Backfills the credit-card installment count on existing student_payments rows
// by reading the matching iCount receipt document.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdminOrSecretary } from "../_shared/requireAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php";

async function fetchInstallmentsFromDoc(docId?: string | null, docNumber?: string | null): Promise<number | null> {
  const cid = Deno.env.get("ICOUNT_COMPANY_ID");
  const user = Deno.env.get("ICOUNT_USERNAME");
  const pass = Deno.env.get("ICOUNT_PASSWORD");
  if (!cid || !user || !pass) return null;
  if (!docId && !docNumber) return null;
  try {
    const payload: Record<string, unknown> = { cid, user, pass, doctype: "receipt" };
    if (docId) payload.doc_id = docId;
    if (docNumber) payload.docnum = Number(docNumber) || docNumber;
    const res = await fetch(`${ICOUNT_BASE}/doc/info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    const di = data?.doc_info ?? data ?? {};
    const ccRaw = di.cc ?? data?.cc ?? [];
    const ccList = Array.isArray(ccRaw) ? ccRaw : Object.values(ccRaw || {});
    const row: any = ccList[0] ?? {};
    const n = Number(
      row.num_of_payments ?? row.payments_count ?? row.payments ?? row.numofpayments ??
      di.num_of_payments ?? di.payments_count ?? 0,
    );
    return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
  } catch (e) {
    console.warn("[backfill-installments] doc/info failed", e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const denied = await requireAdminOrSecretary(req, corsHeaders);
  if (denied) return denied;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: rows, error } = await supabase
      .from("student_payments")
      .select("id, amount, installments, icount_doc_id, icount_doc_number")
      .eq("payment_method", "credit_card")
      .gt("amount", 0)
      .or("installments.is.null,installments.lte.1")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;

    const results: Array<{ id: string; installments: number | null }> = [];
    for (const r of rows ?? []) {
      const n = await fetchInstallmentsFromDoc(r.icount_doc_id, r.icount_doc_number);
      if (n && n > 1) {
        await supabase.from("student_payments").update({ installments: n }).eq("id", r.id);
      }
      results.push({ id: r.id, installments: n });
    }

    const updated = results.filter((r) => (r.installments ?? 0) > 1).length;
    return new Response(JSON.stringify({ checked: results.length, updated, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
