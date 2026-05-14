// Creates a NEGATIVE iCount RECEIPT (קבלה במינוס) for a refund, linked to the original
// receipt via `based_on`. Malkar (Non-Profit) cannot issue Tax Invoices or Credit Invoices —
// refunds are issued as a negative Receipt. Inserts a matching credit row into student_payments.
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

    const { data: payment, error: payErr } = await supabase
      .from("student_payments")
      .select("*, students(first_name,last_name,address,city,parent_name,parent_phone,parent_phone_2,parent_email,parent_email_2)")
      .eq("id", paymentId)
      .maybeSingle();

    if (payErr || !payment) {
      return new Response(JSON.stringify({ error: "payment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payment.icount_doc_id) {
      return new Response(JSON.stringify({ error: "no original invoice to refund" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = getAuth();
    const student: any = payment.students || {};
    const studentFullName = `${student.first_name} ${student.last_name}`.trim();
    const originalAmount = Number(payment.amount ?? 0);
    const refundAmount = Number(amountOverride ?? originalAmount);
    const isPartial = Math.abs(refundAmount) < Math.abs(originalAmount);
    const description = `החזר ${isPartial ? "חלקי " : ""}— ${studentFullName}${reason ? ` (${reason})` : ""} — קבלה מקור ${payment.icount_doc_number ?? payment.icount_doc_id} (סכום מקורי ₪${Math.abs(originalAmount).toLocaleString()}, החזר ₪${Math.abs(refundAmount).toLocaleString()})`;
    const phone = student.parent_phone || student.parent_phone_2 || undefined;
    const email = student.parent_email || student.parent_email_2 || undefined;
    const negSum = -Math.abs(refundAmount);

    // Negative Receipt (קבלה במינוס) linked to the original receipt.
    // Malkar status — no Tax Invoice, no VAT.
    const payload: any = {
      ...auth,
      doctype: "receipt",
      client_name: student.parent_name || studentFullName,
      client_address: student.address || student.city || undefined,
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
      based_on: [payment.icount_doc_id],
      origin_doc_id: payment.icount_doc_id,
      items: [{ description, unitprice_incvat: negSum, quantity: 1 }],
    };

    // Mirror the original payment method on the refund side with a negative sum
    // so the negative invoice is balanced by a negative receipt line.
    switch (payment.payment_method) {
      case "cash":
        payload.cash = { sum: negSum };
        break;
      case "cheque":
        payload.cheques = [{ sum: negSum, bank: "", branch: "", account: "", num: payment.reference_number || "" }];
        break;
      case "bank_transfer":
        payload.banktransfer = { sum: negSum, account: payment.reference_number || "" };
        break;
      case "credit_card":
        payload.cc = { sum: negSum, num: payment.reference_number || "", payments_count: payment.installments || 1 };
        break;
      default:
        payload.other = { sum: negSum, info: "החזר" };
    }

    const res = await fetch(`${ICOUNT_BASE}/doc/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log("[icount negative invrec]", JSON.stringify(data));

    if (!data.status) {
      return new Response(JSON.stringify({ error: "icount failed", details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docId = String(data.doc_id ?? data.docnum ?? "");
    const docNumber = String(data.docnum ?? data.doc_number ?? "");
    const docUrl = data.doc_url || data.pdf_link || data.url || null;

    // Insert credit row
    const { data: credit, error: insErr } = await supabase
      .from("student_payments")
      .insert({
        student_id: payment.student_id,
        enrollment_id: payment.enrollment_id,
        academic_year_id: payment.academic_year_id,
        amount: negSum,
        transaction_type: "credit",
        payment_method: payment.payment_method,
        payment_date: new Date().toISOString().slice(0, 10),
        notes: reason || `החזר לחשבונית ${payment.icount_doc_number ?? ""}`.trim(),
        refund_of_payment_id: payment.id,
        icount_doc_id: docId,
        icount_doc_number: docNumber,
        invoice_url: docUrl,
        icount_doc_type: "invrec",
      })
      .select()
      .single();

    if (insErr) {
      console.error("[insert credit row]", insErr);
    }

    return new Response(JSON.stringify({
      ok: true, doc_id: docId, doc_number: docNumber, url: docUrl, credit_payment_id: credit?.id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[icount-create-refund]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
