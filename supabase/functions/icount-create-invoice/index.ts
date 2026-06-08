// Creates an iCount RECEIPT (קבלה) for an existing student_payments row.
// The organization is a Non-Profit (מלכ"ר) under a Regional Council's Tax ID and is legally
// prohibited from issuing Tax Invoices (חשבונית מס). Only Receipts are issued.
// Updates the row with icount_doc_id, icount_doc_number, invoice_url, icount_doc_type.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdminOrSecretary } from "../_shared/requireAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php";

interface ICountAuth {
  cid: string;
  user: string;
  pass: string;
}

function getAuth(): ICountAuth {
  const cid = Deno.env.get("ICOUNT_COMPANY_ID");
  const user = Deno.env.get("ICOUNT_USERNAME");
  const pass = Deno.env.get("ICOUNT_PASSWORD");
  if (!cid || !user || !pass) {
    throw new Error("ICOUNT credentials missing");
  }
  return { cid, user, pass };
}

const HEBREW_YEAR_MAP: Record<string, string> = {
  "2024-2025": "תשפ״ה",
  "2025-2026": "תשפ״ו",
  "2026-2027": "תשפ״ז",
  "2027-2028": "תשפ״ח",
  "2028-2029": "תשפ״ט",
  "2029-2030": "תש״צ",
  "2030-2031": "תשצ״א",
};
const toHebrewYear = (name: string): string => HEBREW_YEAR_MAP[name] ?? name;

