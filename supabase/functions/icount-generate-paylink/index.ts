// Generates a dynamic iCount hosted payment-page per student via the iCount
// API (`paypage/create`). The new page embeds the student's name directly in
// the cart item description, so parents see exactly what they're paying for
// with zero extra fields to fill. The URL is cached on the pending payment
// row and returned to the caller on subsequent requests.
//
// Anonymous-callable: invoked from the public registration form.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CAESAREA_NAMES = ["קיסריה", "קיסרייה"];
const ICOUNT_API = "https://api.icount.co.il/api/v3.php";
const IPN_URL = "https://mtzzalrmtzfrkrpdjjoy.supabase.co/functions/v1/icount-ipn-handler";
const SUCCESS_URL_BASE = "https://musichof.com/school-music-register/success";
const PAYPAGE_CONFIG_VERSION = "no_id_v1";

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
  schoolName: string;
  amount: number;
  paymentId: string;
}): Promise<{ url: string; paypageId: string | null }> {
  const itemDesc = `בי"ס מנגן - ${opts.studentName} - ${opts.schoolName}`;
  const body = {
    cid: Deno.env.get("ICOUNT_COMPANY_ID"),
    user: Deno.env.get("ICOUNT_USERNAME"),
    pass: Deno.env.get("ICOUNT_PASSWORD"),
    page_name: `תשלום בי"ס מנגן - ${opts.studentName}`,
    doctype: "receipt",
    currency_id: 5,
    language: "he",
    hide_lang: 1,
    tax_exempt: true,
    require_id: 0,
    prevent_overrides: 0,
    max_payments: 1,
    ipn_url: IPN_URL,
    post_action_success: `${SUCCESS_URL_BASE}?status=ok&payment_id=${opts.paymentId}`,
    items: [
      { description: itemDesc, unitprice: opts.amount, quantity: 1, tax_exempt: 1 },
    ],
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
  const paypageId = String(json.paypage_id ?? json.page_id ?? json.paypage_info?.page_id ?? "") || await resolvePaypageIdFromUrl(url);
  return { url, paypageId };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { studentId, paymentId: incomingPaymentId, amount: amountOverride } = await req.json().catch(() => ({}));
    if (!studentId) {
      return new Response(JSON.stringify({ error: "studentId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const overrideAmt = Number(amountOverride);
    const hasOverride = Number.isFinite(overrideAmt) && overrideAmt > 0;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: student, error: stuErr } = await supabase
      .from("school_music_students")
      .select(`
        id, student_first_name, student_last_name, student_national_id,
        parent_name, parent_national_id, parent_email, parent_phone,
        school_music_schools!school_music_students_school_music_school_id_fkey(school_name)
      `)
      .eq("id", studentId)
      .maybeSingle();

    if (stuErr || !student) {
      return new Response(JSON.stringify({ error: "student not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve the pending payment row to attach the link to.
    let paymentId: string | null = incomingPaymentId ?? null;
    let cachedBaseUrl: string | null = null;
    let rowAmount: number | null = null;
    if (paymentId) {
      const { data: p } = await supabase
        .from("school_music_payments")
        .select("id, payment_link_url, payment_status, amount")
        .eq("id", paymentId).maybeSingle();
      if (p && p.payment_status === "pending") {
        cachedBaseUrl = p.payment_link_url ?? null;
        rowAmount = Number(p.amount) || null;
      }
    } else {
      const { data: p } = await supabase
        .from("school_music_payments")
        .select("id, payment_link_url, payment_status, amount")
        .eq("school_music_student_id", studentId)
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (p) { paymentId = p.id; cachedBaseUrl = p.payment_link_url ?? null; rowAmount = Number(p.amount) || null; }
    }

    const schoolName: string = (student as any).school_music_schools?.school_name ?? "";
    const studentName = `${student.student_first_name ?? ""} ${student.student_last_name ?? ""}`.trim();
    const isCaesarea = CAESAREA_NAMES.some((n) => schoolName.includes(n));
    const defaultAmount = isCaesarea ? 1600 : 650;
    const amount = hasOverride ? overrideAmt : (rowAmount ?? defaultAmount);

    // If no pending payment row exists, create one so the link has somewhere to live.
    if (!paymentId) {
      const { data: schoolRow } = await supabase
        .from("school_music_students")
        .select("school_music_school_id, academic_year_id")
        .eq("id", studentId).maybeSingle();
      const { data: newRow, error: insErr } = await supabase
        .from("school_music_payments")
        .insert({
          school_music_student_id: studentId,
          school_music_school_id: schoolRow?.school_music_school_id,
          academic_year_id: schoolRow?.academic_year_id,
          amount,
          payment_status: "pending",
          notes: "נוצר ידנית מהאדמין",
        })
        .select("id").single();
      if (insErr || !newRow) throw new Error(`failed to create pending payment: ${insErr?.message}`);
      paymentId = newRow.id;
    }

    // The base URL is the dynamic paypage. Re-use the cached one if present,
    // otherwise create a fresh paypage per student via the iCount API.
    // If the amount differs from what the cached paypage was created with,
    // we MUST recreate the paypage so iCount charges the new amount.
    const amountChanged = rowAmount != null && amount !== rowAmount;
    const cachedHasCurrentConfig = cachedBaseUrl?.includes(`paypage_config=${PAYPAGE_CONFIG_VERSION}`) ?? false;
    let baseUrl = cachedBaseUrl && !amountChanged && cachedHasCurrentConfig ? cachedBaseUrl.split("?")[0] : "";
    let paypageId: string | null = null;
    if (!baseUrl) {
      const created = await createPaypage({
        studentName: studentName || "תלמיד",
        schoolName: schoolName || "בית ספר",
        amount,
        paymentId: paymentId ?? studentId,
      });
      baseUrl = created.url;
      paypageId = created.paypageId;
    }

    // Prefill the standard iCount fields from URL params.
    const parentName: string = (student.parent_name ?? "").trim();
    const parentNameParts = parentName.split(/\s+/);
    const parentFirstName = parentNameParts[0] ?? "";
    const parentLastName = parentNameParts.slice(1).join(" ");
    const payerId = student.parent_national_id || student.student_national_id || "";

    const params = new URLSearchParams();
    if (parentName) params.set("name_on_invoice", parentName);
    if (parentFirstName) params.set("fname", parentFirstName);
    if (parentLastName) params.set("lname", parentLastName);
    if (student.parent_email) params.set("email", student.parent_email);
    if (student.parent_phone) params.set("phone", student.parent_phone);
    if (payerId) params.set("id_no", payerId);
    // custom1 = paymentId so the IPN can match. Fallback to studentId.
    params.set("custom1", paymentId ?? studentId);
    params.set("custom2", studentId);
    params.set("paypage_config", PAYPAGE_CONFIG_VERSION);

    const url = `${baseUrl}?${params.toString()}`;

    if (paymentId) {
      await supabase.from("school_music_payments")
        .update({ payment_link_url: url, amount, ...(paypageId ? { icount_payment_page_id: paypageId } : {}) }).eq("id", paymentId);
    }
    await supabase.from("school_music_students")
      .update({ icount_payment_url: url }).eq("id", studentId);

    return new Response(JSON.stringify({ url, amount, paymentId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-generate-paylink]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
