import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * האם המורה הוא רכז (בי״ס מנגן או שלוחה) — ולכן רשאי לצפות בלוח השנה השנתי
 * ולשלוח בקשות שינוי לאישור מנהל.
 */
export function useIsCalendarCoordinator(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["is-calendar-coordinator", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const [sm, branch] = await Promise.all([
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
      ]);
      if (sm.error) throw sm.error;
      if (branch.error) throw branch.error;
      return (sm.data?.length ?? 0) > 0 || (branch.data?.length ?? 0) > 0;
    },
  });
}
