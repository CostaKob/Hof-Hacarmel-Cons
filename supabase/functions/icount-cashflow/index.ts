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
  if (typeof v === "object") return Object.values(v as Record<string, unknown>);
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
    const { startDate, endDate, debug } = await req.json();
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
    let lastRaw: any = null;
    for (let offset = 0; offset < 5000; offset += 100) {
      const search = await icount("doc/search", {
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
      lastRaw = search;
      if (search && search.status === false) {
        if (offset > 0 && search.reason === "no_results") break;
        const reason = search.error_description || search.reason || search.message || "שגיאה מ-iCount";
        return new Response(JSON.stringify({ error: `iCount: ${reason}`, details: search }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const page = asArray(search.results_list ?? search.docs ?? search.results ?? search.data);
      list.push(...page);
      if (page.length < 100) break;
    }


    if (debug) {
      const withCc = list.filter((d) => asArray(d.cc).length).slice(-5);
      return new Response(JSON.stringify({ count: list.length, withCc, lastRaw: lastRaw?.status }, null, 2), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // doc/search with detail_level 10 already returns the payment breakdown.
    // Cancelled documents are real-world reversals and must not be counted.
    const details = list.filter((d) => !Number(d.is_cancelled) && !Number(d.is_cancellation));

    let rows: Omit<Row, "source">[] = [];
    for (const d of details) rows.push(...expandDoc(d));
    rows = rows.filter((r) => r.due_date >= startDate && r.due_date <= endDate);


    // Classify each row against our own records (students vs school music).
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const docIds = [...new Set(rows.map((r) => r.doc_id).filter(Boolean))];
    const docNumbers = [...new Set(rows.map((r) => r.doc_number).filter(Boolean))];
    const [sp, smp] = await Promise.all([
      supabase.from("student_payments").select("icount_doc_id,icount_doc_number").or(
        `icount_doc_id.in.(${docIds.join(",") || "null"}),icount_doc_number.in.(${docNumbers.join(",") || "null"})`,
      ),
      supabase.from("school_music_payments").select("icount_doc_id,icount_doc_number").or(
        `icount_doc_id.in.(${docIds.join(",") || "null"}),icount_doc_number.in.(${docNumbers.join(",") || "null"})`,
      ),
    ]);
    const studentKeys = new Set<string>();
    for (const p of sp.data ?? []) { if (p.icount_doc_id) studentKeys.add(String(p.icount_doc_id)); if (p.icount_doc_number) studentKeys.add(String(p.icount_doc_number)); }
    const smKeys = new Set<string>();
    for (const p of smp.data ?? []) { if (p.icount_doc_id) smKeys.add(String(p.icount_doc_id)); if (p.icount_doc_number) smKeys.add(String(p.icount_doc_number)); }

    const finalRows: Row[] = rows.map((r) => ({
      ...r,
      source: studentKeys.has(r.doc_id) || studentKeys.has(r.doc_number)
        ? "students"
        : smKeys.has(r.doc_id) || smKeys.has(r.doc_number)
          ? "school_music"
          : "external",
    }));

    finalRows.sort((a, b) => a.due_date.localeCompare(b.due_date) || a.doc_number.localeCompare(b.doc_number));

    return new Response(JSON.stringify({ rows: finalRows, docs_scanned: list.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-cashflow]", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
