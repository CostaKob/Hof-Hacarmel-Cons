// Deletes the dynamic iCount Paypage attached to a school_music_payments row,
// then clears payment_link_url. Used when the admin closes a pending payment
// out-of-band (e.g. records a cash payment) and we don't want a stale paypage
// lingering in iCount.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdminOrSecretary } from "../_shared/requireAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ICOUNT_API = "https://api.icount.co.il/api/v3.php";

async function resolvePaypageIdFromUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const baseUrl = url.split("?")[0];
    const res = await fetch(baseUrl, { redirect: "follow" });
    const finalUrl = res.url || baseUrl;
    const campaign = new URL(finalUrl).searchParams.get("utm_campaign");
    return campaign && /^\d+$/.test(campaign) ? campaign : null;
  } catch (e) {
    console.warn("[icount-delete-paypage] failed to resolve paypage id from url", e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFail = await requireAdminOrSecretary(req, corsHeaders);
  if (authFail) return authFail;



  try {
    const { paymentId, studentId, paypageId, strict = false } = await req.json().catch(() => ({}));
    if (!paymentId && !studentId && !paypageId) {
      return new Response(JSON.stringify({ error: "paymentId, studentId or paypageId required" }), {
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

    if (!payment && !student && !paypageId) {
      return new Response(JSON.stringify({ ok: true, skipped: "no payment" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const linkUrl = payment?.payment_link_url || student?.icount_payment_url || null;
    const ppid = String(paypageId || payment?.icount_payment_page_id || await resolvePaypageIdFromUrl(linkUrl) || "") || null;
    let deletedPaypageId: string | null = null;

    if (ppid) {
      try {
        const res = await fetch(`${ICOUNT_API}/paypage/delete`, {
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
        const reason = String(json?.reason ?? json?.error ?? "").toLowerCase();
        const alreadyDeleted = res.status === 404 || reason.includes("not found") || reason.includes("paypage_not_found");
        if ((!res.ok || apiFailure) && !alreadyDeleted) {
          throw new Error(`iCount paypage/delete failed: ${JSON.stringify(json)}`);
        }
        deletedPaypageId = ppid;
      } catch (e) {
        console.warn("[icount-delete-paypage] iCount call failed", e);
        if (strict) {
          return new Response(JSON.stringify({ error: String(e) }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } else {
      console.log("[icount-delete-paypage] no numeric paypage_id available; clearing DB only");
      if (strict) {
        return new Response(JSON.stringify({ error: "לא נמצא מזהה דף סליקה למחיקה ב-iCount" }), {
          status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    if (paymentId) {
      await supabase.from("school_music_payments")
        .update({ payment_link_url: null, icount_payment_page_id: null })
        .eq("id", paymentId);
    }

    const cleanupStudentId = payment?.school_music_student_id || studentId;
    if (cleanupStudentId) {
      await supabase.from("school_music_students")
        .update({ icount_payment_url: null })
        .eq("id", cleanupStudentId);
    }

    return new Response(JSON.stringify({ ok: true, deleted: deletedPaypageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-delete-paypage]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
