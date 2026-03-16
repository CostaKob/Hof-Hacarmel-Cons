import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Teacher's ensemble staff assignments (active ensembles only)
export function useTeacherEnsembleStaff(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-ensemble-staff", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ensemble_staff")
        .select(`
          id, role, weekly_hours,
          ensembles (
            id, name, ensemble_type, day_of_week, start_time, room, notes, is_active,
            schools (id, name),
            ensemble_students (id, student_id)
          )
        `)
        .eq("teacher_id", teacherId!);
      if (error) throw error;
      // Only return active ensembles
      return (data ?? []).filter((s: any) => s.ensembles?.is_active);
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
