// Creates an iCount credit invoice (חשבונית זיכוי) for an existing paid invoice.
// Inserts a matching credit row into student_payments, linked via refund_of_payment_id.
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
      .select("*, students(first_name,last_name,parent_name,parent_email,parent_email_2)")
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
    const refundAmount = Number(amountOverride ?? payment.amount ?? 0);
    const description = `זיכוי — ${studentFullName}${reason ? ` (${reason})` : ""} — חשבונית מקור ${payment.icount_doc_number ?? payment.icount_doc_id}`;

    const payload: any = {
      ...auth,
      doctype: "refund",
      client_name: student.parent_name || studentFullName,
      email: student.parent_email || student.parent_email_2 || undefined,
      send_email: !!(student.parent_email || student.parent_email_2),
      lang: "he",
      currency_code: "ILS",
      vat_included: 1,
      based_on: [payment.icount_doc_id],
      items: [{ description, unitprice_incvat: refundAmount, quantity: 1 }],
    };

    const res = await fetch(`${ICOUNT_BASE}/doc/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log("[icount credit_invoice]", JSON.stringify(data));

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
        amount: refundAmount,
        transaction_type: "credit",
        payment_method: payment.payment_method,
        payment_date: new Date().toISOString().slice(0, 10),
        notes: reason || `זיכוי לחשבונית ${payment.icount_doc_number ?? ""}`.trim(),
        refund_of_payment_id: payment.id,
        icount_doc_id: docId,
        icount_doc_number: docNumber,
        invoice_url: docUrl,
        icount_doc_type: "credit_invoice",
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
