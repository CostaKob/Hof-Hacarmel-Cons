// Creates an iCount hosted payment page link for a pending school_music_payments row.
// Returns { url } the parent is redirected to.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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

  try {
    const { paymentId, returnOrigin } = await req.json();
    if (!paymentId) {
      return new Response(JSON.stringify({ error: "paymentId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment, error } = await supabase
      .from("school_music_payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (error || !payment) {
      return new Response(JSON.stringify({ error: "payment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (payment.payment_status === "paid") {
      return new Response(JSON.stringify({ error: "payment already paid" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // If we already created a link for this payment, return it (idempotent)
    if (payment.payment_link_url) {
      return new Response(JSON.stringify({ url: payment.payment_link_url, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [{ data: studentRow }, { data: schoolRow }, { data: yearRow }] = await Promise.all([
      supabase
        .from("school_music_students")
        .select("student_first_name,student_last_name,parent_name,parent_phone,parent_email,city,class_name,instrument_id")
        .eq("id", payment.school_music_student_id)
        .maybeSingle(),
      payment.school_music_school_id
        ? supabase.from("school_music_schools").select("school_name").eq("id", payment.school_music_school_id).maybeSingle()
        : Promise.resolve({ data: null }),
      payment.academic_year_id
        ? supabase.from("academic_years").select("name").eq("id", payment.academic_year_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const student: any = studentRow || {};
    const school: any = schoolRow || {};
    const year: any = yearRow || {};
    const studentFullName = `${student.student_first_name ?? ""} ${student.student_last_name ?? ""}`.trim();
    const clientName = student.parent_name || studentFullName;

    const amount = Number(payment.amount || 0);
    if (amount <= 0) {
      return new Response(JSON.stringify({ error: "invalid amount" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parts = [
      school.school_name && `בית ספר: ${school.school_name}`,
      student.class_name && `כיתה: ${student.class_name}`,
      year.name && `שנת לימוד: ${year.name}`,
    ].filter(Boolean);
    const description = `דמי לימוד בית הספר המנגן — ${studentFullName}${parts.length ? ` (${parts.join(" | ")})` : ""}`;

    const origin = (returnOrigin || "").replace(/\/$/, "") ||
      (req.headers.get("origin") ?? "").replace(/\/$/, "") ||
      "https://musichof.com";

    const successUrl = `${origin}/school-music-register/success?payment_id=${paymentId}&status=ok`;
    const cancelUrl = `${origin}/school-music-register/success?payment_id=${paymentId}&status=cancel`;

    const auth = getAuth();

    // iCount hosted payment page creation.
    // NOTE: Endpoint name may need to match the exact iCount API enabled on the account.
    // We use payment_page/create_pay_page which is the documented hosted-page creator.
    const payload: any = {
      ...auth,
      sum: amount,
      currency_code: "ILS",
      lang: "he",
      vat_free: 1, // malkar — non-profit, no VAT
      description,
      client_name: clientName,
      client_email: student.parent_email || undefined,
      client_phone: student.parent_phone || undefined,
      send_email: !!student.parent_email,
      custom: paymentId,
      success_url: successUrl,
      cancel_url: cancelUrl,
      return_url: successUrl,
      doctype: "receipt",
      items: [{ description, unitprice_incvat: amount, quantity: 1 }],
    };

    const res = await fetch(`${ICOUNT_BASE}/payment_page/create_pay_page`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    console.log("[icount-create-sm-payment-link] response:", JSON.stringify(data));

    if (!data.status) {
      return new Response(JSON.stringify({ error: "icount failed", details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = data.url || data.pay_page_url || data.payment_url;
    const pageId = String(data.payment_page_id || data.pay_page_id || data.id || "");

    if (!url) {
      return new Response(JSON.stringify({ error: "no payment url returned", details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("school_music_payments").update({
      payment_link_url: url,
      icount_payment_page_id: pageId || null,
    }).eq("id", paymentId);

    return new Response(JSON.stringify({ url, payment_page_id: pageId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-create-sm-payment-link] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
