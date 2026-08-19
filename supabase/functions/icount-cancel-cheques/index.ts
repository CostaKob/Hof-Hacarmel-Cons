// Cancels one or more FUTURE (uncleared) cheques out of an existing receipt.
// Accounting-wise there is no "cancel a cheque" API in iCount: the original receipt
// already recognised the full amount, so the correct move is ONE negative receipt
// (קבלת זיכוי) for the sum of the cancelled cheques, listing exactly those cheques in
// the `cheques` array (number / bank / branch / account / due date, negative sums).
// The cancelled rows are marked cheque_status = 'cancelled' and linked to the credit row.
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

const parseChequeMeta = (notes: string | null) => {
  const t = notes || "";
  return {
    bank: t.match(/בנק:\s*([^\s·]+)/)?.[1] || "",
    branch: t.match(/סניף:\s*([^\s·]+)/)?.[1] || "",
    account: t.match(/ח-ן:\s*([^\s·]+)/)?.[1] || "",
  };
};

const fmtDate = (d?: string | null) => (d ? d.split("T")[0].split("-").reverse().join("/") : "");

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFail = await requireAdminOrSecretary(req, corsHeaders);
  if (authFail) return authFail;

  try {
    const { paymentIds, reason, allowCancelled, refundAmount, refundReference, refundDate } = await req.json();
    // Part of the credit can be a real bank transfer back to the parent (money that
    // was already cleared); it appears as an extra negative line on the same receipt.
    const transferAmount = Math.abs(Number(refundAmount || 0));
    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return new Response(JSON.stringify({ error: "paymentIds required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: rows, error: rowsErr } = await supabase
      .from("student_payments")
      .select("*, students(first_name,last_name,address,city,parent_name,parent_phone,parent_phone_2,parent_email,parent_email_2)")
      .in("id", paymentIds)
      .order("payment_date", { ascending: true });

    if (rowsErr || !rows?.length) {
      return new Response(JSON.stringify({ error: "payments not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // When the cancellation went through the tracked workflow the rows are already
    // marked "cancelled" — the credit receipt is issued only at the final stage.
    const bad = allowCancelled
      ? rows.find((r: any) => r.cheque_cancel_credit_id)
      : rows.find((r: any) => r.cheque_status === "cancelled");
    if (bad) {
      return new Response(JSON.stringify({ error: "אחד הצ׳קים כבר בוטל" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const head: any = rows.find((r: any) => r.icount_doc_id) ?? rows[0];
    if (!head.icount_doc_id) {
      return new Response(JSON.stringify({ error: "לא הופקה קבלה מקורית לצ׳קים אלו" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Full transaction total (all rows of the original receipt / spread), not just the cancelled ones.
    let allRows = rows;
    if (head.payment_group_id) {
      const { data: g } = await supabase
        .from("student_payments")
        .select("id, amount, payment_date, reference_number, notes, cheque_status")
        .eq("payment_group_id", head.payment_group_id)
        .eq("transaction_type", "payment")
        .order("payment_date", { ascending: true });
      if (g?.length) allRows = g as any;
    }
    const transactionTotal = allRows.reduce((s: number, r: any) => s + Math.abs(Number(r.amount || 0)), 0);
    const cancelTotal = rows.reduce((s: number, r: any) => s + Math.abs(Number(r.amount || 0)), 0);

    const auth = getAuth();
    const student: any = head.students || {};
    const studentFullName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
    const phone = student.parent_phone || student.parent_phone_2 || undefined;
    const email = student.parent_email || student.parent_email_2 || undefined;
    const negSum = -Math.abs(cancelTotal);

    const chequeList = rows
      .map((r: any) => `• צ׳ק ${r.reference_number ?? ""} · ${fmtDate(r.payment_date)} · ₪${Math.abs(Number(r.amount || 0)).toLocaleString()}`)
      .join("\n");

    const description =
      `ביטול צ׳קים עתידיים — ${studentFullName}${reason ? ` (${reason})` : ""} — ` +
      `קבלה מקור ${head.icount_doc_number ?? head.icount_doc_id} ` +
      `(סכום העסקה ₪${transactionTotal.toLocaleString()}, בוטלו ${rows.length} צ׳קים בסך ₪${cancelTotal.toLocaleString()})`;

    // One document line per cancelled cheque (clearer than one long paragraph)
    const chequeItems = rows.map((r: any) => ({
      description: `צ׳ק ${r.reference_number ?? ""} · ${fmtDate(r.payment_date)} · בוטל`,
      unitprice_incvat: -Math.abs(Number(r.amount || 0)),
      quantity: 1,
    }));


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
      based_on: [{
        doctype: head.icount_doc_type || "receipt",
        ...(head.icount_doc_number ? { docnum: Number(head.icount_doc_number) || head.icount_doc_number } : {}),
        ...(head.icount_doc_id ? { doc_id: head.icount_doc_id } : {}),
      }],
      based_on_docs: [{
        doctype: head.icount_doc_type || "receipt",
        docnum: Number(head.icount_doc_number) || head.icount_doc_number || head.icount_doc_id,
      }],
      origin_doc_id: head.icount_doc_id,
      comments: description,
      doc_comment: description,
      items: chequeItems.length ? chequeItems : [{ description, unitprice_incvat: negSum, quantity: 1 }],

      cheques: rows.map((r: any) => {
        const meta = parseChequeMeta(r.notes);
        const num = String(r.reference_number || "");
        return {
          sum: -Math.abs(Number(r.amount || 0)),
          date: r.payment_date || undefined,
          bank: meta.bank,
          branch: meta.branch,
          account: meta.account,
          num,
          number: num,
          cheque_num: num,
        };
      }),
    };

    const res = await fetch(`${ICOUNT_BASE}/doc/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log("[icount cancel cheques]", JSON.stringify(data));

    if (!data.status) {
      return new Response(JSON.stringify({ error: "icount failed", details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docId = String(data.doc_id ?? data.docnum ?? "");
    const docNumber = String(data.docnum ?? data.doc_number ?? "");
    const docUrl = data.doc_url || data.pdf_link || data.url || null;

    try {
      const closePayload: any = { ...auth, doctype: "receipt" };
      if (docNumber) closePayload.docnum = Number(docNumber) || docNumber;
      if (docId) closePayload.doc_id = docId;
      await fetch(`${ICOUNT_BASE}/doc/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(closePayload),
      });
    } catch (e) {
      console.warn("[icount /doc/close cancel] failed", e);
    }

    const today = new Date().toISOString().slice(0, 10);

    const { data: credit, error: insErr } = await supabase
      .from("student_payments")
      .insert({
        student_id: head.student_id,
        enrollment_id: head.enrollment_id,
        academic_year_id: head.academic_year_id,
        family_payment_group_id: head.family_payment_group_id,
        family_parent_national_id: head.family_parent_national_id,
        amount: negSum,
        transaction_type: "credit",
        payment_method: "check",
        payment_date: today,
        notes: [
          reason || "ביטול צ׳קים עתידיים",
          `קבלה מקור ${head.icount_doc_number ?? ""}`.trim(),
          chequeList,
        ].filter(Boolean).join(" · "),
        refund_of_payment_id: head.id,
        icount_doc_id: docId,
        icount_doc_number: docNumber,
        invoice_url: docUrl,
        icount_doc_type: "receipt",
      })
      .select()
      .single();

    if (insErr) console.error("[insert cancel credit row]", insErr);

    const { error: updErr } = await supabase
      .from("student_payments")
      .update({
        cheque_status: "cancelled",
        cheque_cancelled_at: today,
        cheque_cancel_credit_id: credit?.id ?? null,
      })
      .in("id", rows.map((r: any) => r.id));
    if (updErr) console.error("[mark cheques cancelled]", updErr);

    return new Response(JSON.stringify({
      ok: true, doc_id: docId, doc_number: docNumber, url: docUrl,
      credit_payment_id: credit?.id, cancelled_count: rows.length, cancelled_amount: cancelTotal,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[icount-cancel-cheques]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
