// Generates a dynamic iCount hosted payment-page per private student.
// Mirrors `icount-generate-paylink` (school music) but works on
// `student_payments` + `students`. Caches the URL on the pending payment row
// and re-uses it as long as the amount is unchanged.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdminOrSecretary } from "../_shared/requireAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ICOUNT_API = "https://api.icount.co.il/api/v3.php";
const IPN_URL = "https://mtzzalrmtzfrkrpdjjoy.supabase.co/functions/v1/icount-student-payment-webhook";
const SUCCESS_URL = "https://musichof.com/student-payment/success?status=ok";
const PAYPAGE_CONFIG_VERSION = "student_v5_success_page";

interface LineInput {
  description: string;
  amount: number;
}

async function resolvePaypageIdFromUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { redirect: "follow" });
    const campaign = new URL(res.url || url).searchParams.get("utm_campaign");
    return campaign && /^\d+$/.test(campaign) ? campaign : null;
  } catch {
    return null;
  }
}

async function createPaypage(opts: {
  studentName: string;
  paymentId: string;
  lines: LineInput[];
  yearName?: string | null;
}): Promise<{ url: string; paypageId: string | null }> {
  const items = opts.lines
    .filter((l) => Number(l.amount) !== 0)
    .map((l) => ({
      description: l.description,
      unitprice: Math.round(Number(l.amount) * 100) / 100,
      quantity: 1,
      tax_exempt: 1,
    }));
  const yearSuffix = opts.yearName ? ` ${opts.yearName}` : "";
  const body = {
    cid: Deno.env.get("ICOUNT_COMPANY_ID"),
    user: Deno.env.get("ICOUNT_USERNAME"),
    pass: Deno.env.get("ICOUNT_PASSWORD"),
    page_name: `תשלום שכר לימוד${yearSuffix} - ${opts.studentName}`,
    doctype: "receipt",
    currency_id: 5,
    language: "he",
    hide_lang: 1,
    tax_exempt: true,
    require_id: 0,
    prevent_overrides: 0,
    max_payments: 10,
    ipn_url: IPN_URL,
    post_action_success: `${SUCCESS_URL}&payment_id=${opts.paymentId}`,
    items,
  };

  const res = await fetch(`${ICOUNT_API}/paypage/create`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!json?.status || !json?.paypage_url) {
    throw new Error(`iCount paypage/create failed: ${JSON.stringify(json)}`);
  }
  const url = json.paypage_url as string;
  const paypageId =
    String(json.paypage_id ?? json.page_id ?? json.paypage_info?.page_id ?? "") ||
    (await resolvePaypageIdFromUrl(url));
  return { url, paypageId };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFail = await requireAdminOrSecretary(req, corsHeaders);
  if (authFail) return authFail;



  try {
    const {
      studentId,
      paymentId: incomingPaymentId,
      amount,
      lines: linesInput,
      academicYearId,
      academicYearName,
      discounts,
    } = await req.json().catch(() => ({}));


    if (!studentId) {
      return new Response(JSON.stringify({ error: "studentId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const totalAmount = Number(amount);
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
      return new Response(JSON.stringify({ error: "amount must be > 0" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const lines: LineInput[] = Array.isArray(linesInput) && linesInput.length > 0
      ? linesInput
      : [{ description: "שכר לימוד", amount: totalAmount }];

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: student, error: stuErr } = await supabase
      .from("students")
      .select("id, first_name, last_name, national_id, parent_name, parent_national_id, parent_email, parent_phone")
      .eq("id", studentId)
      .maybeSingle();

    if (stuErr || !student) {
      return new Response(JSON.stringify({ error: "student not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve the pending payment row
    let paymentId: string | null = incomingPaymentId ?? null;
    let cachedBaseUrl: string | null = null;
    let rowAmount: number | null = null;
    if (paymentId) {
      const { data: p } = await supabase
        .from("student_payments")
        .select("id, payment_link_url, payment_status, amount")
        .eq("id", paymentId)
        .maybeSingle();
      if (p && p.payment_status === "pending") {
        cachedBaseUrl = p.payment_link_url ?? null;
        rowAmount = Number(p.amount) || null;
      }
    } else {
      const { data: p } = await supabase
        .from("student_payments")
        .select("id, payment_link_url, payment_status, amount")
        .eq("student_id", studentId)
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (p) {
        paymentId = p.id;
        cachedBaseUrl = p.payment_link_url ?? null;
        rowAmount = Number(p.amount) || null;
      }
    }

    const breakdown = { lines, discounts: discounts ?? null };

    // Create pending row if none exists
    if (!paymentId) {
      const { data: newRow, error: insErr } = await supabase
        .from("student_payments")
        .insert({
          student_id: studentId,
          academic_year_id: academicYearId ?? null,
          transaction_type: "payment",
          amount: totalAmount,
          payment_date: new Date().toISOString().slice(0, 10),
          payment_status: "pending",
          enrollment_breakdown: breakdown,
          notes: "ממתין לתשלום בקישור iCount",
        })
        .select("id")
        .single();
      if (insErr || !newRow) throw new Error(`failed to create pending payment: ${insErr?.message}`);
      paymentId = newRow.id;
    } else {
      // Always refresh breakdown (discounts may have changed even when total didn't)
      await supabase
        .from("student_payments")
        .update({ amount: totalAmount, enrollment_breakdown: breakdown })
        .eq("id", paymentId);
    }

    const studentName = `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim();
    const amountChanged = rowAmount != null && totalAmount !== rowAmount;
    const cachedHasCurrentConfig = cachedBaseUrl?.includes(`paypage_config=${PAYPAGE_CONFIG_VERSION}`) ?? false;
    let baseUrl = cachedBaseUrl && !amountChanged && cachedHasCurrentConfig ? cachedBaseUrl.split("?")[0] : "";
    let paypageId: string | null = null;
    if (!baseUrl) {
      const created = await createPaypage({
        studentName: studentName || "תלמיד",
        paymentId: paymentId!,
        lines,
        yearName: academicYearName ?? null,
      });
      baseUrl = created.url;
      paypageId = created.paypageId;
    }

    // Prefill from URL params
    const parentName: string = (student.parent_name ?? "").trim();
    const parentNameParts = parentName.split(/\s+/);
    const parentFirstName = parentNameParts[0] ?? "";
    const parentLastName = parentNameParts.slice(1).join(" ");
    const payerId = student.parent_national_id || student.national_id || "";

    const params = new URLSearchParams();
    if (parentName) params.set("name_on_invoice", parentName);
    if (parentFirstName) params.set("fname", parentFirstName);
    if (parentLastName) params.set("lname", parentLastName);
    if (student.parent_email) params.set("email", student.parent_email);
    if (student.parent_phone) params.set("phone", student.parent_phone);
    if (payerId) params.set("id_no", payerId);
    params.set("custom1", paymentId!);
    params.set("custom2", studentId);
    params.set("paypage_config", PAYPAGE_CONFIG_VERSION);

    const url = `${baseUrl}?${params.toString()}`;

    await supabase
      .from("student_payments")
      .update({
        payment_link_url: url,
        amount: totalAmount,
        ...(paypageId ? { icount_payment_page_id: paypageId } : {}),
      })
      .eq("id", paymentId!);

    return new Response(JSON.stringify({ url, amount: totalAmount, paymentId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-generate-student-paylink]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
