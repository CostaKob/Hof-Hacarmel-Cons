// Webhook receiver for iCount payment completion.
// Configure in iCount dashboard:
//   https://<project-ref>.functions.supabase.co/icount-sm-payment-webhook
//
// Marks the matching school_music_payments row as paid and stores the iCount doc info.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function resolvePaypageIdFromUrl(url?: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url.split("?")[0], { redirect: "follow" });
    const campaign = new URL(res.url || url).searchParams.get("utm_campaign");
    return campaign && /^\d+$/.test(campaign) ? campaign : null;
  } catch {
    return null;
  }
}

async function parseBody(req: Request): Promise<Record<string, any>> {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return await req.json();
  }
  const text = await req.text();
  try {
    return JSON.parse(text);
  } catch {
    // form-urlencoded fallback
    const params = new URLSearchParams(text);
    const obj: Record<string, any> = {};
    for (const [k, v] of params.entries()) obj[k] = v;
    return obj;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await parseBody(req);
    console.log("[icount-sm-payment-webhook] payload:", JSON.stringify(body));

    const paymentId: string | undefined =
      body.custom || body.custom_field || body.metadata?.payment_id;
    const docId = String(body.doc_id ?? body.docnum ?? body.doc_number ?? "");
    const docNumber = String(body.docnum ?? body.doc_number ?? "");
    const docUrl = body.doc_url || body.pdf_link || body.url || body.invoice_url || null;
    const paymentPageId = String(body.payment_page_id ?? body.pay_page_id ?? "");
    const txRef = body.transaction_id || body.cc_token || body.confirmation_code || null;
    const status = String(body.status ?? "").toLowerCase();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Locate the payment row
    let { data: payment } = paymentId
      ? await supabase.from("school_music_payments").select("*").eq("id", paymentId).maybeSingle()
      : { data: null as any };

    if (!payment && paymentPageId) {
      const r = await supabase
        .from("school_music_payments")
        .select("*")
        .eq("icount_payment_page_id", paymentPageId)
        .maybeSingle();
      payment = r.data;
    }

    if (!payment) {
      console.error("[icount-sm-payment-webhook] payment not found", { paymentId, paymentPageId });
      // Acknowledge 200 to prevent iCount retries on unmatchable events
      return new Response(JSON.stringify({ ok: false, reason: "not_found" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Treat any non-explicit-failure as success (iCount sends "1" / true / "success")
    const isSuccess = status === "" || status === "1" || status === "true" || status === "ok" || status === "success" || status === "paid";

    if (!isSuccess) {
      await supabase.from("school_music_payments").update({
        payment_status: "failed",
        notes: `${payment.notes ?? ""}\nתשלום נכשל: ${JSON.stringify(body).slice(0, 200)}`.trim(),
      }).eq("id", payment.id);
      return new Response(JSON.stringify({ ok: true, status: "failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const updates: Record<string, any> = {
      payment_status: "paid",
      payment_method: "credit_card",
      paid_at: new Date().toISOString(),
    };
    if (docId) updates.icount_doc_id = docId;
    if (docNumber) updates.icount_doc_number = docNumber;
    if (docUrl) updates.invoice_url = docUrl;
    if (txRef) updates.transaction_reference = String(txRef);
    if (paymentPageId && !payment.icount_payment_page_id) updates.icount_payment_page_id = paymentPageId;
    updates.icount_doc_type = "receipt";

    const { error: updErr } = await supabase
      .from("school_music_payments")
      .update(updates)
      .eq("id", payment.id);

    if (updErr) {
      console.error("[icount-sm-payment-webhook] update failed", updErr);
      return new Response(JSON.stringify({ ok: false, error: updErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cleanup: delete the dynamic paypage from iCount so the list only
    // contains unpaid students. Failures here are non-fatal.
    try {
      const ppid = paymentPageId || payment.icount_payment_page_id || await resolvePaypageIdFromUrl(payment.payment_link_url || null);
      if (ppid) {
        const delRes = await fetch("https://api.icount.co.il/api/v3.php/paypage/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cid: Deno.env.get("ICOUNT_COMPANY_ID"),
            user: Deno.env.get("ICOUNT_USERNAME"),
            pass: Deno.env.get("ICOUNT_PASSWORD"),
            paypage_id: ppid,
          }),
        });
        const delJson = await delRes.json().catch(() => ({}));
        console.log("[icount-sm-payment-webhook] paypage/delete", ppid, delJson);
        // Clear cached link so we don't try to reuse a dead URL.
        await supabase.from("school_music_payments")
          .update({ payment_link_url: null })
          .eq("id", payment.id);
      } else {
        console.log("[icount-sm-payment-webhook] no paypage id to delete");
      }
    } catch (cleanupErr) {
      console.warn("[icount-sm-payment-webhook] paypage cleanup failed", cleanupErr);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-sm-payment-webhook]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
