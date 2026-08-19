// Cheque cancellation as a TRACKED PROCESS (no immediate accounting action).
//
// Stage 1 — a letter is sent to the bookkeeping office asking them to pull the
//           cheques out of the bank. Nothing is issued in iCount.
// Stage 2 — the cheques physically came back.
// Stage 3 — a bank-transfer letter is sent for the remaining difference.
// Stage 4 — the transfer is confirmed → only then the credit receipt is issued.

import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

export type ChequeRequestStatus =
  | "awaiting_cheques"
  | "awaiting_transfer"
  | "transfer_requested"
  | "completed"
  | "cancelled";

export const CHEQUE_REQUEST_STATUS_META: Record<
  ChequeRequestStatus,
  { label: string; className: string; nextLabel?: string }
> = {
  awaiting_cheques: {
    label: "ממתין למשיכת הצ׳קים מהבנק",
    className: "bg-amber-500/10 text-amber-700 border-amber-500/30",
    nextLabel: "הצ׳קים התקבלו",
  },
  awaiting_transfer: {
    label: "ממתין להעברה בנקאית",
    className: "bg-blue-500/10 text-blue-700 border-blue-500/30",
    nextLabel: "צור מכתב בקשת העברה",
  },
  transfer_requested: {
    label: "ממתין לאישור ההעברה",
    className: "bg-purple-500/10 text-purple-700 border-purple-500/30",
    nextLabel: "אושרה ההעברה — הפק קבלת זיכוי",
  },
  completed: {
    label: "הושלם",
    className: "bg-green-500/10 text-green-700 border-green-500/30",
  },
  cancelled: {
    label: "התהליך בוטל",
    className: "bg-muted text-muted-foreground border-border",
  },
};

/** Cheque bank details are stored inside the payment note when the cheque is recorded. */
export const parseChequeMeta = (notes?: string | null) => {
  const t = notes || "";
  return {
    bank: t.match(/בנק:\s*([^\s·]+)/)?.[1] || "",
    branch: t.match(/סניף:\s*([^\s·]+)/)?.[1] || "",
    account: t.match(/ח-ן:\s*([^\s·]+)/)?.[1] || "",
  };
};

export interface ChequeLetterItem {
  paymentId: string;
  chequeNumber: string;
  bank: string;
  branch: string;
  account: string;
  dueDate: string; // yyyy-MM-dd
  amount: number;
  studentName?: string;
  docNumber?: string | null;
}

const esc = (s: string) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] as string));

const d = (iso: string) => (iso ? format(new Date(iso), "dd/MM/yyyy") : "");
const money = (n: number) => `₪${Math.round(n).toLocaleString()}`;

export interface WithdrawalLetterParams {
  logoUrl?: string;
  parentName: string;
  parentNationalId: string;
  items: ChequeLetterItem[];
  reason?: string;
  signer?: string;
  orgName?: string;
  contact?: string;
}

