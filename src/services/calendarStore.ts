import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type Track = Database["public"]["Tables"]["tracks"]["Row"];
export type Branch = Database["public"]["Tables"]["branches"]["Row"];
export type Person = Database["public"]["Tables"]["people"]["Row"];
export type CalendarItemRow = Database["public"]["Tables"]["calendar_items"]["Row"];

export type CalendarItemInsert = Database["public"]["Tables"]["calendar_items"]["Insert"];
export type CalendarItemUpdate = Database["public"]["Tables"]["calendar_items"]["Update"];

export type CalendarItem = CalendarItemRow & {
  track?: Track | null;
  branch?: Branch | null;
  person?: Person | null;
};

export type CalendarFormValues = {
  title_he: string;
  description_he: string;
  start_time: string;
  end_time: string;
  location_he: string;
  track_id: string;
  branch_id: string | null;
  person_id: string | null;
  availability_state: "reserves" | "at_work" | "home" | null;
  lane_index: number;
  start_date: string;
  end_date: string;
  status: "confirmed" | "tentative" | "cancelled";
};

/** טוען את כל הנתונים לטווח תאריכים אחד (שאילתה אחת לכל השנה). */
export const fetchCalendarData = async (rangeStart: string, rangeEnd: string) => {
  const [tracksRes, branchesRes, peopleRes, itemsRes] = await Promise.all([
    supabase.from("tracks").select("*").order("sort_order", { ascending: true }),
    supabase.from("branches").select("*").order("name_he", { ascending: true }),
    supabase.from("people").select("*").order("name_he", { ascending: true }),
    supabase
      .from("calendar_items")
      .select(
        `
        *,
        track:track_id (*),
        branch:branch_id (*),
        person:person_id (*)
      `
      )
      // חפיפה לטווח: מתחיל לפני סוף הטווח ומסתיים אחרי תחילתו
      .lte("start_date", rangeEnd)
      .gte("end_date", rangeStart)
      .order("start_date", { ascending: true }),
  ]);


  if (tracksRes.error) throw tracksRes.error;
  if (branchesRes.error) throw branchesRes.error;
  if (peopleRes.error) throw peopleRes.error;
  if (itemsRes.error) throw itemsRes.error;

  return {
    tracks: tracksRes.data as Track[],
    branches: branchesRes.data as Branch[],
    people: peopleRes.data as Person[],
    items: itemsRes.data as CalendarItem[],
  };
};

const toPayload = (values: CalendarFormValues) => ({
  title_he: values.title_he.trim(),
  description_he: values.description_he.trim() || null,
  start_time: values.start_time?.trim() ? values.start_time : null,
  end_time: values.end_time?.trim() ? values.end_time : null,
  location_he: values.location_he?.trim() || null,
  track_id: values.track_id,
  branch_id: values.branch_id,
  person_id: values.person_id,
  availability_state: values.availability_state,
  lane_index: values.lane_index ?? 0,
  start_date: values.start_date,
  end_date: values.end_date,
  status: values.status,
});

export const createCalendarItem = async (values: CalendarFormValues) => {
  const insert: CalendarItemInsert = toPayload(values);

  const { data, error } = await supabase.from("calendar_items").insert(insert).select().single();
  if (error) throw error;
  return data as CalendarItemRow;
};

export const updateCalendarItem = async (id: string, values: CalendarFormValues) => {
  const update: CalendarItemUpdate = toPayload(values);

  const { data, error } = await supabase
    .from("calendar_items")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as CalendarItemRow;
};

export const deleteCalendarItem = async (id: string) => {
  const { error } = await supabase.from("calendar_items").delete().eq("id", id);
  if (error) throw error;
};

/** משחזר פריט שנמחק, כולל אותו מזהה (לצורך ביטול פעולה / Undo). */
export const restoreCalendarItem = async (row: CalendarItemRow) => {
  const { created_at, updated_at, ...rest } = row as any;
  const { data, error } = await supabase
    .from("calendar_items")
    .insert(rest as CalendarItemInsert)
    .select()
    .single();
  if (error) throw error;
  return data as CalendarItemRow;
};
