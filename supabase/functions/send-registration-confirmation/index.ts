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
    const { registrationId } = (await req.json()) as Payload;
    if (!registrationId || typeof registrationId !== "string") {
      return new Response(JSON.stringify({ error: "Missing registrationId" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const { data: reg, error } = await supabase
      .from("registrations")
      .select(
        "*, registration_pages:registration_page_id(approval_text), academic_years:academic_year_id(name)",
      )
      .eq("id", registrationId)
      .maybeSingle();

    if (error || !reg) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Anti-abuse: only allow sending a confirmation right after the registration is
    // submitted. Refuses replay attacks where an attacker spams confirmations for
    // arbitrary known registration UUIDs.
    const createdAt = new Date((reg as any).created_at).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 10 * 60 * 1000) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "registration not recent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Idempotency: if we already logged a send (pending/sent/suppressed) for this
    // registration's confirmation, do not re-enqueue.
    const idempotencyKey = `registration-confirmation-${registrationId}`;
    const { data: priorLog } = await supabase
      .from("email_send_log")
      .select("id")
      .eq("template_name", "registration-confirmation")
      .eq("recipient_email", String((reg as any).parent_email || "").toLowerCase())
      .in("status", ["pending", "sent", "suppressed"])
      .limit(1)
      .maybeSingle();
    if (priorLog) {
      return new Response(
        JSON.stringify({ ok: true, deduped: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    const parentEmail = (reg as any).parent_email;
    if (!parentEmail) {
      return new Response(JSON.stringify({ skipped: true, reason: "no parent_email" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // טען את הסקשנים המלאים של דף ההרשמה (התקנון המלא)
    let sectionsText = "";
    const pageId = (reg as any).registration_page_id;
    if (pageId) {
      const { data: sections } = await supabase
        .from("registration_page_sections")
        .select("title, content")
        .eq("page_id", pageId)
        .order("sort_order");

      if (sections && sections.length > 0) {
        sectionsText = sections
          .map((s: any) => {
            const lines = [];
            if (s.title) lines.push(s.title);
            if (s.content) lines.push(s.content);
            return lines.join("\n");
          })
          .join("\n\n");
      }
    }

    const parentName = (reg as any).parent_name || "";
    const studentName = `${(reg as any).student_first_name || ""} ${(reg as any).student_last_name || ""}`.trim();
    const instruments: string[] = Array.isArray((reg as any).requested_instruments)
      ? (reg as any).requested_instruments
      : [];
    const lessonDuration = (reg as any).requested_lesson_duration || "";
    const branch = (reg as any).branch_school_name || "";
    const yearName = (reg as any).academic_years?.name || "";
    const registrationUrl = yearName
      ? `https://musichof.com/register?year=${encodeURIComponent(yearName)}`
      : "https://musichof.com/register";
    const approvalText =
      (reg as any).registration_pages?.approval_text ||
      "קראתי את המידע ואני מאשר/ת את תנאי ההרשמה והלימודים";
    const submittedAt = new Date((reg as any).created_at).toLocaleString("he-IL", {
      timeZone: "Asia/Jerusalem",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ANON_KEY}`,
        apikey: ANON_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateName: "registration-confirmation",
        recipientEmail: parentEmail,
        idempotencyKey: `registration-confirmation-${registrationId}`,
        replyTo: "musichof@gmail.com",
        templateData: {
          parentName,
          studentName,
          yearName,
          branch,
          instruments,
          lessonDuration,
          registrationUrl,
          submittedAt,
          approvalText,
          sectionsText,
        },
      }),
    });

    const body = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) {
      console.error("send-transactional-email failed:", sendRes.status, body);
      return new Response(JSON.stringify({ error: "Send failed", details: body }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, result: body }), {
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
