// Temporary diagnostic: probes iCount income-type (מיון הכנסות) endpoints.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BASE = "https://api.icount.co.il/api/v3.php";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = {
    cid: Deno.env.get("ICOUNT_COMPANY_ID"),
    user: Deno.env.get("ICOUNT_USERNAME"),
    pass: Deno.env.get("ICOUNT_PASSWORD"),
  };
  const body = await req.json().catch(() => ({} as any));
  const calls: [string, Record<string, unknown>][] = body.calls ?? [["income_type/get_list", {}]];
  const out: Record<string, unknown> = {};
  for (const [path, extra] of calls) {
    try {
      const r = await fetch(`${BASE}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...auth, ...(extra || {}) }),
      });
      out[path] = (await r.text()).slice(0, 2000);
    } catch (e) {
      out[path] = String(e);
    }
  }
  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
