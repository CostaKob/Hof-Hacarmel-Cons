import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const SPREADSHEET_ID = "1fL1-FEfZmn6WJFOwhTYusmyBaGG7X3k6QpjRd155E_0";
const GATEWAY = "https://connector-gateway.lovable.dev/google_sheets/v4";

async function getFirstSheetName(): Promise<string> {
  const meta = await gsFetch(`/spreadsheets/${SPREADSHEET_ID}?fields=sheets.properties.title`);
  const title = meta?.sheets?.[0]?.properties?.title;
  if (!title) throw new Error("No sheets found in spreadsheet");
  return title;
}

function quoteSheet(name: string): string {
  // Quote sheet name for A1 notation (needed for non-ASCII / spaces)
  return `'${name.replace(/'/g, "''")}'`;
}

const HEADERS = [
  "תאריך הרשמה",
  "סטטוס תלמיד",
  "שם פרטי",
  "שם משפחה",
  "ת.ז. תלמיד",
  "מין",
  "כיתה",
  "ישוב",
  "בית ספר ללימודי בוקר",
  "שלוחה",
  "כלים מבוקשים",
  "משך שיעור",
  "טלפון תלמיד",
  "שם הורה",
  "ת.ז. הורה",
  "טלפון הורה",
  "אימייל הורה",
  "הפקה מוסיקלית",
  "מסלול רסיטל",
  "הערות",
];

async function gsFetch(path: string, init: RequestInit = {}) {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gsKey = Deno.env.get("GOOGLE_SHEETS_API_KEY");
  if (!lovableKey || !gsKey) throw new Error("Missing connector secrets");
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gsKey,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${body}`);
  return body ? JSON.parse(body) : {};
}

async function ensureHeaders() {
  const data = await gsFetch(
    `/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:T1`,
  );
  const hasHeaders = Array.isArray(data.values) && data.values.length > 0 && (data.values[0] as string[]).length > 0;
  if (!hasHeaders) {
    await gsFetch(
      `/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1?valueInputOption=RAW`,
      { method: "PUT", body: JSON.stringify({ values: [HEADERS] }) },
    );
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { registrationId } = await req.json();
    if (!registrationId) throw new Error("Missing registrationId");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: r, error } = await supabase
      .from("registrations")
      .select("*")
      .eq("id", registrationId)
      .maybeSingle();
    if (error) throw error;
    if (!r) throw new Error("Registration not found");

    await ensureHeaders();

    const row = [
      r.created_at ? new Date(r.created_at).toLocaleString("he-IL") : "",
      r.student_status ?? "",
      r.student_first_name ?? "",
      r.student_last_name ?? "",
      r.student_national_id ?? "",
      r.gender === "male" ? "זכר" : r.gender === "female" ? "נקבה" : (r.gender ?? ""),
      r.grade ?? "",
      r.city ?? "",
      r.educational_school ?? "",
      r.branch_school_name ?? "",
      Array.isArray(r.requested_instruments) ? (r.requested_instruments as string[]).join(", ") : "",
      r.requested_lesson_duration ?? "",
      r.student_phone ?? "",
      r.parent_name ?? "",
      r.parent_national_id ?? "",
      r.parent_phone ?? "",
      r.parent_email ?? "",
      r.wants_music_production ? "כן" : "",
      r.wants_recital_track ? "כן" : "",
      r.notes ?? "",
    ];

    await gsFetch(
      `/spreadsheets/${SPREADSHEET_ID}/values/${SHEET_NAME}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { method: "POST", body: JSON.stringify({ values: [row] }) },
    );

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("sync-registration-to-sheets error:", e);
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
