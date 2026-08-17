// Temporary diagnostic: lists iCount income categories (מיון הכנסות).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const BASE = "https://api.icount.co.il/api/v3.php";
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const auth = {
    cid: Deno.env.get("ICOUNT_COMPANY_ID"),
    user: Deno.env.get("ICOUNT_USERNAME"),
    pass: Deno.env.get("ICOUNT_PASSWORD"),
  };
  const paths = ["income_category/get_list", "inc_class/get_list", "classification/get_list", "doc/income_types", "general/income_types", "item/get_list"];
  const out: Record<string, unknown> = {};
  for (const p of paths) {
    try {
      const r = await fetch(`${BASE}/${p}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(auth) });
      const t = await r.text();
      out[p] = t.slice(0, 1500);
    } catch (e) { out[p] = String(e); }
  }
  return new Response(JSON.stringify(out, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
