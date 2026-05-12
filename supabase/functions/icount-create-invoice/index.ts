// Creates an iCount tax invoice + receipt (חשבונית מס/קבלה) for an existing student_payments row.
// Updates the row with icount_doc_id, icount_doc_number, invoice_url, icount_doc_type.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

    // Load payment + student
    const { data: payment, error: payErr } = await supabase
      .from("student_payments")
      .select("*, students(first_name,last_name,national_id,parent_name,parent_email,parent_phone,parent_name_2,parent_email_2,parent_phone_2)")
      .eq("id", paymentId)
      .maybeSingle();

    if (payErr || !payment) {
      return new Response(JSON.stringify({ error: "payment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payment.icount_doc_id) {
      return new Response(JSON.stringify({
        ok: true, alreadyExists: true,
        doc_id: payment.icount_doc_id, doc_number: payment.icount_doc_number, url: payment.invoice_url,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const auth = getAuth();
    const student: any = payment.students || {};
    const clientName = student.parent_name || `${student.first_name} ${student.last_name}`;
    const studentFullName = `${student.first_name} ${student.last_name}`.trim();
    const pm = mapPaymentMethod(payment.payment_method);
    const amount = Number(payment.amount || 0);

    const description = `שכר לימוד — ${studentFullName}${payment.month_reference ? ` (${payment.month_reference})` : ""}`;

    // iCount doc/create payload (חשבונית מס קבלה = invrec)
    const payload: any = {
      ...auth,
      doctype: "invrec",
      client_name: clientName,
      email: student.parent_email || student.parent_email_2 || undefined,
      send_email: !!(student.parent_email || student.parent_email_2),
      lang: "he",
      currency_code: "ILS",
      vat_included: 1, // amounts already include VAT
      items: [
        {
          description,
          unitprice_incvat: amount,
          quantity: 1,
        },
      ],
    };

    // Payment line(s)
    if (pm.type === 1) {
      payload.cash = { sum: amount };
    } else if (pm.type === 3) {
      payload.cheques = [{ sum: amount, bank: "", branch: "", account: "", num: payment.reference_number || "" }];
    } else if (pm.type === 4) {
      payload.banktransfer = { sum: amount, account: payment.reference_number || "" };
    } else if (pm.type === 5) {
      payload.cc = { sum: amount, num: payment.reference_number || "", payments_count: payment.installments || 1 };
    } else {
      payload.other = { sum: amount, info: pm.label };
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

    await supabase.from("student_payments").update({
      icount_doc_id: docId,
      icount_doc_number: docNumber,
      invoice_url: docUrl,
      icount_doc_type: "invrec",
    }).eq("id", paymentId);

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
