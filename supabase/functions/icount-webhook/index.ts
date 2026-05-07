// iCount payment webhook receiver - placeholder.
// In the future, will validate signature and update student_payments.is_paid / amount_paid.
import { corsHeaders } from "@supabase/supabase-js/cors";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    console.log("[icount-webhook] received payload:", JSON.stringify(body));
    // TODO: verify signature, lookup payment by reference, update student_payments.
    return new Response(JSON.stringify({ ok: true, received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    console.error("[icount-webhook] error:", e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
