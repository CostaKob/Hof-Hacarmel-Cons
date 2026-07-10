// iCount IPN webhook for the Private students module.
// Updates the pending student_payments row based on custom1 (paymentId)
// with fallbacks to icount_payment_page_id / docnum. Always returns 200 OK
// so iCount doesn't retry on unmatchable events.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function pick(obj: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}

function isUuid(v?: string): boolean {
  return !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let params: Record<string, string> = {};
  try {
    const ct = req.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const body = await req.json();
      params = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]));
    } else {
      const text = await req.text();
      new URLSearchParams(text).forEach((v, k) => { params[k] = v; });
    }
  } catch (e) {
    console.error("[icount-student-ipn] parse error", e);
  }

  console.log("[icount-student-ipn] payload", JSON.stringify(params));

  try {
    const customInfo = pick(params, ["custom1", "custom_info", "custom", "paymentId"]);
    const paypageId = pick(params, ["cp", "utm_campaign", "paypage_id", "page_id"]);
    const amountRaw = pick(params, ["sum", "amount", "total", "doc_total", "totalwithnicui", "total_paid"]) ?? "0";
    const amount = Number(String(amountRaw).replace(/[^0-9.-]/g, "")) || 0;
    const docUrl = pick(params, ["doc_url", "doc_link", "pdf_link", "url"]);
    const docId = pick(params, ["doc_id"]) ?? pick(params, ["docnum", "doc_number", "receiptnumber"]);
    const docNumber = pick(params, ["docnum", "doc_number", "receiptnumber"]);
    const txnId = pick(params, ["cc_deal_id", "tid", "transaction_id", "deal_id"]);
    const status = String(params.status ?? "").toLowerCase();

    // Locate the payment row
    let paymentId: string | null = null;
    if (isUuid(customInfo)) {
      const { data: p } = await supabase
        .from("student_payments")
        .select("id")
        .eq("id", customInfo!)
        .maybeSingle();
      if (p) paymentId = p.id;
    }
    if (!paymentId && paypageId) {
      const { data: p } = await supabase
        .from("student_payments")
        .select("id")
        .eq("icount_payment_page_id", String(paypageId))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (p) paymentId = p.id;
    }
    if (!paymentId && docNumber) {
      const { data: p } = await supabase
        .from("student_payments")
        .select("id")
        .eq("icount_doc_number", String(docNumber))
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (p) paymentId = p.id;
    }

    if (!paymentId) {
      console.error("[icount-student-ipn] payment not found", { customInfo, paypageId, docNumber });
      return new Response("OK", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }

    const isFailure = status && !["", "1", "true", "ok", "success", "paid"].includes(status);
    if (isFailure) {
      await supabase
        .from("student_payments")
        .update({ payment_status: "failed", notes: `נכשל: ${JSON.stringify(params).slice(0, 200)}` })
        .eq("id", paymentId);
      return new Response("OK", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
    }

    const updateFields: Record<string, unknown> = {
      payment_status: "paid",
      payment_method: "credit_card",
      paid_at: new Date().toISOString(),
      payment_date: new Date().toISOString().slice(0, 10),
      icount_doc_id: docId ?? null,
      icount_doc_number: docNumber ?? null,
      icount_doc_type: "receipt",
      icount_transaction_id: txnId ?? null,
      invoice_url: docUrl ?? null,
      notes: `שולם דרך iCount${params.full_name ? ` · הורה: ${params.full_name}` : ""}`,
    };
    if (amount > 0) updateFields.amount = Math.abs(amount);

    const { error: updErr } = await supabase
      .from("student_payments")
      .update(updateFields)
      .eq("id", paymentId);
    if (updErr) console.error("[icount-student-ipn] update error", updErr);
    else console.log("[icount-student-ipn] updated", paymentId);

    // Cleanup: delete the dynamic paypage from iCount. Non-fatal on failure.
    try {
      const { data: pmt } = await supabase
        .from("student_payments")
        .select("icount_payment_page_id")
        .eq("id", paymentId)
        .maybeSingle();
      const ppid = String(paypageId || pmt?.icount_payment_page_id || "") || null;
      if (ppid) {
        const delRes = await fetch("https://api.icount.co.il/api/v3.php/paypage/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cid: Deno.env.get("ICOUNT_COMPANY_ID"),
            user: Deno.env.get("ICOUNT_USERNAME"),
            pass: Deno.env.get("ICOUNT_PASSWORD"),
            paypage_id: ppid,
          }),
        });
        const delJson = await delRes.json().catch(() => ({}));
        console.log("[icount-student-ipn] paypage/delete", ppid, delJson);
        await supabase
          .from("student_payments")
          .update({ payment_link_url: null, icount_payment_page_id: null })
          .eq("id", paymentId);
      }
    } catch (cleanupErr) {
      console.warn("[icount-student-ipn] paypage cleanup failed", cleanupErr);
    }
  } catch (e) {
    console.error("[icount-student-ipn] error", e);
  }

  return new Response("OK", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
});
