import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useTeacherProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["teacher-profile", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("*")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useTeacherEnrollments(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-enrollments", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          *,
          students (*),
          instruments (name),
          schools (name)
        `)
        .eq("teacher_id", teacherId!)
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });
}

export function useTeacherLastReport(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-last-report", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("report_date")
        .eq("teacher_id", teacherId!)
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useEnrollmentDetails(enrollmentId: string | undefined) {
  return useQuery({
    queryKey: ["enrollment-details", enrollmentId],
    enabled: !!enrollmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          *,
          students (*),
          instruments (name),
          schools (name)
        `)
        .eq("id", enrollmentId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useStudentNotes(studentId: string | undefined, teacherId: string | undefined) {
  return useQuery({
    queryKey: ["student-notes", studentId, teacherId],
    enabled: !!studentId && !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_notes")
        .select("*, profiles:author_user_id(full_name)")
        .eq("student_id", studentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // RLS already filters to only notes this teacher can see
      return data;
    },
  });
}
