import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "לא מורשה" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) {
      return new Response(JSON.stringify({ error: "לא מורשה" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "הרשאת מנהל נדרשת" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { teacher_id, new_email } = await req.json();
    if (!teacher_id || !new_email) {
      return new Response(JSON.stringify({ error: "חסרים שדות חובה" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const normalizedEmail = String(new_email).trim().toLowerCase();

    // Fetch teacher
    const { data: teacher, error: teacherErr } = await supabaseAdmin
      .from("teachers")
      .select("id, user_id, email")
      .eq("id", teacher_id)
      .maybeSingle();

    if (teacherErr || !teacher) {
      return new Response(JSON.stringify({ error: "המורה לא נמצא" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!teacher.user_id) {
      return new Response(JSON.stringify({ error: "למורה אין חשבון כניסה" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check email not used by another user
    const { data: list } = await supabaseAdmin.auth.admin.listUsers();
    const conflict = list?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail && u.id !== teacher.user_id
    );
    if (conflict) {
      return new Response(
        JSON.stringify({ error: "כתובת המייל כבר בשימוש על ידי משתמש אחר" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update auth user (bypass confirmation)
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      teacher.user_id,
      { email: normalizedEmail, email_confirm: true }
    );
    if (updErr) {
      return new Response(
        JSON.stringify({ error: `שגיאה בעדכון מייל: ${updErr.message}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sync teachers + profiles tables
    await supabaseAdmin.from("teachers").update({ email: normalizedEmail }).eq("id", teacher_id);
    await supabaseAdmin.from("profiles").update({ email: normalizedEmail }).eq("id", teacher.user_id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `שגיאה פנימית: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
