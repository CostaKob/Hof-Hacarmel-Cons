import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface BranchCoordinatorRow {
  id: string;
  teacher_id: string;
  branch_name: string;
  weekly_hours: number;
  school_id: string | null;
  academic_year_id: string | null;
  created_at: string;
  schools: { id: string; name: string } | null;
}

export function useBranchCoordinatorBranches(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["branch-coordinator-branches", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_coordinators")
        .select(`id, teacher_id, branch_name, weekly_hours, school_id, academic_year_id, created_at, schools (id, name)`)
        .eq("teacher_id", teacherId!)
        .not("school_id", "is", null)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as BranchCoordinatorRow[];
    },
  });
}

export function useBranchCoordinatorSchoolIds(teacherId: string | undefined) {
  const { data: branches } = useBranchCoordinatorBranches(teacherId);
  return branches?.map((b) => b.school_id!).filter(Boolean) ?? [];
}

export function useIsBranchCoordinator(teacherId: string | undefined) {
  const { data: branches } = useBranchCoordinatorBranches(teacherId);
  return (branches?.length ?? 0) > 0;
}
