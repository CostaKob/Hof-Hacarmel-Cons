// School Music refund. Supports partial + full refunds.
// 1. If icount_transaction_id exists → call iCount /cc/refund with the cc_deal_id
//    and the selected sum (real refund back to the original card).
// 2. Always create a NEGATIVE iCount RECEIPT (קבלה במינוס) linked to the
//    original document via based_on/origin_doc_id.
// 3. Insert a balancing credit row in school_music_payments.
//
// If no icount_transaction_id (cash / cheque / bank transfer) → step 1 is
// skipped and only the negative receipt is created.
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

async function icountJson(path: string, payload: Record<string, any>) {
  const res = await fetch(`${ICOUNT_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFail = await requireAdminOrSecretary(req, corsHeaders);
  if (authFail) return authFail;



  try {
    const { paymentId, refundAmount, reason } = await req.json();
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
      .from("school_music_payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (payErr || !payment) {
      return new Response(JSON.stringify({ error: "payment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payment.icount_doc_id && !payment.icount_doc_number) {
      return new Response(JSON.stringify({ error: "missing iCount document on this payment" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const original = Math.abs(Number(payment.amount ?? 0));
    const requested = Math.abs(Number(refundAmount ?? original));

    // Check already-refunded amount and enforce remaining cap
    const { data: priorRefunds } = await supabase
      .from("school_music_payments")
      .select("amount")
      .eq("refund_of_payment_id", paymentId);
    const alreadyRefunded = (priorRefunds ?? []).reduce(
      (s, r: any) => s + Math.abs(Number(r.amount || 0)), 0,
    );
    const remaining = Math.max(0, original - alreadyRefunded);
    if (requested <= 0) {
      return new Response(JSON.stringify({ error: "סכום זיכוי חייב להיות חיובי" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (requested > remaining + 0.01) {
      return new Response(JSON.stringify({
        error: `הסכום חורג מהנותר לזיכוי. נותר: ₪${remaining.toFixed(2)}, ביקשת: ₪${requested.toFixed(2)}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const auth = getAuth();
    const negSum = -Math.abs(requested);
    let ccRefundResult: any = null;

    // Step 1: refund the credit card transaction if we have cc_bill_log_id
    let dealId = payment.icount_transaction_id;
    const isCcMethod = payment.payment_method === "credit_card";

    if (isCcMethod && !dealId && (payment.icount_doc_id || payment.icount_doc_number)) {
      const infoPayload: any = { ...auth, doctype: payment.icount_doc_type || "receipt" };
      if (payment.icount_doc_id) infoPayload.doc_id = payment.icount_doc_id;
      if (payment.icount_doc_number) infoPayload.docnum = payment.icount_doc_number;
      const { data: infoData } = await icountJson("/doc/info", infoPayload);
      console.log("[icount /doc/info sm]", JSON.stringify(infoData));

      // (1) Try cc_payments — sometimes contains the deal id directly
      const ccPayments = infoData?.cc_payments || infoData?.doc_info?.cc_payments || [];
      const ccPayArr = Array.isArray(ccPayments) ? ccPayments : Object.values(ccPayments || {});
      const foundDirect = ccPayArr.find((p: any) => p?.cc_deal_id || p?.deal_id || p?.tid)
        || (infoData?.cc_deal_id ? { cc_deal_id: infoData.cc_deal_id } : null);
      dealId = foundDirect?.cc_deal_id || foundDirect?.deal_id || foundDirect?.tid || null;

      // (2) Fallback — look up the transaction via /cc/transactions and use cc_bill_log_id
      if (!dealId) {
        const ccArr = infoData?.doc_info?.cc || infoData?.cc || [];
        const ccList = Array.isArray(ccArr) ? ccArr : Object.values(ccArr || {});
        const ccRow: any = ccList[0];
        const dateissued = infoData?.doc_info?.dateissued || infoData?.dateissued;
        if (ccRow && (ccRow.confirmation_code || ccRow.card_number)) {
          const txPayload: any = {
            ...auth,
            confirmation_code: ccRow.confirmation_code,
            cc_last4: ccRow.card_number,
            last_4_digits: ccRow.card_number,
            card_number: ccRow.card_number,
            date_from: ccRow.date || dateissued,
            date_to: ccRow.date || dateissued,
          };
          const { data: txData } = await icountJson("/cc/transactions", txPayload);
          console.log("[icount /cc/transactions sm]", JSON.stringify(txData));
          const txList = txData?.results_list || txData?.transactions || txData?.deals || txData?.data || txData?.results || [];
          const txArr = Array.isArray(txList) ? txList : Object.values(txList || {});
          const match: any = txArr.find((t: any) =>
            (ccRow.confirmation_code && String(t.confirmation_code ?? t.auth_num ?? "") === String(ccRow.confirmation_code))
          ) || txArr.find((t: any) =>
            ccRow.card_number && String(t.card_number ?? t.cc_last4 ?? t.last_4_digits ?? "").slice(-4) === String(ccRow.card_number).slice(-4)
          ) || txArr[0];
          dealId = match?.cc_bill_log_id || null;
        }
      }

      if (dealId) {
        await supabase.from("school_music_payments")
          .update({ icount_transaction_id: dealId })
          .eq("id", payment.id);
      }
    }

    const isCc = isCcMethod && !!dealId;
    if (isCc) {
      const { data: ccData } = await icountJson("/cc/refund", {
        ...auth,
        cc_deal_id: dealId,
        cc_bill_log_id: dealId,
        sum: Math.abs(requested),
      });
      console.log("[icount /cc/refund sm]", JSON.stringify(ccData));
      ccRefundResult = ccData;
      if (!ccData?.status) {
        const errMsg = ccData?.reason || ccData?.error_description || "iCount /cc/refund failed";
        return new Response(JSON.stringify({ error: errMsg, details: ccData }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else if (isCcMethod) {
      console.warn("[icount-refund-api] no cc_bill_log_id available — creating negative receipt only");
    }

    // Step 2: create negative receipt for the books
    const { data: studentRow } = await supabase
      .from("school_music_students")
      .select("student_first_name,student_last_name,parent_name,parent_phone,parent_email,city")
      .eq("id", payment.school_music_student_id)
      .maybeSingle();
    const student: any = studentRow || {};
    const studentFullName = `${student.student_first_name ?? ""} ${student.student_last_name ?? ""}`.trim();
    const isPartial = requested < original;
    const description = `החזר ${isPartial ? "חלקי " : ""}— ${studentFullName}${reason ? ` (${reason})` : ""} — קבלה מקור ${payment.icount_doc_number ?? payment.icount_doc_id} (סכום מקורי ₪${original.toLocaleString()}, החזר ₪${requested.toLocaleString()})`;

    const phone = student.parent_phone || undefined;
    const email = student.parent_email || undefined;

    const docPayload: any = {
      ...auth,
      doctype: "receipt",
      client_name: student.parent_name || studentFullName,
      client_address: student.city || undefined,
      client_city: student.city || undefined,
      client_phone: phone,
      client_mobile: phone,
      phone, mobile: phone, email,
      send_email: !!email,
      lang: "he",
      currency_code: "ILS",
      vat_free: 1,
      ...((payment.icount_doc_id || payment.icount_doc_number) ? {
        based_on: [{
          doctype: payment.icount_doc_type || "receipt",
          ...(payment.icount_doc_number ? { docnum: Number(payment.icount_doc_number) || payment.icount_doc_number } : {}),
          ...(payment.icount_doc_id ? { doc_id: payment.icount_doc_id } : {}),
        }],
        ...(payment.icount_doc_id ? { origin_doc_id: payment.icount_doc_id } : {}),
      } : {}),
      items: [{ description, unitprice_incvat: negSum, quantity: 1 }],
    };

    switch (payment.payment_method) {
      case "cash": docPayload.cash = { sum: negSum }; break;
      case "cheque": case "check":
        docPayload.cheques = [{ sum: negSum, bank: "", branch: "", account: "", num: payment.transaction_reference || "" }]; break;
      case "bank_transfer": case "transfer":
        docPayload.banktransfer = { sum: negSum, account: payment.transaction_reference || "" }; break;
      case "credit_card": case "credit": {
        const ccLine: any = {
          sum: negSum,
          num: payment.transaction_reference || "",
          payments_count: 1,
        };
        const refundConf = ccRefundResult?.confirmation_code || ccRefundResult?.auth_num;
        const refundBillLog = ccRefundResult?.cc_bill_log_id || ccRefundResult?.bill_log_id || ccRefundResult?.deal_id;
        if (refundConf) { ccLine.confirmation_code = refundConf; ccLine.auth_num = refundConf; }
        if (refundBillLog) { ccLine.cc_bill_log_id = refundBillLog; ccLine.cc_deal_id = refundBillLog; ccLine.deal_id = refundBillLog; }
        docPayload.cc = ccLine;
        break;
      }
      default: docPayload.other = { sum: negSum, info: "החזר" };
    }

    const { data: docData } = await icountJson("/doc/create", docPayload);
    console.log("[icount sm negative receipt]", JSON.stringify(docData));

    if (!docData?.status) {
      return new Response(JSON.stringify({
        error: "Negative receipt creation failed",
        details: docData,
        cc_refund: ccRefundResult,
      }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const docId = String(docData.doc_id ?? docData.docnum ?? "");
    const docNumber = String(docData.docnum ?? docData.doc_number ?? "");
    const docUrl = docData.doc_url || docData.pdf_link || docData.url || null;

    // Step 3: insert balancing credit row
    const { data: credit, error: insErr } = await supabase
      .from("school_music_payments")
      .insert({
        school_music_student_id: payment.school_music_student_id,
        school_music_school_id: payment.school_music_school_id,
        academic_year_id: payment.academic_year_id,
        amount: negSum,
        payment_status: "refunded",
        payment_method: payment.payment_method,
        paid_at: new Date().toISOString(),
        notes: reason || `החזר ${isPartial ? "חלקי " : ""}לקבלה ${payment.icount_doc_number ?? ""}`.trim(),
        refund_of_payment_id: payment.id,
        icount_doc_id: docId,
        icount_doc_number: docNumber,
        invoice_url: docUrl,
        icount_doc_type: "receipt",
        icount_transaction_id: dealId || payment.icount_transaction_id,
      })
      .select()
      .single();

    if (insErr) console.error("[icount-refund-api] insert credit row error", insErr);

    // If full refund, mark original as refunded
    if (Math.abs(requested - remaining) < 0.01 && alreadyRefunded === 0) {
      await supabase.from("school_music_payments")
        .update({ payment_status: "refunded" })
        .eq("id", payment.id);
    }

    return new Response(JSON.stringify({
      ok: true,
      partial: isPartial,
      cc_refund: !!isCc,
      doc_id: docId,
      doc_number: docNumber,
      url: docUrl,
      credit_payment_id: credit?.id,
      sent_to_email: email || null,
      refund_amount: Math.abs(requested),
      details: { cc: ccRefundResult, doc: docData },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[icount-refund-api]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
