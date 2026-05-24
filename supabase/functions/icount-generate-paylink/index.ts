// Generates a dynamic iCount hosted payment-page URL for a Playing Schools
// (school_music) student via the iCount API. Stores the URL on the student row
// for future reuse and returns it to the caller.
//
// Anonymous-callable: invoked from the public registration form.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php";
const CAESAREA_NAMES = ["קיסריה", "קיסרייה"];

function auth() {
  const cid = Deno.env.get("ICOUNT_COMPANY_ID");
  const user = Deno.env.get("ICOUNT_USERNAME");
  const pass = Deno.env.get("ICOUNT_PASSWORD");
  if (!cid || !user || !pass) throw new Error("ICOUNT credentials missing");
  return { cid, user, pass };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { studentId } = await req.json().catch(() => ({}));
    if (!studentId) {
      return new Response(JSON.stringify({ error: "studentId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: student, error: stuErr } = await supabase
      .from("school_music_students")
      .select(`
        id, student_first_name, student_last_name, student_national_id,
        parent_name, parent_email, parent_phone, icount_payment_url,
        school_music_schools!school_music_students_school_music_school_id_fkey(school_name)
      `)
      .eq("id", studentId)
      .maybeSingle();

    if (stuErr || !student) {
      return new Response(JSON.stringify({ error: "student not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reuse existing URL if already generated.
    if (student.icount_payment_url) {
      return new Response(JSON.stringify({ url: student.icount_payment_url, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const schoolName: string = (student as any).school_music_schools?.school_name ?? "";
    const studentName = `${student.student_first_name ?? ""} ${student.student_last_name ?? ""}`.trim();
    const amount = CAESAREA_NAMES.some((n) => schoolName.includes(n)) ? 1600 : 650;
    const description = `שכר לימוד - תלמיד: ${studentName}, בית ספר: ${schoolName}`;

    const creds = auth();
    const payload = {
      ...creds,
      doctype: "invrec", // tax invoice + receipt
      lang: "he",
      currency_code: "ILS",
      client_name: student.parent_name || studentName,
      email: student.parent_email || undefined,
      send_email: student.parent_email ? "1" : "0",
      vat_id: student.student_national_id || undefined,
      items: [
        {
          description,
          unitprice_incvat: amount,
          quantity: 1,
        },
      ],
      // Custom metadata returned in IPN so we can match the payment back to the student.
      custom_info: studentId,
    };

    const res = await fetch(`${ICOUNT_BASE}/cc/page/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    console.log("[icount-generate-paylink]", JSON.stringify(data));

    const url: string | undefined =
      data?.payment_url || data?.url || data?.page_url || data?.paypage_url;

    if (!data?.status || !url) {
      return new Response(JSON.stringify({ error: "iCount paypage create failed", details: data }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("school_music_students")
      .update({ icount_payment_url: url })
      .eq("id", studentId);

    return new Response(JSON.stringify({ url, amount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[icount-generate-paylink]", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
