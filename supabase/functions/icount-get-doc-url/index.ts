// Fetches (and caches) the public document URL from iCount for a student payment
// that has an iCount document but no stored invoice_url (e.g. refund receipts
// created before the URL was returned by the API).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdminOrSecretary } from "../_shared/requireAdmin.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php";

function getAuth() {
  const cid = Deno.env.get("ICOUNT_COMPANY_ID");
  const user = Deno.env.get("ICOUNT_USERNAME");
  const pass = Deno.env.get("ICOUNT_PASSWORD");
  if (!cid || !user || !pass) throw new Error("ICOUNT credentials missing");
  return { cid, user, pass };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const authFail = await requireAdminOrSecretary(req, corsHeaders);
  if (authFail) return authFail;

  try {
    const { paymentId } = await req.json();
    if (!paymentId) {
      return new Response(JSON.stringify({ error: "paymentId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment } = await supabase
      .from("student_payments")
      .select("id, invoice_url, icount_doc_id, icount_doc_number, icount_doc_type")
      .eq("id", paymentId)
      .maybeSingle();

    if (!payment) {
      return new Response(JSON.stringify({ error: "payment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (payment.invoice_url) {
      return new Response(JSON.stringify({ ok: true, url: payment.invoice_url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payment.icount_doc_number && !payment.icount_doc_id) {
      return new Response(JSON.stringify({ error: "no icount document" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auth = getAuth();
    const res = await fetch(`${ICOUNT_BASE}/doc/get_doc_url`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...auth,
        doctype: payment.icount_doc_type || "receipt",
        docnum: Number(payment.icount_doc_number) || payment.icount_doc_number,
        ...(payment.icount_doc_id ? { doc_id: payment.icount_doc_id } : {}),
        orig: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    console.log("[icount get_doc_url]", JSON.stringify(data));

    const url = data.url || data.doc_url || data.pdf_link || null;
    if (!url) {
      return new Response(JSON.stringify({ error: data.reason || data.message || "no url returned" }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("student_payments").update({ invoice_url: url }).eq("id", payment.id);

    return new Response(JSON.stringify({ ok: true, url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-get-doc-url]", e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
