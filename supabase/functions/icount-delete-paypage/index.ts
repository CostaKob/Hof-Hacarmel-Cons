// Deletes the dynamic iCount Paypage attached to a school_music_payments row,
// then clears payment_link_url. Used when the admin closes a pending payment
// out-of-band (e.g. records a cash payment) and we don't want a stale paypage
// lingering in iCount.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { paymentId, studentId, strict = false } = await req.json().catch(() => ({}));
    if (!paymentId && !studentId) {
      return new Response(JSON.stringify({ error: "paymentId or studentId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment } = paymentId
      ? await supabase
        .from("school_music_payments")
        .select("id, school_music_student_id, payment_link_url, icount_payment_page_id")
        .eq("id", paymentId)
        .maybeSingle()
      : { data: null };

    const { data: student } = !payment && studentId
      ? await supabase
        .from("school_music_students")
        .select("id, icount_payment_url")
        .eq("id", studentId)
        .maybeSingle()
      : { data: null };

    if (!payment && !student) {
      return new Response(JSON.stringify({ ok: true, skipped: "no payment" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const linkUrl = payment?.payment_link_url || student?.icount_payment_url || null;
    const ppidFromUrl = linkUrl
      ? (linkUrl.match(/\/m\/([^/?#]+)/)?.[1] ?? null)
      : null;
    const ppid = payment?.icount_payment_page_id || ppidFromUrl;

    if (ppid) {
      try {
        const res = await fetch("https://api.icount.co.il/api/v3.php/paypage/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cid: Deno.env.get("ICOUNT_COMPANY_ID"),
            user: Deno.env.get("ICOUNT_USERNAME"),
            pass: Deno.env.get("ICOUNT_PASSWORD"),
            paypage_id: ppid,
          }),
        });
        const json = await res.json().catch(() => ({}));
        console.log("[icount-delete-paypage]", ppid, json);
        const apiFailure = json?.status === false || json?.status === 0;
        const alreadyDeleted = res.status === 404 || String(json?.reason ?? json?.error ?? "").toLowerCase().includes("not found");
        if ((!res.ok || apiFailure) && !alreadyDeleted) {
          throw new Error(`iCount paypage/delete failed: ${JSON.stringify(json)}`);
        }
      } catch (e) {
        console.warn("[icount-delete-paypage] iCount call failed", e);
        if (strict) {
          return new Response(JSON.stringify({ error: String(e) }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (paymentId) {
      await supabase.from("school_music_payments")
        .update({ payment_link_url: null })
        .eq("id", paymentId);
    }

    const cleanupStudentId = payment?.school_music_student_id || studentId;
    if (cleanupStudentId) {
      await supabase.from("school_music_students")
        .update({ icount_payment_url: null })
        .eq("id", cleanupStudentId);
    }

    return new Response(JSON.stringify({ ok: true, deleted: ppid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-delete-paypage]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
