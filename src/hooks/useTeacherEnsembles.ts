import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

async function getActiveYearId(): Promise<string | null> {
  const { data } = await supabase
    .from("academic_years")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();
  return data?.id ?? null;
}

// Teacher's ensemble staff assignments (active ensembles, current year only)
export function useTeacherEnsembleStaff(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-ensemble-staff-v2", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const yearId = await getActiveYearId();
      const { data, error } = await supabase
        .from("ensemble_staff")
        .select(`
          id, role, weekly_hours,
          ensembles!inner (
            id, name, ensemble_type, day_of_week, start_time, room, notes, is_active, academic_year_id,
            schools (id, name),
            ensemble_students (id, student_id)
          )
        `)
        .eq("teacher_id", teacherId!);
      if (error) throw error;
      return (data ?? []).filter(
        (s: any) => s.ensembles?.is_active && (!yearId || s.ensembles?.academic_year_id === yearId)
      );
    },
  });
}

// Single ensemble detail for teacher view
export function useTeacherEnsembleDetail(ensembleId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-ensemble-detail", ensembleId],
    enabled: !!ensembleId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ensembles")
        .select(`
          id, name, ensemble_type, day_of_week, start_time, room, notes, is_active,
          schools (id, name),
          ensemble_staff (id, role, weekly_hours, teacher_id, teachers (first_name, last_name)),
          ensemble_students (id, student_id, students (id, first_name, last_name, grade, phone, parent_name, parent_phone))
        `)
        .eq("id", ensembleId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}
