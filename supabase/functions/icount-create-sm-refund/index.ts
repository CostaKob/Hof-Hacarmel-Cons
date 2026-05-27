// Creates a NEGATIVE iCount RECEIPT (קבלה במינוס) for a refund of a school_music_payments row.
// Inserts a matching credit row (negative amount) linked via refund_of_payment_id.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { paymentId, amount: amountOverride, reason } = await req.json();
    if (!paymentId) {
      return new Response(JSON.stringify({ error: "paymentId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment, error } = await supabase
      .from("school_music_payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (error || !payment) {
      console.error("[icount-create-sm-refund] payment not found", { paymentId, error });
      return new Response(JSON.stringify({ error: "payment not found", details: error }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payment.icount_doc_id && !payment.icount_doc_number) {
      return new Response(JSON.stringify({ error: "no original receipt to refund" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: studentRow } = await supabase
      .from("school_music_students")
      .select("student_first_name,student_last_name,parent_name,parent_phone,parent_email,city")
      .eq("id", payment.school_music_student_id)
      .maybeSingle();

    const auth = getAuth();
    const student: any = studentRow || {};
    const studentFullName = `${student.student_first_name ?? ""} ${student.student_last_name ?? ""}`.trim();
    const originalAmount = Number(payment.amount || 0);
    const refundAmount = Number(amountOverride ?? originalAmount);
    const isPartial = Math.abs(refundAmount) < Math.abs(originalAmount);
    const description = `החזר ${isPartial ? "חלקי " : ""}— ${studentFullName}${reason ? ` (${reason})` : ""} — קבלה מקור ${payment.icount_doc_number ?? payment.icount_doc_id} (סכום מקורי ₪${Math.abs(originalAmount).toLocaleString()}, החזר ₪${Math.abs(refundAmount).toLocaleString()})`;
    const negSum = -Math.abs(refundAmount);
    const phone = student.parent_phone || undefined;
    const email = student.parent_email || undefined;

    const payload: any = {
      ...auth,
      doctype: "receipt",
      client_name: student.parent_name || studentFullName,
      client_address: student.city || undefined,
      client_city: student.city || undefined,
      client_phone: phone,
      client_mobile: phone,
      phone,
      mobile: phone,
      email,
      send_email: !!email,
      lang: "he",
      currency_code: "ILS",
      vat_free: 1,
      ...(payment.icount_doc_id ? { based_on: [payment.icount_doc_id], origin_doc_id: payment.icount_doc_id } : {}),
      items: [{ description, unitprice_incvat: negSum, quantity: 1 }],
    };

    switch (payment.payment_method) {
      case "cash": payload.cash = { sum: negSum }; break;
      case "cheque": case "check":
        payload.cheques = [{ sum: negSum, bank: "", branch: "", account: "", num: payment.transaction_reference || "" }]; break;
      case "bank_transfer": case "transfer":
        payload.banktransfer = { sum: negSum, account: payment.transaction_reference || "" }; break;
      case "credit_card": case "credit":
        payload.cc = { sum: negSum, num: payment.transaction_reference || "", payments_count: 1 }; break;
      default: payload.other = { sum: negSum, info: "החזר" };
    }

    const res = await fetch(`${ICOUNT_BASE}/doc/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log("[icount sm negative receipt]", JSON.stringify(data));

    if (!data.status) {
      return new Response(JSON.stringify({ error: "icount failed", details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docId = String(data.doc_id ?? data.docnum ?? "");
    const docNumber = String(data.docnum ?? data.doc_number ?? "");
    const docUrl = data.doc_url || data.pdf_link || data.url || null;

    const { data: credit, error: insErr } = await supabase
      .from("school_music_payments")
      .insert({
        school_music_student_id: payment.school_music_student_id,
        school_music_school_id: payment.school_music_school_id,
        academic_year_id: payment.academic_year_id,
        amount: negSum,
        payment_status: "refunded",
        payment_method: payment.payment_method,
        notes: reason || `החזר לקבלה ${payment.icount_doc_number ?? ""}`.trim(),
        refund_of_payment_id: payment.id,
        icount_doc_id: docId,
        icount_doc_number: docNumber,
        invoice_url: docUrl,
        icount_doc_type: "receipt",
        paid_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insErr) console.error("[insert sm credit row]", insErr);

    return new Response(JSON.stringify({
      ok: true, doc_id: docId, doc_number: docNumber, url: docUrl, credit_payment_id: credit?.id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[icount-create-sm-refund]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
