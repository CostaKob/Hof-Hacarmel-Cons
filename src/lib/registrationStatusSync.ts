import { supabase } from "@/integrations/supabase/client";

/** Count requested instrument slots — Classical + Electric Guitar count as one. */
export function countRequestedSlots(requested: string[] | null | undefined): number {
  const names = requested ?? [];
  let guitarSeen = false, bassSeen = false, slots = 0;
  for (const raw of names) {
    const name = (raw ?? "").trim();
    if (!name) continue;
    if (name.includes("בס")) { if (!bassSeen) { slots++; bassSeen = true; } continue; }
    if (name.includes("גיטרה")) { if (!guitarSeen) { slots++; guitarSeen = true; } continue; }
    slots++;
  }
  return slots;
}

/**
 * Recompute registration status for all registrations of a student in a year,
 * based on requested_instruments vs. actual enrollments.
 * Only touches rows currently in {converted, partially_converted}.
 */
export async function syncRegistrationStatusForStudentYear(
  studentId: string | null | undefined,
  yearId: string | null | undefined,
): Promise<void> {
  if (!studentId || !yearId) return;

  const { data: regs } = await supabase
    .from("registrations" as any)
    .select("id, requested_instruments, status")
    .eq("existing_student_id", studentId)
    .eq("academic_year_id", yearId);

  const rows = (regs as any[] | null) ?? [];
  if (rows.length === 0) return;

  const { count } = await supabase
    .from("enrollments")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId)
    .eq("academic_year_id", yearId);
  const enrollCount = count ?? 0;

  for (const r of rows) {
    if (r.status !== "converted" && r.status !== "partially_converted") continue;
    const slots = countRequestedSlots(r.requested_instruments);
    const newStatus = slots > 0 && enrollCount < slots ? "partially_converted" : "converted";
    if (newStatus !== r.status) {
      await supabase.from("registrations" as any).update({ status: newStatus }).eq("id", r.id);
    }
  }
}
