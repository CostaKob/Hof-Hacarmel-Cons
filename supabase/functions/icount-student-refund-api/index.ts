// Issues a credit-card refund through iCount's /cc/refund endpoint against a
// private-student payment (student_payments), then writes a balancing
// negative row back to student_payments with the new refund receipt URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php";

function auth() {
  const cid = Deno.env.get("ICOUNT_COMPANY_ID");
  const user = Deno.env.get("ICOUNT_USERNAME");
  const pass = Deno.env.get("ICOUNT_PASSWORD");
  if (!cid || !user || !pass) throw new Error("ICOUNT credentials missing");
  return { cid, user, pass };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { paymentId, refundAmount, reason } = await req.json();
    if (!paymentId || !refundAmount || Number(refundAmount) <= 0) {
      return new Response(JSON.stringify({ error: "paymentId and positive refundAmount required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment, error: payErr } = await supabase
      .from("student_payments")
      .select("*, students(first_name,last_name)")
      .eq("id", paymentId)
      .maybeSingle();

    if (payErr || !payment) {
      return new Response(JSON.stringify({ error: "payment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payment.icount_transaction_id) {
      return new Response(JSON.stringify({ error: "no credit-card transaction id on this payment" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: priorRefunds } = await supabase
      .from("student_payments")
      .select("amount")
      .eq("refund_of_payment_id", paymentId);

    const refundedSoFar = (priorRefunds ?? []).reduce(
      (s: number, r: any) => s + Math.abs(Number(r.amount ?? 0)), 0,
    );
    const maxRefundable = Math.max(0, Math.abs(Number(payment.amount ?? 0)) - refundedSoFar);
    const sum = Math.abs(Number(refundAmount));
    if (sum > maxRefundable + 0.001) {
      return new Response(JSON.stringify({ error: `refund exceeds remaining (₪${maxRefundable})` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stu: any = (payment as any).students || {};
    const fullName = `${stu.first_name ?? ""} ${stu.last_name ?? ""}`.trim();
    const description = `החזר אשראי — ${fullName}${reason ? ` (${reason})` : ""} — עסקה ${payment.icount_transaction_id}`;

    const creds = auth();
    const payload = {
      ...creds,
      cc_deal_id: payment.icount_transaction_id,
      transaction_id: payment.icount_transaction_id,
      sum,
      reason: reason || "החזר",
      description,
      based_on: payment.icount_doc_id ? [payment.icount_doc_id] : undefined,
    };

    const res = await fetch(`${ICOUNT_BASE}/cc/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    console.log("[icount student cc refund]", JSON.stringify(data));

    if (!data?.status) {
      return new Response(JSON.stringify({ error: "iCount refund failed", details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const refundDocId = String(data.doc_id ?? data.docnum ?? "");
    const refundDocNumber = String(data.docnum ?? data.doc_number ?? "");
    const refundUrl = data.doc_url ?? data.pdf_link ?? data.url ?? null;
    const refundTxnId = String(data.cc_deal_id ?? data.tid ?? data.transaction_id ?? "");

    const { data: credit, error: insErr } = await supabase
      .from("student_payments")
      .insert({
        student_id: payment.student_id,
        enrollment_id: payment.enrollment_id,
        academic_year_id: payment.academic_year_id,
        amount: -sum,
        transaction_type: "credit",
        payment_method: "credit_card",
        payment_date: new Date().toISOString().slice(0, 10),
        notes: reason || `החזר אשראי לעסקה ${payment.icount_transaction_id}`,
        refund_of_payment_id: payment.id,
        icount_doc_id: refundDocId || null,
        icount_doc_number: refundDocNumber || null,
        invoice_url: refundUrl,
        icount_doc_type: "receipt",
        icount_transaction_id: refundTxnId || payment.icount_transaction_id,
      })
      .select()
      .single();

    if (insErr) console.error("[icount-student-refund-api] insert credit row error", insErr);

    return new Response(JSON.stringify({
      ok: true,
      doc_id: refundDocId,
      doc_number: refundDocNumber,
      url: refundUrl,
      credit_payment_id: credit?.id,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[icount-student-refund-api]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
