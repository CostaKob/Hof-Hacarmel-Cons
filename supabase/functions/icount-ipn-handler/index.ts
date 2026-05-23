// iCount IPN (Instant Payment Notification) webhook.
// Receives application/x-www-form-urlencoded POST from iCount when a payment succeeds,
// matches the payer to a student by national_id (student_tz), and records the payment.
// Always returns 200 OK so iCount does not retry.
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
      const sp = new URLSearchParams(text);
      sp.forEach((v, k) => { params[k] = v; });
    }
  } catch (e) {
    console.error("[icount-ipn] body parse error", e);
  }

  console.log("[icount-ipn] payload", JSON.stringify(params));

  try {
    const studentTz = pick(params, ["student_tz", "custom_student_tz", "client_id_number"]);
    const amountRaw = pick(params, ["sum", "amount", "total", "doc_total"]) ?? "0";
    const amount = Number(String(amountRaw).replace(/[^0-9.-]/g, "")) || 0;
    const docUrl = pick(params, ["doc_url", "pdf_link", "url"]);
    const docId = pick(params, ["doc_id", "docnum"]);
    const docNumber = pick(params, ["docnum", "doc_number"]);
    const txnId = pick(params, ["cc_deal_id", "tid", "transaction_id", "deal_id"]);

    // Pick the currently-active academic year for IPN-inserted rows.
    const { data: activeYear } = await supabase
      .from("academic_years").select("id").eq("is_active", true).maybeSingle();

    let studentId: string | null = null;
    if (studentTz) {
      const { data: student } = await supabase
        .from("students").select("id").eq("national_id", studentTz).maybeSingle();
      studentId = student?.id ?? null;
    }

    const noteParts = [
      "התקבל אוטומטית מ-iCount",
      studentTz ? `ת״ז ${studentTz}` : null,
      !studentId ? "⚠️ לא נמצא תלמיד מתאים — דורש שיוך ידני" : null,
      params.school_name ? `שלוחה: ${params.school_name}` : null,
      params.full_name ? `הורה: ${params.full_name}` : null,
    ].filter(Boolean);

    const { data: inserted, error: insErr } = await supabase
      .from("student_payments")
      .insert({
        student_id: studentId,
        enrollment_id: null,
        academic_year_id: activeYear?.id ?? null,
        amount: Math.abs(amount),
        transaction_type: "payment",
        payment_method: "credit_card",
        payment_date: new Date().toISOString().slice(0, 10),
        installments: 1,
        icount_doc_id: docId ?? null,
        icount_doc_number: docNumber ?? null,
        invoice_url: docUrl ?? null,
        icount_doc_type: "receipt",
        icount_transaction_id: txnId ?? null,
        notes: noteParts.join(" · "),
      })
      .select()
      .single();

    if (insErr) console.error("[icount-ipn] insert error", insErr);
    else console.log("[icount-ipn] inserted payment", inserted?.id, "matched student:", studentId);
  } catch (e) {
    console.error("[icount-ipn] error", e);
  }

  return new Response("OK", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
});
