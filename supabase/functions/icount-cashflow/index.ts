// Cashflow report built from REAL iCount documents (no forecasts).
// Pulls documents via doc/search, loads payment details via doc/get,
// and expands every document into actual due-date rows:
//   cash / bank transfer / other -> document date
//   cheques                      -> each cheque's own due date
//   credit card                  -> split across the billing months (payments_count)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdminOrSecretary } from "../_shared/requireAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php";

// Clean slate (13/08/2026): everything issued up to document 1110 was test data,
// except the two real tuition receipts below. Every document issued from now on
// (number > the cutoff) is included automatically.
const LEGACY_CUTOFF_DOCNUM = 1110;
const LEGACY_KEPT_DOC_NUMBERS = new Set(["1095", "1110"]);

// Specific iCount documents that must never appear in cashflow or warnings.
// 1113/1114 = תשלום טסט של 9 ₪ שבוטל מיד ולא נסלק בפועל.
const ICOUNT_IGNORED_DOC_NUMBERS = new Set(["7003", "1113", "1114"]);

// System-side payment records that should not be compared to iCount (test/noise).
const SYSTEM_IGNORED_DOC_NUMBERS = new Set(["3005", "3006", "3007", "5005", "1113", "1114"]);

function isExcludedDoc(docNumber: string): boolean {
  const dn = String(docNumber ?? "").trim();
  if (!dn) return false;
  if (ICOUNT_IGNORED_DOC_NUMBERS.has(dn)) return true;
  if (LEGACY_KEPT_DOC_NUMBERS.has(dn)) return false;
  const n = Number(dn);
  if (!Number.isFinite(n)) return false;
  return n <= LEGACY_CUTOFF_DOCNUM;
}

function isSystemIgnoredDoc(docNumber: string): boolean {
  const dn = String(docNumber ?? "").trim();
  return dn ? SYSTEM_IGNORED_DOC_NUMBERS.has(dn) : false;
}


function getAuth() {
  const cid = Deno.env.get("ICOUNT_COMPANY_ID");
  const user = Deno.env.get("ICOUNT_USERNAME");
  const pass = Deno.env.get("ICOUNT_PASSWORD");
  if (!cid || !user || !pass) throw new Error("ICOUNT credentials missing");
  return { cid, user, pass };
}