export function buildChequeWithdrawalLetterHtml(p: WithdrawalLetterParams): string {
  const total = p.items.reduce((s, i) => s + i.amount, 0);
  const rows = p.items
    .map(
      (i, idx) => `<tr>
      <td>${idx + 1}</td>
      <td>${esc(i.chequeNumber)}</td>
      <td>${esc(i.bank)}</td>
      <td>${esc(i.branch)}</td>
      <td>${esc(i.account)}</td>
      <td>${d(i.dueDate)}</td>
      <td>${esc(i.studentName ?? "")}</td>
      <td>${esc(i.docNumber ?? "")}</td>
      <td dir="ltr">${money(i.amount)}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="utf-8">
<title>בקשה למשיכת צ׳קים</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: "Arial","Helvetica",sans-serif; direction: rtl; color:#111; font-size:14px; line-height:1.8; }
  .logo { max-height: 84px; margin-bottom: 8px; }
  .date { font-size: 13px; color:#444; }
  h1 { font-size: 17px; margin: 16px 0 10px; text-decoration: underline; }
  table { width:100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
  th, td { border:1px solid #bbb; padding:6px 8px; text-align:right; }
  th { background:#f2f4f7; }
  tfoot td { font-weight:700; background:#fafafa; }
  .sig { margin-top: 28px; }
</style></head><body>
${p.logoUrl ? `<img class="logo" src="${p.logoUrl}" alt="" />` : ""}
<div class="date">${format(new Date(), "dd/MM/yyyy")}</div>
<h1>הנדון: בקשה למשיכת צ׳קים מהבנק וביטולם</h1>
<p>שלום רב,</p>
<p>
  מבקשים למשוך מהבנק ולבטל את הצ׳קים המפורטים להלן, שנמסרו על ידי
  <strong>${esc(p.parentName)}</strong> (ת״ז ${esc(p.parentNationalId)})${p.reason ? `, בעקבות ${esc(p.reason)}` : ""}.
</p>
<table>
  <thead><tr>
    <th>#</th><th>מס׳ צ׳ק</th><th>בנק</th><th>סניף</th><th>חשבון</th>
    <th>תאריך פירעון</th><th>תלמיד</th><th>קבלה</th><th>סכום</th>
  </tr></thead>
  <tbody>${rows}</tbody>
  <tfoot><tr><td colspan="8">סה״כ</td><td dir="ltr">${money(total)}</td></tr></tfoot>
</table>
<p>
  לאחר קבלת הצ׳קים בחזרה מהבנק, נעביר בקשה נפרדת לזיכוי יתרת ההפרש להורה בהעברה בנקאית,
  ורק לאחר אישור ההעברה תופק קבלת הזיכוי.
</p>
<div class="sig">
  בברכה,<br/>
  ${esc(p.signer ?? "")}<br/>
  ${esc(p.orgName ?? "")}<br/>
  ${esc(p.contact ?? "")}
</div>
</body></html>`;
}

export interface CreateRequestParams {
  items: ChequeLetterItem[];
  parentName: string;
  parentNationalId: string;
  studentId?: string | null;
  academicYearId?: string | null;
  creditDue?: number;
  reason?: string;
  logoUrl?: string;
  signer?: string;
  orgName?: string;
  contact?: string;
}

/**
 * Stage 1: create the tracking record, mark the cheques as "pending cancellation"
 * (they drop out of the totals) and generate + archive the bookkeeping letter.
 * No iCount document is created here.
 */
export async function createChequeWithdrawalRequest(p: CreateRequestParams) {
  if (!p.items.length) throw new Error("לא נבחרו צ׳קים");
  const total = p.items.reduce((s, i) => s + i.amount, 0);
  const html = buildChequeWithdrawalLetterHtml(p);
  const { data: userRes } = await supabase.auth.getUser();

  const { data: req, error: reqErr } = await supabase
    .from("cheque_cancellation_requests")
    .insert({
      academic_year_id: p.academicYearId ?? null,
      student_id: p.studentId ?? null,
      family_parent_national_id: p.parentNationalId || null,
      parent_name: p.parentName || null,
      status: "awaiting_cheques",
      cheques_total: total,
      credit_due: p.creditDue ?? 0,
      refund_amount: Math.max(0, Math.round(((p.creditDue ?? 0) - total) * 100) / 100),
      reason: p.reason ?? null,
      requested_by: userRes?.user?.id ?? null,
    })
    .select()
    .single();
  if (reqErr) throw reqErr;

  const { error: itemsErr } = await supabase.from("cheque_cancellation_request_items").insert(
    p.items.map((i) => ({
      request_id: req.id,
      payment_id: i.paymentId,
      cheque_number: i.chequeNumber || null,
      bank: i.bank || null,
      branch: i.branch || null,
      account: i.account || null,
      due_date: i.dueDate || null,
      amount: i.amount,
    })),
  );
  if (itemsErr) throw itemsErr;

  const { error: updErr } = await supabase
    .from("student_payments")
    .update({ cheque_status: "pending_cancellation" } as any)
    .in("id", [...new Set(p.items.map((i) => i.paymentId))]);
  if (updErr) throw updErr;

  // Archive the letter (best effort — the process itself is already recorded).
  let docId: string | null = null;
  try {
    const path = `${p.studentId || "family"}/${Date.now()}-cheque-withdrawal-letter.html`;
    await supabase.storage
      .from("refund-documents")
      .upload(path, new Blob([html], { type: "text/html;charset=utf-8" }), {
        contentType: "text/html;charset=utf-8",
      });
    const { data: doc } = await supabase
      .from("refund_documents")
      .insert({
        student_id: p.studentId ?? null,
        academic_year_id: p.academicYearId ?? null,
        doc_type: "cheque_withdrawal_letter",
        title: `בקשה למשיכת ${p.items.length} צ׳קים — ${p.parentName || ""}`.trim(),
        parent_name: p.parentName || null,
        refund_amount: total,
        content_html: html,
        file_path: path,
        created_by: userRes?.user?.id ?? null,
      })
      .select("id")
      .single();
    docId = doc?.id ?? null;
    if (docId) {
      await supabase
        .from("cheque_cancellation_requests")
        .update({ withdrawal_letter_id: docId })
        .eq("id", req.id);
    }
  } catch {
    /* letter archiving is not critical */
  }

  return { requestId: req.id as string, html, total, docId };
}

/** Opens an HTML letter in a new tab and triggers the print dialog. */
export function openLetter(html: string) {
  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 500);
  return true;
}
