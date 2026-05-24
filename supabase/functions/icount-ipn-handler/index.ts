// iCount IPN (Instant Payment Notification) webhook for the Playing Schools module.
// Receives a successful-payment payload from iCount, matches the payer to a
// school_music_students row (preferring custom_info=studentId, falling back to
// student_national_id), then inserts a paid row into school_music_payments.
// Rows that cannot be matched are inserted with notes flagging them for manual assignment.
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
      new URLSearchParams(text).forEach((v, k) => { params[k] = v; });
    }
  } catch (e) {
    console.error("[icount-ipn] body parse error", e);
  }

  console.log("[icount-ipn] payload", JSON.stringify(params));

  try {
    const customStudentId = pick(params, ["custom_info", "custom", "studentId"]);
    const studentTz = pick(params, ["student_tz", "custom_student_tz", "client_id_number", "vat_id"]);
    const amountRaw = pick(params, ["sum", "amount", "total", "doc_total"]) ?? "0";
    const amount = Number(String(amountRaw).replace(/[^0-9.-]/g, "")) || 0;
    const docUrl = pick(params, ["doc_url", "pdf_link", "url"]);
    const docId = pick(params, ["doc_id"]);
    const docNumber = pick(params, ["docnum", "doc_number"]);
    const txnId = pick(params, ["cc_deal_id", "tid", "transaction_id", "deal_id"]);

    // Resolve student.
    let student: any = null;
    if (customStudentId) {
      const { data } = await supabase
        .from("school_music_students")
        .select("id, school_music_school_id, academic_year_id, student_first_name, student_last_name")
        .eq("id", customStudentId).maybeSingle();
      student = data;
    }
    if (!student && studentTz) {
      const { data } = await supabase
        .from("school_music_students")
        .select("id, school_music_school_id, academic_year_id, student_first_name, student_last_name")
        .eq("student_national_id", studentTz)
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      student = data;
    }

    // Active academic year fallback for unassigned rows.
    let academicYearId: string | null = student?.academic_year_id ?? null;
    if (!academicYearId) {
      const { data: ay } = await supabase
        .from("academic_years").select("id").eq("is_active", true).maybeSingle();
      academicYearId = ay?.id ?? null;
    }

    const matched = !!student;
    const noteParts = [
      "התקבל אוטומטית מ-iCount",
      matched ? null : "⚠️ דורש שיוך ידני (Requires Manual Assignment)",
      customStudentId ? `student_id ${customStudentId}` : null,
      studentTz ? `ת״ז ${studentTz}` : null,
      params.full_name ? `הורה: ${params.full_name}` : null,
    ].filter(Boolean);

    const insertRow: Record<string, unknown> = {
      school_music_student_id: student?.id ?? null,
      school_music_school_id: student?.school_music_school_id ?? null,
      academic_year_id: academicYearId,
      amount: Math.abs(amount),
      payment_status: "paid",
      payment_method: "credit_card",
      paid_at: new Date().toISOString(),
      icount_doc_id: docId ?? null,
      icount_doc_number: docNumber ?? null,
      icount_doc_type: "receipt",
      icount_transaction_id: txnId ?? null,
      invoice_url: docUrl ?? null,
      notes: noteParts.join(" · "),
    };

    const { data: inserted, error: insErr } = await supabase
      .from("school_music_payments").insert(insertRow).select().single();

    if (insErr) console.error("[icount-ipn] insert error", insErr);
    else console.log("[icount-ipn] inserted", inserted?.id, "matched:", matched);
  } catch (e) {
    console.error("[icount-ipn] error", e);
  }

  return new Response("OK", { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
});