// Map our payment_method values to iCount payment type IDs.
// iCount: 1=מזומן, 3=המחאה (cheque), 4=העברה בנקאית, 5=אשראי, 6=הוראת קבע, 7=אחר
function mapPaymentMethod(method?: string | null): { type: number; label: string } {
  switch ((method || "").toLowerCase()) {
    case "cash":
    case "מזומן":
      return { type: 1, label: "מזומן" };
    case "check":
    case "cheque":
    case "המחאה":
    case "צ'ק":
      return { type: 3, label: "המחאה" };
    case "transfer":
    case "bank_transfer":
    case "העברה בנקאית":
      return { type: 4, label: "העברה בנקאית" };
    case "credit_card":
    case "credit":
    case "אשראי":
      return { type: 5, label: "אשראי" };
    case "standing_order":
    case "הוראת קבע":
      return { type: 6, label: "הוראת קבע" };
    default:
      return { type: 7, label: "אחר" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFail = await requireAdminOrSecretary(req, corsHeaders);
  if (authFail) return authFail;



  try {
    const { paymentId, groupId } = await req.json();
    if (!paymentId && !groupId) {
      return new Response(JSON.stringify({ error: "paymentId or groupId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Load payment row(s) — group mode loads all rows in the group
    const baseSelect = "*, students(id,first_name,last_name,national_id,address,city,parent_name,parent_email,parent_phone,parent_name_2,parent_email_2,parent_phone_2)";
    let payments: any[] = [];
    if (groupId) {
      const { data, error } = await supabase
        .from("student_payments")
        .select(baseSelect)
        .eq("payment_group_id", groupId)
        .order("created_at", { ascending: true });
      if (error || !data || data.length === 0) {
        return new Response(JSON.stringify({ error: "group payments not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      payments = data;
    } else {
      const { data, error } = await supabase
        .from("student_payments")
        .select(baseSelect)
        .eq("id", paymentId)
        .maybeSingle();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "payment not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      payments = [data];
    }

    // If any row already has a doc, return existing
    const existing = payments.find((p) => p.icount_doc_id);
    if (existing) {
      return new Response(JSON.stringify({
        ok: true, alreadyExists: true,
        doc_id: existing.icount_doc_id, doc_number: existing.icount_doc_number, url: existing.invoice_url,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const auth = getAuth();
    const head = payments[0];
    const student: any = head.students || {};
    const clientName = student.parent_name || `${student.first_name} ${student.last_name}`;
    const studentFullName = `${student.first_name} ${student.last_name}`.trim();
    const pm = mapPaymentMethod(head.payment_method);
    const totalAmount = payments.reduce((s, p) => s + Number(p.amount || 0), 0);

    // Fetch academic year name (use head's year)
    let yearName = "";
    if (head.academic_year_id) {
      const { data: yr } = await supabase
        .from("academic_years")
        .select("name")
        .eq("id", head.academic_year_id)
        .maybeSingle();
      yearName = yr?.name || "";
    }

    // Determine if this is a credit doc (all rows are non-payment transactions).
    const isCreditDoc = payments.every((p) => p.transaction_type && p.transaction_type !== "payment");
    const sign = isCreditDoc ? -1 : 1;

    // Build line items.
    // - Combined single-row payment with `enrollment_breakdown`: one item per breakdown entry.
    // - Group of payments (legacy): one item per payment row.
    // - Single payment: one item.
    type LineRef = { enrollment_id: string | null; amount: number; month_reference?: string | null };
    const lineRefs: LineRef[] = [];
    for (const p of payments) {
      const breakdown = Array.isArray(p.enrollment_breakdown) ? p.enrollment_breakdown : null;
      if (breakdown && breakdown.length > 0) {
        for (const b of breakdown) {
          lineRefs.push({
            enrollment_id: b.enrollment_id ?? null,
            amount: Number(b.amount || 0),
            month_reference: p.month_reference,
          });
        }
      } else {
        lineRefs.push({
          enrollment_id: p.enrollment_id ?? null,
          amount: Number(p.amount || 0),
          month_reference: p.month_reference,
        });
      }
    }

    const enrollmentIds = lineRefs.map((l) => l.enrollment_id).filter(Boolean) as string[];
    const enrollMap: Record<string, any> = {};
    if (enrollmentIds.length > 0) {
      const { data: ens } = await supabase
        .from("enrollments")
        .select("id, lesson_duration_minutes, lesson_type, schools(name), instruments(name)")
        .in("id", enrollmentIds);
      for (const e of ens ?? []) enrollMap[(e as any).id] = e;
    }

    const buildItemDescription = (ref: LineRef) => {
      const e = ref.enrollment_id ? enrollMap[ref.enrollment_id] : null;
      const prefix = isCreditDoc ? "זיכוי" : "שכר לימוד";
      const headerLine = `${prefix} — ${studentFullName}${ref.month_reference ? ` (${ref.month_reference})` : ""}`;
      if (!e) return headerLine;
      const parts = [
        (e as any).schools?.name && `שלוחה: ${(e as any).schools.name}`,
        (e as any).instruments?.name && `כלי: ${(e as any).instruments.name}`,
        yearName && `שנת לימוד: ${toHebrewYear(yearName)}`,
        (e as any).lesson_duration_minutes && `משך: ${(e as any).lesson_duration_minutes} דק'`,
        (e as any).lesson_type && `סוג: ${(e as any).lesson_type === "individual" ? "פרטני" : "קבוצתי"}`,
      ].filter(Boolean);
      return `${headerLine}\n• ${parts.join(" | ")}`;
    };

    const items = lineRefs.map((ref) => ({
      description: buildItemDescription(ref),
      unitprice_incvat: sign * Math.abs(ref.amount),
      quantity: 1,
    }));

    // iCount doc/create payload — RECEIPT (קבלה) only. For credits — קבלה במינוס.
    // Malkar (Non-Profit) cannot issue Tax Invoices. No VAT calculation.
    const payload: any = {
      ...auth,
      doctype: "receipt",
      client_name: clientName,
      client_address: student.address || student.city || undefined,
      client_city: student.city || undefined,
      client_phone: student.parent_phone || student.parent_phone_2 || undefined,
      client_mobile: student.parent_phone || student.parent_phone_2 || undefined,
      phone: student.parent_phone || student.parent_phone_2 || undefined,
      mobile: student.parent_phone || student.parent_phone_2 || undefined,
      email: student.parent_email || student.parent_email_2 || undefined,
      send_email: !!(student.parent_email || student.parent_email_2),
      lang: "he",
      currency_code: "ILS",
      vat_free: 1, // Malkar — no VAT charged
      items,
    };

    // Payment line(s) — total amount across all rows (signed for credits).
    const signedTotal = sign * Math.abs(totalAmount);
    if (pm.type === 1) {
      payload.cash = { sum: signedTotal };
    } else if (pm.type === 3) {
      payload.cheques = [{ sum: signedTotal, bank: "", branch: "", account: "", num: head.reference_number || "" }];
    } else if (pm.type === 4) {
      payload.banktransfer = { sum: signedTotal, account: head.reference_number || "" };
    } else if (pm.type === 5) {
      payload.cc = { sum: signedTotal, num: head.reference_number || "", payments_count: head.installments || 1 };
    } else {
      payload.other = { sum: signedTotal, info: pm.label };
    }

    const res = await fetch(`${ICOUNT_BASE}/doc/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log("[icount doc/create]", JSON.stringify(data));

    if (!data.status) {
      return new Response(JSON.stringify({ error: "icount failed", details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docId = String(data.doc_id ?? data.docnum ?? "");
    const docNumber = String(data.docnum ?? data.doc_number ?? "");
    const docUrl = data.doc_url || data.pdf_link || data.url || null;

    // Update all rows with same invoice info
    const ids = payments.map((p) => p.id);
    await supabase.from("student_payments").update({
      icount_doc_id: docId,
      icount_doc_number: docNumber,
      invoice_url: docUrl,
      icount_doc_type: "receipt",
    }).in("id", ids);

    return new Response(JSON.stringify({
      ok: true, doc_id: docId, doc_number: docNumber, url: docUrl,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[icount-create-invoice]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
