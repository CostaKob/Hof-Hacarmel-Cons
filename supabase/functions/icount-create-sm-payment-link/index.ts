// Builds a redirect URL to the school's standing iCount payment page,
// prefilled with the parent/student details and the payment_id as `custom`.
// No iCount API call is made — the page URL is configured per school by admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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

    const [{ data: studentRow }, { data: schoolRow }, { data: yearRow }] = await Promise.all([
      supabase
        .from("school_music_students")
        .select("student_first_name,student_last_name,student_national_id,parent_name,parent_phone,parent_email,city,class_name,instrument_id")
        .eq("id", payment.school_music_student_id)
        .maybeSingle(),
      payment.school_music_school_id
        ? supabase.from("school_music_schools")
            .select("school_name,icount_payment_page_url")
            .eq("id", payment.school_music_school_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
      payment.academic_year_id
        ? supabase.from("academic_years").select("name").eq("id", payment.academic_year_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
    ]);

    const student: any = studentRow || {};
    const school: any = schoolRow || {};
    const year: any = yearRow || {};

    const baseUrl: string | null = school.icount_payment_page_url || null;
    if (!baseUrl) {
      return new Response(JSON.stringify({
        error: "payment_page_not_configured",
        message: "עמוד הסליקה של בית הספר עוד לא הוגדר. אנא פנו למזכירות.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const studentFullName = `${student.student_first_name ?? ""} ${student.student_last_name ?? ""}`.trim();
    const clientName = student.parent_name || studentFullName;
    const amount = Number(payment.amount || 0);

    const descParts = [
      school.school_name && `בית ספר ${school.school_name}`,
      student.class_name && `כיתה ${student.class_name}`,
      studentFullName && `תלמיד: ${studentFullName}`,
      student.student_national_id && `ת"ז ${student.student_national_id}`,
      year.name && `שנה ${year.name}`,
    ].filter(Boolean);
    const description = `דמי לימוד בית הספר המנגן — ${descParts.join(" | ")}`;

    // Build URL with iCount-style query params. Most fields are best-effort —
    // iCount payment pages accept these names; unknown params are ignored.
    const u = new URL(baseUrl);
    const set = (k: string, v: string | number | undefined | null) => {
      if (v === undefined || v === null || v === "") return;
      u.searchParams.set(k, String(v));
    };
    set("custom", paymentId);
    set("sum", amount);
    set("amount", amount);
    set("description", description);
    set("client_name", clientName);
    set("contact_name", clientName);
    set("email", student.parent_email);
    set("phone", student.parent_phone);
    set("vat_id", student.student_national_id);

    const url = u.toString();

    await supabase.from("school_music_payments").update({
      payment_link_url: url,
    }).eq("id", paymentId);

    return new Response(JSON.stringify({ url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-create-sm-payment-link] error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
