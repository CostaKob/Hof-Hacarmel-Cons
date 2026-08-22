import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * האם המורה הוא רכז (בי״ס מנגן / שלוחה) או מנצח תזמורת — ולכן רשאי לצפות
 * בלוח השנה השנתי ולשלוח בקשות שינוי לאישור מנהל.
 */
export function useIsCalendarCoordinator(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["is-calendar-coordinator-v2", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const [sm, branch, conductor] = await Promise.all([
        supabase
          .from("school_music_schools")
          .select("id")
          .eq("coordinator_teacher_id", teacherId!)
          .limit(1),
        supabase
          .from("branch_coordinators")
          .select("id")
          .eq("teacher_id", teacherId!)
          .limit(1),
        supabase
          .from("ensemble_staff")
          .select("id")
          .eq("teacher_id", teacherId!)
          .eq("role", "conductor")
          .limit(1),
      ]);
      if (sm.error) throw sm.error;
      if (branch.error) throw branch.error;
      if (conductor.error) throw conductor.error;
      return (
        (sm.data?.length ?? 0) > 0 ||
        (branch.data?.length ?? 0) > 0 ||
        (conductor.data?.length ?? 0) > 0
      );
    },
  });
}

