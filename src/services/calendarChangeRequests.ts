import { supabase } from "@/integrations/supabase/client";
import {
  createCalendarItem,
  updateCalendarItem,
  deleteCalendarItem,
  type CalendarFormValues,
} from "./calendarStore";

export type ChangeRequestAction = "create" | "update" | "delete";
export type ChangeRequestStatus = "pending" | "approved" | "rejected";

export interface CalendarChangeRequest {
  id: string;
  action: ChangeRequestAction;
  calendar_item_id: string | null;
  payload: CalendarFormValues | null;
  snapshot: (CalendarFormValues & { title_he?: string }) | null;
  status: ChangeRequestStatus;
  requested_by: string;
  requested_by_name: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
}

const ACTION_LABEL: Record<ChangeRequestAction, string> = {
  create: "הוספת אירוע",
  update: "עריכת אירוע",
  delete: "מחיקת אירוע",
};

export const changeRequestActionLabel = (a: ChangeRequestAction) => ACTION_LABEL[a];

/** רכז שולח בקשת שינוי — לא נוגע בלוח עצמו עד לאישור מנהל. */
export const submitCalendarChangeRequest = async (args: {
  action: ChangeRequestAction;
  calendarItemId?: string | null;
  payload?: CalendarFormValues | null;
  snapshot?: CalendarFormValues | null;
  requestedByName?: string | null;
}) => {
  const { data, error } = await supabase
    .from("calendar_change_requests")
    .insert({
      action: args.action,
      calendar_item_id: args.calendarItemId ?? null,
      payload: (args.payload ?? null) as any,
      snapshot: (args.snapshot ?? null) as any,
      requested_by_name: args.requestedByName ?? null,
    } as any)
    .select()
    .single();
  if (error) throw error;
  return data as unknown as CalendarChangeRequest;
};

export const fetchPendingChangeRequests = async () => {
  const { data, error } = await supabase
    .from("calendar_change_requests")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as CalendarChangeRequest[];
};

/** הבקשות ששלח המשתמש הנוכחי (לתצוגה בפורטל הרכז). */
export const fetchMyChangeRequests = async (limit = 30) => {
  const { data, error } = await supabase
    .from("calendar_change_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as CalendarChangeRequest[];
};

/** מנהל מאשר — הבקשה מיושמת בפועל על הלוח ואז מסומנת כמאושרת. */
export const approveChangeRequest = async (req: CalendarChangeRequest, reviewerId: string) => {
  if (req.action === "create" && req.payload) {
    await createCalendarItem(req.payload);
  } else if (req.action === "update" && req.calendar_item_id && req.payload) {
    await updateCalendarItem(req.calendar_item_id, req.payload);
  } else if (req.action === "delete" && req.calendar_item_id) {
    await deleteCalendarItem(req.calendar_item_id);
  }

  const { error } = await supabase
    .from("calendar_change_requests")
    .update({
      status: "approved",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    } as any)
    .eq("id", req.id);
  if (error) throw error;
};

export const rejectChangeRequest = async (
  requestId: string,
  reviewerId: string,
  note?: string,
) => {
  const { error } = await supabase
    .from("calendar_change_requests")
    .update({
      status: "rejected",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: note ?? null,
    } as any)
    .eq("id", requestId);
  if (error) throw error;
};