async function icount(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${ICOUNT_BASE}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

const pad = (n: number) => String(n).padStart(2, "0");
const toCompact = (iso: string) => iso.replaceAll("-", "");

function normDate(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return null;
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(Math.min(d, lastDay))}`;
}

const num = (v: unknown) => {
  const n = Number(String(v ?? "").replace(/[^\d.\-]/g, ""));
  return isNaN(n) ? 0 : n;
};

function asArray(v: unknown): any[] {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    // iCount returns a single payment either as a keyed map of payment objects
    // ({"0": {...}}) or as one flat payment object ({sum: 2470, date: ...}).
    // A flat object must stay one record — splitting it into its values loses
    // the sum, and the document silently drops out of the cashflow.
    const values = Object.values(obj);
    const looksFlat = values.some((x) => x === null || typeof x !== "object");
    return looksFlat ? [obj] : values;
  }
  return [];
}

type Row = {
  due_date: string;
  month: string;
  method: "cash" | "cheque" | "credit" | "transfer" | "other";
  amount: number;
  client_name: string;
  doc_id: string;
  doc_number: string;
  doc_type: string;
  doc_date: string;
  doc_url: string | null;
  note: string;
  source: "students" | "school_music" | "external";
};

// Credit-card money does not arrive on the transaction date — the clearing house
// settles it on a fixed day of the following month (default: the 2nd).
function settlementDate(iso: string, day: number): string {
  const [y, m] = iso.split("-").map(Number);
  const base = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  return `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-${pad(Math.min(day, lastDay))}`;
}

function expandDoc(doc: any, ccDay: number): Omit<Row, "source">[] {
  const docDate = normDate(doc.dateissued ?? doc.doc_date ?? doc.date ?? doc.issue_date) ?? "";
  const meta = {
    client_name: String(doc.client_name ?? doc.custname ?? "").trim(),
    doc_id: String(doc.doc_id ?? doc.docnum ?? ""),
    doc_number: String(doc.docnum ?? doc.doc_number ?? ""),
    doc_type: String(doc.doctype ?? doc.doc_type ?? ""),
    doc_date: docDate,
    doc_url: doc.doc_url ?? doc.pdf_link ?? doc.url ?? null,
  };
  const out: Omit<Row, "source">[] = [];
  const push = (due: string | null, method: Row["method"], amount: number, note: string) => {
    const d = due || docDate;
    if (!d || !amount) return;
    out.push({ ...meta, due_date: d, month: d.slice(0, 7), method, amount, note });
  };

  // Cheques — each with its own due date
  for (const c of asArray(doc.cheques)) {
    const chequeNum = c.num ?? c.number ?? c.cheque_num ?? "";
    push(normDate(c.date ?? c.cheque_date), "cheque", num(c.sum ?? c.amount),
      chequeNum ? `תשלום בשיק מספר ${chequeNum}` : "תשלום בשיק");
  }

  // Credit card — split across the actual billing months
  for (const cc of asArray(doc.cc)) {
    const total = num(cc.sum ?? cc.amount);
    const count = Math.max(1, Number(cc.num_of_payments ?? cc.payments_count ?? 1) || 1);
    const first = settlementDate(normDate(cc.date ?? cc.charge_date) ?? docDate, ccDay);
    const last4 = String(cc.card_number ?? cc.num ?? "").slice(-4);
    const firstAmount = count > 1 && num(cc.first_payment) ? num(cc.first_payment) : Math.round((total / count) * 100) / 100;
    const rest = count > 1 ? Math.round(((total - firstAmount) / (count - 1)) * 100) / 100 : 0;
    let allocated = 0;
    for (let i = 0; i < count; i++) {
      let amt = i === 0 ? firstAmount : rest;
      if (i === count - 1) amt = Math.round((total - allocated) * 100) / 100;
      allocated = Math.round((allocated + amt) * 100) / 100;
      const label = count > 1 ? `תשלום ${i + 1} מתוך ${count} בכרטיס אשראי` : "תשלום בכרטיס אשראי";
      push(addMonths(first, i), "credit", amt, last4 ? `${label} המסתיים ב- ${last4}` : label);
    }
  }

  for (const c of asArray(doc.cash)) push(normDate(c.date), "cash", num(c.sum ?? c.amount), "תשלום במזומן");
  for (const b of asArray(doc.banktransfer)) push(normDate(b.date), "transfer", num(b.sum ?? b.amount), "העברה בנקאית");
  for (const o of asArray(doc.paypal)) push(normDate(o.date), "other", num(o.sum ?? o.amount), "PayPal");
  for (const o of asArray(doc.barter)) push(normDate(o.date), "other", num(o.sum ?? o.amount), "אחר");

  return out;
}


Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFail = await requireAdminOrSecretary(req, corsHeaders);
  if (authFail) return authFail;

  try {
    const { startDate, endDate, debug, creditSettlementDay } = await req.json();
    const ccDay = Math.min(28, Math.max(1, Number(creditSettlementDay) || 2));
    if (!startDate || !endDate) {
      return new Response(JSON.stringify({ error: "startDate and endDate required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const auth = getAuth();

    // Documents can be issued long before their cheques/credit installments fall due,
    // so search a wider window and filter by the real due dates afterwards.
    const searchFrom = addMonths(startDate, -30);
    const searchTo = addMonths(endDate, 1);

    // iCount caps a single search at 100 results — paginate.
    const list: any[] = [];
    const warnings: string[] = [];
    let lastRaw: any = null;
    let truncated = true;
    for (let offset = 0; offset < 5000; offset += 100) {
      let search: any;
      try {
        search = await icount("doc/search", {
          ...auth,
          start_date: toCompact(searchFrom),
          end_date: toCompact(searchTo),
          from_date: searchFrom,
          to_date: searchTo,
          detail_level: 10,
          max_results: 100,
          limit: 100,
          offset,
        });
      } catch (err) {
        if (offset === 0) throw err;
        warnings.push(`שליפת מסמכים נכשלה החל ממסמך ${offset + 1} (${(err as Error).message}) — ייתכן שחסרות תנועות בדוח.`);
        truncated = false;
        break;
      }
      lastRaw = search;
      if (search && search.status === false) {
        if (offset > 0 && search.reason === "no_results") { truncated = false; break; }
        const reason = search.error_description || search.reason || search.message || "שגיאה מ-iCount";
        return new Response(JSON.stringify({ error: `iCount: ${reason}`, details: search }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const page = asArray(search.results_list ?? search.docs ?? search.results ?? search.data);
      list.push(...page);
      if (page.length < 100) { truncated = false; break; }
    }
    if (truncated) {
      warnings.push("נסרקו 5,000 מסמכים (מקסימום) — ייתכן שיש מסמכים נוספים שלא נכללו בדוח.");
    }


    if (debug) {
      const withCc = list.filter((d) => asArray(d.cc).length).slice(-5);
      return new Response(JSON.stringify({ count: list.length, withCc, lastRaw: lastRaw?.status }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // doc/search with detail_level 10 already returns the payment breakdown.
    // Cancelled documents are real-world reversals and must not be counted.
    // Legacy test documents (up to the cutoff) are excluded permanently.
    const details = list.filter((d) => {
      const dn = String(d.docnum ?? d.doc_number ?? "").trim();
      return !Number(d.is_cancelled) && !Number(d.is_cancellation) &&
        !isExcludedDoc(dn);
    });
    // Cancelled documents and their cancellation receipts net to zero and are
    // intentionally excluded from the cashflow — don't report them as gaps.
    const cancelledDocNums = new Set<string>();
    for (const d of list) {
      if (Number(d.is_cancelled) || Number(d.is_cancellation)) {
        const dn = String(d.docnum ?? d.doc_number ?? "").trim();
        if (dn) cancelledDocNums.add(dn);
      }
    }

    let rows: Omit<Row, "source">[] = [];
    const unparsed: string[] = [];
    for (const d of details) {
      const expanded = expandDoc(d, ccDay);
      rows.push(...expanded);
      const total = num(d.doc_total ?? d.total ?? d.totalsum ?? d.sum);
      if (!expanded.length && total) {
        unparsed.push(String(d.docnum ?? d.doc_number ?? d.doc_id ?? "?"));
      }
    }
    if (unparsed.length) {
      warnings.push(
        `${unparsed.length} מסמכים לא נפרסו לתנועות פרעון (ללא פרטי תשלום מזוהים): ${unparsed.slice(0, 15).join(", ")}${unparsed.length > 15 ? "…" : ""}`,
      );
    }
    // Doc-level totals from iCount (before the due-date filter) for reconciliation.
    const icountByDoc = new Map<string, { total: number; client: string; date: string; doc_id: string }>();
    for (const r of rows) {
      if (!r.doc_number) continue;
      const cur = icountByDoc.get(r.doc_number) ?? { total: 0, client: r.client_name, date: r.doc_date, doc_id: r.doc_id };
      cur.total = Math.round((cur.total + r.amount) * 100) / 100;
      icountByDoc.set(r.doc_number, cur);
    }

    rows = rows.filter((r) => r.due_date >= startDate && r.due_date <= endDate);



    // Classify each row against our own records (students vs school music).
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const [sp, smp] = await Promise.all([
      supabase.from("student_payments")
        .select("icount_doc_id,icount_doc_number,amount,payment_date,payment_status")
        .not("icount_doc_number", "is", null)
        .gte("payment_date", searchFrom).lte("payment_date", searchTo),
      supabase.from("school_music_payments")
        .select("icount_doc_id,icount_doc_number,amount,created_at,payment_status")
        .not("icount_doc_number", "is", null),
    ]);
    if (sp.error) warnings.push(`שיוך תנועות לתלמידים נכשל: ${sp.error.message}`);
    if (smp.error) warnings.push(`שיוך תנועות לבית ספר מנגן נכשל: ${smp.error.message}`);

    const studentKeys = new Set<string>();
    const smKeys = new Set<string>();
    const systemByDoc = new Map<string, { total: number; source: "students" | "school_music" }>();
    const addSystem = (docNum: string, amount: number, source: "students" | "school_music") => {
      const cur = systemByDoc.get(docNum) ?? { total: 0, source };
      cur.total = Math.round((cur.total + amount) * 100) / 100;
      systemByDoc.set(docNum, cur);
    };
    for (const p of sp.data ?? []) {
      if (p.icount_doc_id) studentKeys.add(String(p.icount_doc_id));
      if (p.icount_doc_number) {
        studentKeys.add(String(p.icount_doc_number));
        if (!isExcludedDoc(String(p.icount_doc_number)) && !isSystemIgnoredDoc(String(p.icount_doc_number))) {
          addSystem(String(p.icount_doc_number), Number(p.amount) || 0, "students");
        }
      }
    }
    for (const p of smp.data ?? []) {
      if (p.icount_doc_id) smKeys.add(String(p.icount_doc_id));
      if (p.icount_doc_number) {
        smKeys.add(String(p.icount_doc_number));
        if (!isExcludedDoc(String(p.icount_doc_number)) && !isSystemIgnoredDoc(String(p.icount_doc_number))) {
          addSystem(String(p.icount_doc_number), Number(p.amount) || 0, "school_music");
        }
      }
    }

    const finalRows: Row[] = rows.map((r) => ({
      ...r,
      source: studentKeys.has(r.doc_id) || studentKeys.has(r.doc_number)
        ? "students"
        : smKeys.has(r.doc_id) || smKeys.has(r.doc_number)
          ? "school_music"
          : "external",
    }));

    finalRows.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.doc_number.localeCompare(b.doc_number));

    // Reconciliation between iCount documents and our own payment records.
    // Only documents that belong to our students / school-music payments are compared;
    // unidentified (external) documents are reported separately so they don't skew the totals.
    const missing_in_system: { doc_number: string; amount: number; client_name: string; doc_date: string }[] = [];
    const amount_mismatches: { doc_number: string; icount_amount: number; system_amount: number; client_name: string }[] = [];
    let icount_matched_total = 0;
    let external_total = 0;
    for (const [docNum, info] of icountByDoc) {
      const sys = systemByDoc.get(docNum);
      const isOurs = sys || studentKeys.has(docNum) || studentKeys.has(info.doc_id) || smKeys.has(docNum) || smKeys.has(info.doc_id);
      if (!isOurs) {
        external_total = Math.round((external_total + info.total) * 100) / 100;
        missing_in_system.push({ doc_number: docNum, amount: info.total, client_name: info.client, doc_date: info.date });
        continue;
      }
      icount_matched_total = Math.round((icount_matched_total + info.total) * 100) / 100;
      if (!sys) {
        missing_in_system.push({ doc_number: docNum, amount: info.total, client_name: info.client, doc_date: info.date });
      } else if (Math.abs(sys.total - info.total) > 0.5) {
        amount_mismatches.push({ doc_number: docNum, icount_amount: info.total, system_amount: sys.total, client_name: info.client });
      }
    }
    const missing_in_icount: { doc_number: string; amount: number; source: string }[] = [];
    for (const [docNum, sys] of systemByDoc) {
      if (!icountByDoc.has(docNum) && !cancelledDocNums.has(docNum)) missing_in_icount.push({ doc_number: docNum, amount: sys.total, source: sys.source });
    }
    const sum = (ns: number[]) => Math.round(ns.reduce((a, b) => a + b, 0) * 100) / 100;
    const reconciliation = {
      icount_total: icount_matched_total,
      system_total: sum([...systemByDoc.values()].map((v) => v.total)),
      external_total,
      missing_in_system: missing_in_system.sort((a, b) => a.doc_number.localeCompare(b.doc_number)).slice(0, 100),
      missing_in_icount: missing_in_icount.sort((a, b) => a.doc_number.localeCompare(b.doc_number)).slice(0, 100),
      amount_mismatches: amount_mismatches.slice(0, 100),
    };


    return new Response(JSON.stringify({ rows: finalRows, docs_scanned: list.length, warnings, reconciliation }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-cashflow]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
