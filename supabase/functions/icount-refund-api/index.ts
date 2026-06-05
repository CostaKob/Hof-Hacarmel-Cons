// Cancels the original iCount document AND refunds the credit card transaction
// in a single call via /doc/cancel with refund_cc=1. Then writes a balancing
// negative row to school_music_payments for our accounting.
//
// NOTE: iCount's doc/cancel cancels the ENTIRE document — partial refunds are
// not supported on this path. We enforce refundAmount == original amount.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php";

function getToken() {
  const t = Deno.env.get("ICOUNT_API_TOKEN");
  if (!t) throw new Error("ICOUNT_API_TOKEN missing");
  return t;
}

async function icountPost(path: string, body: Record<string, any>, token: string) {
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) {
    if (v !== undefined && v !== null) form.append(k, String(v));
  }
  const res = await fetch(`${ICOUNT_BASE}${path}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { paymentId, refundAmount, reason } = await req.json();
    if (!paymentId) {
      return new Response(JSON.stringify({ error: "paymentId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: payment, error: payErr } = await supabase
      .from("school_music_payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (payErr || !payment) {
      return new Response(JSON.stringify({ error: "payment not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!payment.icount_doc_number || !payment.icount_doc_type) {
      return new Response(JSON.stringify({ error: "missing iCount document on this payment" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const original = Math.abs(Number(payment.amount ?? 0));
    const sum = Math.abs(Number(refundAmount ?? original));
    if (Math.abs(sum - original) > 0.01) {
      return new Response(JSON.stringify({
        error: `iCount תומך רק בביטול מלא של הקבלה. סכום הקבלה: ₪${original}, סכום שביקשת: ₪${sum}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Block if already refunded
    const { data: priorRefunds } = await supabase
      .from("school_music_payments")
      .select("id")
      .eq("refund_of_payment_id", paymentId);
    if ((priorRefunds ?? []).length > 0) {
      return new Response(JSON.stringify({ error: "כבר קיים זיכוי לקבלה זו" }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = getToken();
    const cancelBody = {
      doctype: payment.icount_doc_type,
      docnum: payment.icount_doc_number,
      refund_cc: 1,
      reason: reason || "החזר אשראי לבקשת התלמיד",
    };

    const { data } = await icountPost("/doc/cancel", cancelBody, token);
    console.log("[icount doc/cancel sm]", JSON.stringify(data));

    if (!data?.status) {
      const errMsg = data?.reason || data?.error_description || "iCount cancel failed";
      return new Response(JSON.stringify({ error: errMsg, details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Write balancing credit row (negative) for our books
    const { data: credit, error: insErr } = await supabase
      .from("school_music_payments")
      .insert({
        school_music_student_id: payment.school_music_student_id,
        school_music_school_id: payment.school_music_school_id,
        academic_year_id: payment.academic_year_id,
        amount: -sum,
        payment_status: "refunded",
        payment_method: "credit_card",
        paid_at: new Date().toISOString(),
        notes: reason || `ביטול קבלה ${payment.icount_doc_number} והחזר אשראי`,
        refund_of_payment_id: payment.id,
        icount_doc_type: "refund",
        icount_transaction_id: payment.icount_transaction_id,
      })
      .select()
      .single();

    if (insErr) console.error("[icount-refund-api] insert credit row error", insErr);

    // Mark original payment as refunded
    await supabase
      .from("school_music_payments")
      .update({ payment_status: "refunded" })
      .eq("id", payment.id);

    return new Response(JSON.stringify({
      ok: true,
      cancelled_doc: payment.icount_doc_number,
      cc_refund: true,
      credit_payment_id: credit?.id,
      details: data,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[icount-refund-api]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
