// iCount IPN (Instant Payment Notification) webhook for the Playing Schools module.
// Updates the pending school_music_payments row that was created during
// registration, by matching custom_info=paymentId (preferred). Falls back to
// most-recent pending row for the student, then to insert+flag-for-manual-review.
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
    console.error("[icount-ipn] body parse error", e);
  }

  console.log("[icount-ipn] payload", JSON.stringify(params));

  try {
    const customInfo = pick(params, ["custom1", "custom_info", "custom", "paymentId", "studentId"]);
    const studentTz = pick(params, ["student_tz", "custom_student_tz", "client_id_number", "vat_id"]);
    const amountRaw = pick(params, ["sum", "amount", "total", "doc_total"]) ?? "0";
    const amount = Number(String(amountRaw).replace(/[^0-9.-]/g, "")) || 0;
    const docUrl = pick(params, ["doc_url", "pdf_link", "url"]);
    const docId = pick(params, ["doc_id"]);
    const docNumber = pick(params, ["docnum", "doc_number"]);
    const txnId = pick(params, ["cc_deal_id", "tid", "transaction_id", "deal_id"]);

    // Try to find a paymentId (preferred) or studentId from custom_info.
    let paymentId: string | null = null;
    let studentIdFromCustom: string | null = null;
    if (isUuid(customInfo)) {
      // Probe school_music_payments first.
      const { data: pmt } = await supabase
        .from("school_music_payments")
        .select("id, school_music_student_id, school_music_school_id, academic_year_id")
        .eq("id", customInfo!).maybeSingle();
      if (pmt) {
        paymentId = pmt.id;
      } else {
        const { data: stu } = await supabase
          .from("school_music_students")
          .select("id").eq("id", customInfo!).maybeSingle();
        if (stu) studentIdFromCustom = stu.id;
      }
    }

    // Fallback: locate pending payment for the student (custom or by TZ).
    if (!paymentId) {
      let studentId: string | null = studentIdFromCustom;
      if (!studentId && studentTz) {
        const { data: stu } = await supabase
          .from("school_music_students")
          .select("id")
          .eq("student_national_id", studentTz)
          .order("created_at", { ascending: false })
          .limit(1).maybeSingle();
        if (stu) studentId = stu.id;
      }
      if (studentId) {
        const { data: pendings } = await supabase
          .from("school_music_payments")
          .select("id")
          .eq("school_music_student_id", studentId)
          .eq("payment_status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);
        if (pendings && pendings.length) paymentId = pendings[0].id;
      }
    }

    const updateFields = {
      payment_status: "paid",
      payment_method: "credit_card",
      paid_at: new Date().toISOString(),
      amount: Math.abs(amount) || undefined,
      icount_doc_id: docId ?? null,
      icount_doc_number: docNumber ?? null,
      icount_doc_type: "receipt",
      icount_transaction_id: txnId ?? null,
      invoice_url: docUrl ?? null,
      notes: `שולם דרך iCount${params.full_name ? ` · הורה: ${params.full_name}` : ""}`,
    } as Record<string, unknown>;
    // Strip undefined so we don't overwrite the original tuition amount with NaN.
    Object.keys(updateFields).forEach((k) => updateFields[k] === undefined && delete updateFields[k]);

    if (paymentId) {
      const { error: updErr } = await supabase
        .from("school_music_payments").update(updateFields).eq("id", paymentId);
      if (updErr) console.error("[icount-ipn] update error", updErr);
      else console.log("[icount-ipn] updated payment", paymentId);
    } else {
      // Last resort: insert a flagged row so admins can reconcile manually.
      const { data: ay } = await supabase
        .from("academic_years").select("id").eq("is_active", true).maybeSingle();
      const { error: insErr } = await supabase.from("school_music_payments").insert({
        ...updateFields,
        amount: Math.abs(amount),
        academic_year_id: ay?.id ?? null,
        notes: `⚠️ דורש שיוך ידני - התקבל מ-iCount${customInfo ? ` · custom_info=${customInfo}` : ""}${studentTz ? ` · ת״ז=${studentTz}` : ""}`,
      });
      if (insErr) console.error("[icount-ipn] fallback insert error", insErr);
      else console.log("[icount-ipn] inserted unmatched row for manual reconciliation");
    }
  } catch (e) {
    console.error("[icount-ipn] error", e);
  }

  return new Response("OK", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
});
