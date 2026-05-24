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

// Two pre-configured iCount Paypages with fixed amounts (no dynamic cs param).
const PAYPAGE_DEFAULT = "675e7"; // 650 ₪ — all schools except Caesarea
const PAYPAGE_CAESAREA = "04dcb"; // 1600 ₪ — Caesarea schools



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
    const isCaesarea = CAESAREA_NAMES.some((n) => schoolName.includes(n));
    const amount = isCaesarea ? 1600 : 650;
    const paypageId = isCaesarea ? PAYPAGE_CAESAREA : PAYPAGE_DEFAULT;

    // Amount is fixed on each Paypage — we DO NOT pass `cs`.
    // custom1 is echoed back in the IPN — we use it to match the pending payment row.
    const parentName: string = (student.parent_name ?? "").trim();
    const parentNameParts = parentName.split(/\s+/);
    const parentFirstName = parentNameParts[0] ?? "";
    const parentLastName = parentNameParts.slice(1).join(" ");
    const payerId = student.parent_national_id || student.student_national_id || "";

    const params = new URLSearchParams();
    if (parentName) params.set("full_name", parentName);
    if (parentFirstName) {
      params.set("first_name", parentFirstName);
      params.set("contact_first_name", parentFirstName);
    }
    if (parentLastName) {
      params.set("last_name", parentLastName);
      params.set("contact_last_name", parentLastName);
    }
    if (student.parent_email) params.set("email", student.parent_email);
    if (student.parent_phone) params.set("phone", student.parent_phone);
    if (payerId) {
      params.set("vat_id", payerId);
      params.set("client_id_number", payerId);
      params.set("id_num", payerId);
    }
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
