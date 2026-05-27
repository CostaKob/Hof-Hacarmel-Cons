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

    const { data: teachers, error: teachersError } = await supabaseAdmin
      .from("teachers")
      .select("id, first_name, last_name, user_id")
      .not("user_id", "is", null);

    if (teachersError) {
      return new Response(
        JSON.stringify({ error: `שגיאה בשליפת מורים: ${teachersError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const DEFAULT_PASSWORD = "123456";
    let success = 0;
    const failed: { teacher: string; error: string }[] = [];

    for (const t of teachers ?? []) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(t.user_id!, {
        password: DEFAULT_PASSWORD,
      });
      if (error) {
        failed.push({
          teacher: `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
          error: error.message,
        });
      } else {
        success += 1;
      }
    }

    return new Response(
      JSON.stringify({ success: true, updated: success, failed }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `שגיאה פנימית: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
