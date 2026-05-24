// Generates a dynamic iCount hosted payment-page URL for a Playing Schools
// (school_music) student. Uses a pre-configured iCount Paypage and appends
// student/amount details as query params. Stores the URL on the pending
// payment row for reuse and returns it (with paymentId) to the caller.
//
// Anonymous-callable: invoked from the public registration form.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CAESAREA_NAMES = ["קיסריה", "קיסרייה"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const paypageId = Deno.env.get("ICOUNT_PAYPAGE_ID");
    if (!paypageId) {
      return new Response(JSON.stringify({ error: "ICOUNT_PAYPAGE_ID not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        .select("id, payment_link_url")
        .eq("id", paymentId).maybeSingle();
      if (p) existingUrl = p.payment_link_url ?? null;
    } else {
      const { data: p } = await supabase
        .from("school_music_payments")
        .select("id, payment_link_url")
        .eq("school_music_student_id", studentId)
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false })
        .limit(1).maybeSingle();
      if (p) { paymentId = p.id; existingUrl = p.payment_link_url ?? null; }
    }

    if (existingUrl) {
      return new Response(JSON.stringify({ url: existingUrl, paymentId, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const schoolName: string = (student as any).school_music_schools?.school_name ?? "";
    const studentName = `${student.student_first_name ?? ""} ${student.student_last_name ?? ""}`.trim();
    const amount = CAESAREA_NAMES.some((n) => schoolName.includes(n)) ? 1600 : 650;

    // Build hosted Paypage URL.
    // iCount Paypage format: https://app.icount.co.il/m/{PAYPAGE_ID}/?cs=AMOUNT&full_name=...&custom1=PAYMENT_ID
    // custom1 is echoed back in the IPN under custom_info / custom1 — we use it to match the pending payment row.
    const params = new URLSearchParams();
    params.set("cs", String(amount));
    params.set("full_name", student.parent_name || studentName);
    if (student.parent_email) params.set("email", student.parent_email);
    if (student.parent_phone) params.set("phone", student.parent_phone);
    if (student.student_national_id) params.set("vat_id", student.student_national_id);
    params.set("description", `שכר לימוד - ${studentName} - ${schoolName}`);
    // custom1 = paymentId so the IPN can match. Fallback to studentId.
    params.set("custom1", paymentId ?? studentId);
    params.set("custom2", studentId);

    const url = `https://app.icount.co.il/m/${paypageId}/?${params.toString()}`;

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
