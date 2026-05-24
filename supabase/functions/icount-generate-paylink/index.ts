// Generates a dynamic iCount hosted payment-page URL for a Playing Schools
// (school_music) student via the iCount API. Stores the URL on the pending
// payment row for reuse and returns it (with paymentId) to the caller.
//
// Anonymous-callable: invoked from the public registration form.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php";
const CAESAREA_NAMES = ["קיסריה", "קיסרייה"];

function auth() {
  const cid = Deno.env.get("ICOUNT_COMPANY_ID");
  const user = Deno.env.get("ICOUNT_USERNAME");
  const pass = Deno.env.get("ICOUNT_PASSWORD");
  if (!cid || !user || !pass) throw new Error("ICOUNT credentials missing");
  return { cid, user, pass };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { studentId, paymentId: incomingPaymentId } = await req.json().catch(() => ({}));
    if (!studentId) {
      return new Response(JSON.stringify({ error: "studentId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: student, error: stuErr } = await supabase
      .from("school_music_students")
      .select(`
        id, student_first_name, student_last_name, student_national_id,
        parent_name, parent_email, parent_phone,
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
    let existingUrl: string | null = null;
    if (paymentId) {
      const { data: p } = await supabase
        .from("school_music_payments")
        .select("id, payment_link_url, payment_status")
        .eq("id", paymentId).maybeSingle();
      if (p) existingUrl = p.payment_link_url ?? null;
    } else {
      const { data: p } = await supabase
        .from("school_music_payments")
        .select("id, payment_link_url, payment_status")
        .eq("school_music_student_id", studentId)
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (p) { paymentId = p.id; existingUrl = p.payment_link_url ?? null; }
    }

    // Reuse existing URL if already generated.
    if (existingUrl) {
      return new Response(JSON.stringify({ url: existingUrl, paymentId, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const schoolName: string = (student as any).school_music_schools?.school_name ?? "";
    const studentName = `${student.student_first_name ?? ""} ${student.student_last_name ?? ""}`.trim();
    const amount = CAESAREA_NAMES.some((n) => schoolName.includes(n)) ? 1600 : 650;
    const description = `שכר לימוד - תלמיד: ${studentName}, בית ספר: ${schoolName}`;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const projectRef = supabaseUrl.replace("https://", "").split(".")[0];
    const ipnUrl = `${supabaseUrl}/functions/v1/icount-ipn-handler`;
    // Frontend success/cancel pages. Public app domain is preferred for end-users.
    const appOrigin = "https://musichof.com";
    const successUrl = `${appOrigin}/school-music/register/success?payment_id=${paymentId ?? ""}&status=ok`;
    const failureUrl = `${appOrigin}/school-music/register/success?payment_id=${paymentId ?? ""}&status=cancel`;

    const creds = auth();
    const payload = {
      ...creds,
      doctype: "invrec",
      lang: "he",
      currency_code: "ILS",
      client_name: student.parent_name || studentName,
      email: student.parent_email || undefined,
      send_email: student.parent_email ? "1" : "0",
      vat_id: student.student_national_id || undefined,
      items: [{ description, unitprice_incvat: amount, quantity: 1 }],
      // Custom metadata returned in IPN: paymentId is primary key for matching.
      custom_info: paymentId ?? studentId,
      success_url: successUrl,
      failure_url: failureUrl,
      ipn_url: ipnUrl,
    };

    const res = await fetch(`${ICOUNT_BASE}/cc/page/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    console.log("[icount-generate-paylink] response:", JSON.stringify(data));

    const url: string | undefined =
      data?.payment_url || data?.url || data?.page_url || data?.paypage_url;

    if (!data?.status || !url) {
      return new Response(JSON.stringify({ error: "iCount paypage create failed", details: data, projectRef }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Persist URL on payment row + legacy student field for back-compat.
    if (paymentId) {
      await supabase.from("school_music_payments")
        .update({ payment_link_url: url }).eq("id", paymentId);
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
