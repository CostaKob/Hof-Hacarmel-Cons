// Shared helper: validates the caller is an authenticated admin or secretary.
// Returns null on success, or a Response (401/403) to return immediately.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export async function requireAdminOrSecretary(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const [{ data: isAdmin }, { data: isSecretary }] = await Promise.all([
    supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "admin" }),
    supabaseAdmin.rpc("has_role", { _user_id: user.id, _role: "secretary" }),
  ]);

  if (!isAdmin && !isSecretary) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return null;
}
