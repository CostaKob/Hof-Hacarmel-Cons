// Creates an iCount RECEIPT (קבלה) for a school_music_payments row.
// Malkar (Non-Profit) — only receipts are issued, no VAT.
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

function mapPaymentMethod(method?: string | null): { type: number; label: string } {
  switch ((method || "").toLowerCase()) {
    case "cash": case "מזומן": return { type: 1, label: "מזומן" };
    case "check": case "cheque": case "המחאה": case "צ'ק": return { type: 3, label: "המחאה" };
    case "transfer": case "bank_transfer": case "העברה בנקאית": return { type: 4, label: "העברה בנקאית" };
    case "credit_card": case "credit": case "אשראי": return { type: 5, label: "אשראי" };
    case "bit": return { type: 7, label: "ביט" };
    default: return { type: 7, label: "אחר" };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFail = await requireAdminOrSecretary(req, corsHeaders);
  if (authFail) return authFail;



  try {
    const { paymentId } = await req.json();
    if (!paymentId) {
      return new Response(JSON.stringify({ error: "paymentId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment, error } = await supabase
      .from("school_music_payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (error || !payment) {
      console.error("[icount-create-sm-receipt] payment not found", { paymentId, error });
      return new Response(JSON.stringify({ error: "payment not found", details: error }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: studentRow }, { data: schoolRow }, { data: yearRow }] = await Promise.all([
      supabase.from("school_music_students").select("student_first_name,student_last_name,parent_name,parent_phone,parent_email,city,class_name,instrument_id").eq("id", payment.school_music_student_id).maybeSingle(),
      payment.school_music_school_id
        ? supabase.from("school_music_schools").select("school_name").eq("id", payment.school_music_school_id).maybeSingle()
        : Promise.resolve({ data: null }),
      payment.academic_year_id
        ? supabase.from("academic_years").select("name").eq("id", payment.academic_year_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const { data: instrumentRow } = (studentRow as any)?.instrument_id
      ? await supabase.from("instruments").select("name").eq("id", (studentRow as any).instrument_id).maybeSingle()
      : { data: null };

    if (payment.icount_doc_id) {
      return new Response(JSON.stringify({
        ok: true, alreadyExists: true,
        doc_id: payment.icount_doc_id, doc_number: payment.icount_doc_number, url: payment.invoice_url,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const auth = getAuth();
    const student: any = { ...(studentRow || {}), instruments: instrumentRow };
    const school: any = schoolRow || {};
    const year: any = yearRow || {};
    const studentFullName = `${student.student_first_name ?? ""} ${student.student_last_name ?? ""}`.trim();
    const clientName = student.parent_name || studentFullName;
    const pm = mapPaymentMethod(payment.payment_method);
    const amount = Number(payment.amount || 0);

    const parts = [
      school.school_name && `בית ספר: ${school.school_name}`,
      student.class_name && `כיתה: ${student.class_name}`,
      student.instruments?.name && `כלי: ${student.instruments.name}`,
      year.name && `שנת לימוד: ${year.name}`,
    ].filter(Boolean);
    const description = `שכר לימוד — ${studentFullName}${parts.length ? `\n• ${parts.join(" | ")}` : ""}`;

    const payload: any = {
      ...auth,
      doctype: "receipt",
      client_name: clientName,
      client_address: student.city || undefined,
      client_city: student.city || undefined,
      client_phone: student.parent_phone || undefined,
      client_mobile: student.parent_phone || undefined,
      phone: student.parent_phone || undefined,
      mobile: student.parent_phone || undefined,
      email: student.parent_email || undefined,
      send_email: !!student.parent_email,
      lang: "he",
      currency_code: "ILS",
      vat_free: 1,
      items: [{ description, unitprice_incvat: amount, quantity: 1 }],
    };

    if (pm.type === 1) payload.cash = { sum: amount };
    else if (pm.type === 3) payload.cheques = [{ sum: amount, bank: "", branch: "", account: "", num: payment.transaction_reference || "" }];
    else if (pm.type === 4) payload.banktransfer = { sum: amount, account: payment.transaction_reference || "" };
    else if (pm.type === 5) payload.cc = { sum: amount, num: payment.transaction_reference || "", payments_count: 1 };
    else payload.other = { sum: amount, info: pm.label };

    const res = await fetch(`${ICOUNT_BASE}/doc/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log("[icount sm receipt]", JSON.stringify(data));

    if (!data.status) {
      return new Response(JSON.stringify({ error: "icount failed", details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const docId = String(data.doc_info?.doc_id ?? data.doc_id ?? data.docnum ?? data.doc_info?.docnum ?? "");
    const docNumber = String(data.doc_info?.docnum ?? data.docnum ?? data.doc_number ?? "");
    const docUrl = data.doc_url || data.pdf_link || data.url || null;

    await supabase.from("school_music_payments").update({
      icount_doc_id: docId,
      icount_doc_number: docNumber,
      invoice_url: docUrl,
      icount_doc_type: "receipt",
    }).eq("id", paymentId);

    return new Response(JSON.stringify({ ok: true, doc_id: docId, doc_number: docNumber, url: docUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-create-sm-receipt]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
