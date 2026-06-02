import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  registrationId: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: "RESEND_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { registrationId } = (await req.json()) as Payload;
    if (!registrationId || typeof registrationId !== "string") {
      return new Response(JSON.stringify({ error: "Missing registrationId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: reg, error } = await supabase
      .from("registrations")
      .select("*, registration_pages:registration_page_id(approval_text), academic_years:academic_year_id(name)")
      .eq("id", registrationId)
      .maybeSingle();

    if (error || !reg) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parentEmail = (reg as any).parent_email;
    if (!parentEmail) {
      return new Response(JSON.stringify({ skipped: true, reason: "no parent_email" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parentName = (reg as any).parent_name || "";
    const studentName = `${(reg as any).student_first_name || ""} ${(reg as any).student_last_name || ""}`.trim();
    const instruments: string[] = Array.isArray((reg as any).requested_instruments)
      ? (reg as any).requested_instruments
      : [];
    const duration = (reg as any).requested_lesson_duration;
    const branch = (reg as any).branch_school_name || "";
    const yearName = (reg as any).academic_years?.name || "";
    const approvalText =
      (reg as any).registration_pages?.approval_text ||
      "קראתי את המידע ואני מאשר/ת את תנאי ההרשמה והלימודים";
    const createdAt = new Date((reg as any).created_at);
    const dateStr = createdAt.toLocaleString("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const subject = `אישור הרשמה — אולפן המוסיקה חוף הכרמל ${yearName}`.trim();

    const esc = (s: string) =>
      String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const html = `<!doctype html>
<html lang="he" dir="rtl">
  <body style="background:#ffffff;font-family:Arial,sans-serif;color:#1a1a1a;margin:0;padding:24px;">
    <div style="max-width:600px;margin:0 auto;">
      <h1 style="font-size:20px;margin:0 0 16px;">אישור הרשמה — אולפן המוסיקה חוף הכרמל</h1>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">שלום ${esc(parentName)},</p>
      <p style="font-size:15px;line-height:1.6;margin:0 0 16px;">
        קיבלנו את טופס ההרשמה עבור <strong>${esc(studentName)}</strong>${yearName ? ` לשנת הלימודים <strong>${esc(yearName)}</strong>` : ""}.
      </p>

      <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:14px;">
        <tr><td style="padding:8px 0;color:#666;width:40%;">תאריך מילוי</td><td style="padding:8px 0;">${esc(dateStr)}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">שלוחה</td><td style="padding:8px 0;">${esc(branch)}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">${instruments.length > 1 ? "כלים מבוקשים" : "כלי מבוקש"}</td><td style="padding:8px 0;">${esc(instruments.join(", "))}</td></tr>
        <tr><td style="padding:8px 0;color:#666;">משך שיעור</td><td style="padding:8px 0;">${esc(duration || "")} דקות</td></tr>
      </table>

      <div style="background:#f5f5f5;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="font-size:13px;color:#666;margin:0 0 8px;">נוסח האישור:</p>
        <p style="font-size:14px;line-height:1.6;margin:0;white-space:pre-line;">${esc(approvalText)}</p>
      </div>

      <p style="font-size:14px;line-height:1.6;margin:16px 0;">
        אישרת את האמור לעיל בלחיצה על תיבת הסימון. אישור זה מהווה תיעוד של הסכמתך לתנאי ההרשמה והלימודים.
      </p>

      <p style="font-size:14px;line-height:1.6;margin:24px 0 0;color:#666;">
        בברכה,<br/>
        אולפן המוסיקה חוף הכרמל
      </p>
    </div>
  </body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "אולפן המוסיקה חוף הכרמל <onboarding@resend.dev>",
        to: [parentEmail],
        subject,
        html,
      }),
    });

    const resendBody = await resendRes.json();
    if (!resendRes.ok) {
      console.error("Resend error:", resendRes.status, resendBody);
      return new Response(JSON.stringify({ error: "Resend send failed", details: resendBody }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, id: resendBody.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-registration-confirmation error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
