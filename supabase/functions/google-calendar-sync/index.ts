// סנכרון דו-כיווני בין לוח השנה השנתי לבין Google Calendar (יומן ארגוני אחד).
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import { requireAdminOrSecretary } from "../_shared/requireAdmin.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";
const CALENDAR_ID = Deno.env.get("GOOGLE_CALENDAR_ID") ?? "primary";
const DEFAULT_TRACK_KEY = "regular";

type Json = Record<string, any>;

async function gcal(path: string, init: RequestInit = {}): Promise<Json> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const gcKey = Deno.env.get("GOOGLE_CALENDAR_API_KEY");
  if (!lovableKey || !gcKey) throw new Error("Missing connector secrets");
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gcKey,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    const err: any = new Error(`Google Calendar ${res.status}: ${text}`);
    err.status = res.status;
    throw err;
  }
  return text ? JSON.parse(text) : {};
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const TZ = "Asia/Jerusalem";

function addHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(h * 60 + m + 60, 23 * 60 + 59);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function itemToEvent(item: Json): Json {
  const description = item.description_he || undefined;
  const base = {
    summary: item.title_he,
    description,
    location: item.location_he || undefined,
    status: item.status === "cancelled" ? "cancelled" : "confirmed",
    extendedProperties: { private: { appItemId: item.id } },
  };

  // אירוע עם שעה — נשלח כאירוע ממוקד בזמן ולא כאירוע יום שלם
  if (item.start_time) {
    const startTime = String(item.start_time).slice(0, 5);
    const endTime = item.end_time ? String(item.end_time).slice(0, 5) : addHour(startTime);
    return {
      ...base,
      start: { dateTime: `${item.start_date}T${startTime}:00`, timeZone: TZ },
      end: { dateTime: `${item.end_date}T${endTime}:00`, timeZone: TZ },
    };
  }

  return {
    ...base,
    start: { date: item.start_date },
    end: { date: addDays(item.end_date, 1) },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // סנכרון יזום מ-cron: מזוהה באמצעות סוד ייעודי בכותרת, ללא משתמש מחובר.
  const cronSecret = Deno.env.get("CALENDAR_SYNC_CRON_KEY");
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;


  if (!isCron) {
    const authErr = await requireAdminOrSecretary(req, corsHeaders);
    if (authErr) return authErr;
  }


  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const result = { pushed: 0, pulled: 0, deletedRemote: 0, deletedLocal: 0, errors: [] as string[] };

  try {
    // ---------- 1. מחיקות מקומיות -> גוגל ----------
    const { data: deletions } = await supabase
      .from("calendar_sync_deletions")
      .select("*")
      .limit(200);
    for (const del of deletions ?? []) {
      try {
        await gcal(
          `/calendars/${encodeURIComponent(del.google_calendar_id || CALENDAR_ID)}/events/${del.google_event_id}`,
          { method: "DELETE" },
        );
        result.deletedRemote++;
      } catch (e: any) {
        if (!(e.status === 404 || e.status === 410)) result.errors.push(String(e.message));
      }
      await supabase.from("calendar_sync_deletions").delete().eq("id", del.id);
    }

    // ---------- 2. שינויים מקומיים -> גוגל ----------
    const { data: items } = await supabase.from("calendar_items").select("*");
    for (const item of items ?? []) {
      const changed =
        !item.google_synced_at ||
        new Date(item.updated_at).getTime() > new Date(item.google_synced_at).getTime() + 1000;
      if (!changed) continue;
      try {
        const body = itemToEvent(item);
        let ev: Json;
        if (item.google_event_id) {
          ev = await gcal(
            `/calendars/${encodeURIComponent(CALENDAR_ID)}/events/${item.google_event_id}`,
            { method: "PUT", body: JSON.stringify(body) },
          );
        } else {
          ev = await gcal(`/calendars/${encodeURIComponent(CALENDAR_ID)}/events`, {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
        await supabase
          .from("calendar_items")
          .update({
            google_event_id: ev.id,
            google_etag: ev.etag ?? null,
            google_calendar_id: CALENDAR_ID,
            google_synced_at: new Date().toISOString(),
          })
          .eq("id", item.id);
        result.pushed++;
      } catch (e: any) {
        result.errors.push(`push ${item.title_he}: ${e.message}`);
      }
    }

    // ---------- 3. גוגל -> מקומי ----------
    const { data: state } = await supabase
      .from("google_calendar_sync_state")
      .select("*")
      .eq("calendar_id", CALENDAR_ID)
      .maybeSingle();

    const { data: tracks } = await supabase.from("tracks").select("id,key");
    const defaultTrackId =
      tracks?.find((t: Json) => t.key === DEFAULT_TRACK_KEY)?.id ?? tracks?.[0]?.id;

    const fetchPage = async (pageToken?: string, syncToken?: string) => {
      const params = new URLSearchParams({ maxResults: "250", singleEvents: "true" });
      if (pageToken) params.set("pageToken", pageToken);
      if (syncToken) params.set("syncToken", syncToken);
      else {
        params.set("timeMin", "2026-07-01T00:00:00Z");
        params.set("timeMax", "2027-10-01T00:00:00Z");
      }
      return await gcal(
        `/calendars/${encodeURIComponent(CALENDAR_ID)}/events?${params.toString()}`,
      );
    };

    let syncToken: string | undefined = state?.sync_token ?? undefined;
    let pageToken: string | undefined;
    let nextSyncToken: string | undefined;
    const events: Json[] = [];

    try {
      do {
        const page: Json = await fetchPage(pageToken, syncToken);
        events.push(...(page.items ?? []));
        pageToken = page.nextPageToken;
        nextSyncToken = page.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
    } catch (e: any) {
      if (e.status === 410) {
        // אסימון פג — סנכרון מלא
        syncToken = undefined;
        pageToken = undefined;
        events.length = 0;
        do {
          const page: Json = await fetchPage(pageToken, undefined);
          events.push(...(page.items ?? []));
          pageToken = page.nextPageToken;
          nextSyncToken = page.nextSyncToken ?? nextSyncToken;
        } while (pageToken);
      } else {
        throw e;
      }
    }

    for (const ev of events) {
      try {
        const { data: local } = await supabase
          .from("calendar_items")
          .select("*")
          .eq("google_event_id", ev.id)
          .maybeSingle();

        if (ev.status === "cancelled") {
          if (local) {
            await supabase.from("calendar_sync_deletions").delete().eq("google_event_id", ev.id);
            await supabase.from("calendar_items").delete().eq("id", local.id);
            await supabase.from("calendar_sync_deletions").delete().eq("google_event_id", ev.id);
            result.deletedLocal++;
          }
          continue;
        }

        const startDate: string | undefined = ev.start?.date ?? ev.start?.dateTime?.slice(0, 10);
        const rawEnd: string | undefined = ev.end?.date ?? ev.end?.dateTime?.slice(0, 10);
        if (!startDate || !rawEnd) continue;
        const endDate = ev.end?.date ? addDays(rawEnd, -1) : rawEnd;
        const startTime = ev.start?.dateTime ? ev.start.dateTime.slice(11, 16) : null;
        const endTime = ev.end?.dateTime ? ev.end.dateTime.slice(11, 16) : null;

        const payload: Json = {
          title_he: ev.summary ?? "(ללא כותרת)",
          description_he: ev.description ?? null,
          location_he: ev.location ?? null,
          start_date: startDate,
          end_date: endDate < startDate ? startDate : endDate,
          start_time: startTime,
          end_time: endTime,
          google_event_id: ev.id,
          google_etag: ev.etag ?? null,
          google_calendar_id: CALENDAR_ID,
          google_synced_at: new Date().toISOString(),
        };

        if (local) {
          const remoteUpdated = new Date(ev.updated ?? 0).getTime();
          const localSynced = new Date(local.google_synced_at ?? 0).getTime();
          if (remoteUpdated > localSynced) {
            await supabase.from("calendar_items").update(payload).eq("id", local.id);
            result.pulled++;
          }
        } else {
          await supabase
            .from("calendar_items")
            .insert({ ...payload, track_id: defaultTrackId, status: "confirmed" });
          result.pulled++;
        }
      } catch (e: any) {
        result.errors.push(`pull ${ev.id}: ${e.message}`);
      }
    }

    if (nextSyncToken) {
      await supabase.from("google_calendar_sync_state").upsert(
        {
          calendar_id: CALENDAR_ID,
          sync_token: nextSyncToken,
          last_sync_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "calendar_id" },
      );
    }

    return new Response(JSON.stringify({ ok: true, calendarId: CALENDAR_ID, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("google-calendar-sync failed:", e.message);
    return new Response(JSON.stringify({ error: e.message, ...result }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
