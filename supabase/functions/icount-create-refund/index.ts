// Creates a NEGATIVE iCount RECEIPT (קבלה במינוס) for a refund, linked to the original
// receipt via `based_on`. Malkar (Non-Profit) cannot issue Tax Invoices or Credit Invoices —
// refunds are issued as a negative Receipt. Inserts a matching credit row into student_payments.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFail = await requireAdminOrSecretary(req, corsHeaders);
  if (authFail) return authFail;



  try {
    const {
      paymentId,
      amount: amountOverride,
      reason,
      refundMethod,
      bankReference,
      bankTransferDate,
      bankDetails,
    } = await req.json();
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

    // The "original amount" must reflect the WHOLE transaction (all cheques of a spread),
    // not just the single row the refund was triggered from.
    let groupRows: any[] = [payment];
    if (payment.payment_group_id) {
      const { data: g } = await supabase
        .from("student_payments")
        .select("id, amount, payment_date, reference_number, payment_method, cheque_status")
        .eq("payment_group_id", payment.payment_group_id)
        .eq("transaction_type", "payment")
        .order("payment_date", { ascending: true });
      if (g?.length) groupRows = g;
    }
    const fmtD = (d?: string | null) => (d ? String(d).split("T")[0].split("-").reverse().join("/") : "");
    const originalAmount = groupRows.reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
    const refundAmount = Number(amountOverride ?? originalAmount);
    const isPartial = Math.abs(refundAmount) < Math.abs(originalAmount);
    const bankSuffix = refundMethod === "bank_transfer"
      ? ` — בוצע בהעברה בנקאית${bankReference ? ` (אסמכתא ${bankReference})` : ""}`
      : "";
    const STATUS_HE: Record<string, string> = { cleared: "נפרע", cancelled: "בוטל", pending: "טרם נפרע" };
    const isChequeSpread = groupRows.length > 1 && groupRows.every((r) => r.payment_method === "check" || r.payment_method === "cheque");
    const headerLine = `החזר ${isPartial ? "חלקי " : ""}— ${studentFullName}${reason ? ` (${reason})` : ""} — קבלה מקור ${payment.icount_doc_number ?? payment.icount_doc_id} (סכום מקורי ₪${Math.abs(originalAmount).toLocaleString()}, החזר ₪${Math.abs(refundAmount).toLocaleString()})${bankSuffix}`;
    // Full refund of a cheque spread → one document line per cheque (clearer to read).
    const perChequeItems = (!isPartial && isChequeSpread)
      ? groupRows.map((r) => ({
          description: `צ׳ק ${r.reference_number ?? ""} · ${fmtD(r.payment_date)} · ${STATUS_HE[r.cheque_status ?? "pending"] ?? "טרם נפרע"}`,
          unitprice_incvat: -Math.abs(Number(r.amount || 0)),
          quantity: 1,
        }))
      : null;
    const chequeDetail = perChequeItems
      ? ""
      : (groupRows.length > 1 || groupRows[0]?.payment_method === "check"
        ? `\nפירוט צ׳קים:\n${groupRows
            .map((r) => `• צ׳ק ${r.reference_number ?? ""} · ${fmtD(r.payment_date)} · ₪${Math.abs(Number(r.amount || 0)).toLocaleString()} · ${STATUS_HE[r.cheque_status ?? "pending"] ?? "טרם נפרע"}`)
            .join("\n")}`
        : "");
    const description = `${headerLine}${chequeDetail}`;


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
      // Link the credit document to the ORIGINAL charge document in iCount.
      // iCount expects an object descriptor (doctype + docnum/doc_id) — a bare id is ignored.
      based_on: [{
        doctype: payment.icount_doc_type || "receipt",
        ...(payment.icount_doc_number ? { docnum: Number(payment.icount_doc_number) || payment.icount_doc_number } : {}),
        ...(payment.icount_doc_id ? { doc_id: payment.icount_doc_id } : {}),
      }],
      based_on_docs: [{
        doctype: payment.icount_doc_type || "receipt",
        docnum: Number(payment.icount_doc_number) || payment.icount_doc_number || payment.icount_doc_id,
      }],
      origin_doc_id: payment.icount_doc_id,
      comments: perChequeItems ? headerLine : undefined,
      doc_comment: perChequeItems ? headerLine : undefined,
      items: perChequeItems ?? [{ description, unitprice_incvat: negSum, quantity: 1 }],
    };


    const isBankRefund = refundMethod === "bank_transfer";

    if (isBankRefund) {
      // Refund executed by bank transfer (regardless of the original payment method).
      payload.banktransfer = {
        sum: negSum,
        account: bankDetails?.accountNumber || bankReference || "",
        bank: bankDetails?.bankNumber || bankDetails?.bankName || "",
        branch: bankDetails?.branch || "",
        ref: bankReference || "",
        num: bankReference || "",
        date: bankTransferDate || undefined,
      };
    } else {
      // Mirror the original payment method on the refund side with a negative sum
      // so the negative receipt is balanced. NOTE: the DB enum values are
      // cash | check | transfer | credit_card | other.
      const today = new Date().toISOString().slice(0, 10);
      switch (payment.payment_method) {
        case "cash":
          payload.cash = { sum: negSum };
          break;
        case "check":
        case "cheque":
          payload.cheques = perChequeItems
            ? groupRows.map((r) => ({
                sum: -Math.abs(Number(r.amount || 0)),
                date: r.payment_date || today,
                num: r.reference_number || "",
                bank: "",
                branch: "",
                account: "",
              }))
            : [{
                sum: negSum,
                date: today,
                num: payment.reference_number || "",
                bank: "",
                branch: "",
                account: "",
              }];
          break;

        case "transfer":
        case "bank_transfer":
          payload.banktransfer = { sum: negSum, date: today, account: payment.reference_number || "" };
          break;
        case "credit_card":
          payload.cc = { sum: negSum, num: payment.reference_number || "", payments_count: payment.installments || 1 };
          break;
        default:
          payload.cash = { sum: negSum };
      }
    }


    const res = await fetch(`${ICOUNT_BASE}/doc/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log("[icount negative receipt]", JSON.stringify(data));

    if (!data.status) {
      const reason = data.error_description || data.reason || data.message || data.status_description || "שגיאה לא ידועה מ-iCount";
      return new Response(JSON.stringify({ error: `iCount: ${reason}`, details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    const docId = String(data.doc_id ?? data.docnum ?? "");
    const docNumber = String(data.docnum ?? data.doc_number ?? "");
    const docUrl = data.doc_url || data.pdf_link || data.url || null;

    // Close the negative receipt so it doesn't remain open with -1 balance
    try {
      const closePayload: any = { cid: auth.cid, user: auth.user, pass: auth.pass, doctype: "receipt" };
      if (docNumber) closePayload.docnum = Number(docNumber) || docNumber;
      if (docId) closePayload.doc_id = docId;
      const closeRes = await fetch(`${ICOUNT_BASE}/doc/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(closePayload),
      });
      const closeData = await closeRes.json().catch(() => ({}));
      console.log("[icount /doc/close refund]", JSON.stringify(closeData));
    } catch (e) {
      console.warn("[icount /doc/close refund] failed", e);
    }

    // Insert credit row
    const { data: credit, error: insErr } = await supabase
      .from("student_payments")
      .insert({
        student_id: payment.student_id,
        enrollment_id: payment.enrollment_id,
        academic_year_id: payment.academic_year_id,
        amount: negSum,
        transaction_type: "credit",
        payment_method: isBankRefund ? "transfer" : payment.payment_method,
        reference_number: isBankRefund ? (bankReference || null) : null,
        payment_date: (isBankRefund && bankTransferDate) ? bankTransferDate : new Date().toISOString().slice(0, 10),
        notes: isBankRefund
          ? [
              reason || `החזר לקבלה ${payment.icount_doc_number ?? ""}`.trim(),
              "העברה בנקאית",
              bankReference ? `אסמכתא: ${bankReference}` : "",
              bankDetails?.bankName ? `בנק: ${bankDetails.bankName}${bankDetails?.bankNumber ? ` ${bankDetails.bankNumber}` : ""}` : "",
              bankDetails?.branch ? `סניף: ${bankDetails.branch}` : "",
              bankDetails?.accountNumber ? `ח-ן: ${bankDetails.accountNumber}` : "",
            ].filter(Boolean).join(" · ")
          : (reason || `החזר לקבלה ${payment.icount_doc_number ?? ""}`.trim()),
        refund_of_payment_id: payment.id,
        icount_doc_id: docId,
        icount_doc_number: docNumber,
        invoice_url: docUrl,
        icount_doc_type: "receipt",
      })
      .select()
      .single();

    if (insErr || !credit) {
      console.error("[insert credit row]", insErr);
      return new Response(JSON.stringify({ error: "קבלת הזיכוי הופקה, אך רישום הזיכוי במערכת נכשל", details: insErr }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      ok: true, doc_id: docId, doc_number: docNumber, url: docUrl, credit_payment_id: credit.id,
      sent_to_email: email || null, refund_amount: Math.abs(refundAmount),
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[icount-create-refund]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
