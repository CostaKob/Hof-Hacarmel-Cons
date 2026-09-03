import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Only these accounts may see teacher login activity
const ALLOWED_EMAILS = ["costakob@gmail.com", "amirstoler@gmail.com"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Not authorized -> return empty result (200) so the client UI doesn't error out
    const denied = () =>
      new Response(JSON.stringify({ logins: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return denied();

    const { data: { user: caller } } = await supabaseAdmin.auth.getUser(token);
    if (!caller) return denied();

    const callerEmail = (caller.email ?? "").trim().toLowerCase();
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: caller.id,
      _role: "admin",
    });

    if (!isAdmin || !ALLOWED_EMAILS.includes(callerEmail)) return denied();


    // Collect all auth users (paginated)
    const logins: Record<string, string | null> = {};
    let page = 1;
    while (true) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      const users = data?.users ?? [];
      for (const u of users) {
        const signIn = u.last_sign_in_at ? new Date(u.last_sign_in_at).getTime() : 0;
        const updated = (u as any).updated_at ? new Date((u as any).updated_at).getTime() : 0;
        const latest = Math.max(signIn, updated);
        logins[u.id] = latest > 0 ? new Date(latest).toISOString() : null;
      }
      if (users.length < 1000) break;
      page++;
      if (page > 20) break;
    }

    return new Response(JSON.stringify({ logins }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error)?.message ?? err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
