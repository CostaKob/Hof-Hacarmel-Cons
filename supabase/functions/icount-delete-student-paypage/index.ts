// Deletes the dynamic iCount Paypage attached to a student_payments row,
// then clears payment_link_url. Used when the admin cancels a pending student
// payment link so we don't leave a stale paypage in iCount.
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
    console.warn("[icount-delete-student-paypage] resolve failed", e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFail = await requireAdminOrSecretary(req, corsHeaders);
  if (authFail) return authFail;



  try {
    const { paymentId, paypageId, strict = false } = await req.json().catch(() => ({}));
    if (!paymentId && !paypageId) {
      return new Response(JSON.stringify({ error: "paymentId or paypageId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment } = paymentId
      ? await supabase
        .from("student_payments")
        .select("id, payment_link_url, icount_payment_page_id")
        .eq("id", paymentId)
        .maybeSingle()
      : { data: null };

    const linkUrl = payment?.payment_link_url || null;
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
        console.log("[icount-delete-student-paypage]", ppid, json);
        const apiFailure = json?.status === false || json?.status === 0;
        const reason = String(json?.reason ?? json?.error ?? "").toLowerCase();
        const alreadyDeleted = res.status === 404 || reason.includes("not found") || reason.includes("paypage_not_found");
        if ((!res.ok || apiFailure) && !alreadyDeleted) {
          throw new Error(`iCount paypage/delete failed: ${JSON.stringify(json)}`);
        }
        deletedPaypageId = ppid;
      } catch (e) {
        console.warn("[icount-delete-student-paypage] iCount call failed", e);
        if (strict) {
          return new Response(JSON.stringify({ error: String(e) }), {
            status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    if (paymentId) {
      await supabase.from("student_payments")
        .update({ payment_link_url: null, icount_payment_page_id: null })
        .eq("id", paymentId);
    }

    return new Response(JSON.stringify({ ok: true, deleted: deletedPaypageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-delete-student-paypage]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
