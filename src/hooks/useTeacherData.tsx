import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

// ─── Teacher Profile ───
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

// ─── Teacher Enrollments (active) ───
export function useTeacherEnrollments(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-enrollments", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`*, students (*), instruments (name), schools (id, name)`)
        .eq("teacher_id", teacherId!)
        .eq("is_active", true);
      if (error) throw error;
      // Filter out students who stopped studying
      return (data ?? []).filter((e: any) => e.students?.student_status !== "הפסיק");
    },
  });
}

// ─── Teacher Enrollments filtered by school ───
export function useTeacherEnrollmentsBySchool(teacherId: string | undefined, schoolId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-enrollments-school", teacherId, schoolId],
    enabled: !!teacherId && !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`*, students (*), instruments (name), schools (id, name)`)
        .eq("teacher_id", teacherId!)
        .eq("school_id", schoolId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []).filter((e: any) => e.students?.student_status !== "הפסיק");
    },
  });
}

// ─── Teacher Schools ───
export function useTeacherSchools(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-schools", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_schools")
        .select("school_id, schools (id, name)")
        .eq("teacher_id", teacherId!);
      if (error) throw error;
      return data;
    },
  });
}

// ─── Last Report ───
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

// ─── Teacher Reports List ───
export function useTeacherReports(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-reports", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select(`*, schools (name), report_lines (id, enrollment_id, status, enrollments (student_id, lesson_duration_minutes, students (first_name, last_name), instruments (name), schools (name)))`)
        .eq("teacher_id", teacherId!)
        .order("report_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

// ─── Single Report with Lines ───
export function useReportDetails(reportId: string | undefined) {
  return useQuery({
    queryKey: ["report-details", reportId],
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select(`*, schools (name)`)
        .eq("id", reportId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useReportLines(reportId: string | undefined) {
  return useQuery({
    queryKey: ["report-lines", reportId],
    enabled: !!reportId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_lines")
        .select(`*, enrollments (student_id, instrument_id, lesson_duration_minutes, enrollment_role, school_id, students (first_name, last_name), instruments (name), schools (name))`)
        .eq("report_id", reportId!);
      if (error) throw error;
      return data;
    },
  });
}

// ─── All reports for a teacher on a specific date ───
export function useTeacherReportsForDate(teacherId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ["teacher-reports-for-date", teacherId, date],
    enabled: !!teacherId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select(`*, schools (name)`)
        .eq("teacher_id", teacherId!)
        .eq("report_date", date!);
      if (error) throw error;
      return data;
    },
  });
}

// ─── All report lines for multiple report IDs ───
export function useReportLinesForReports(reportIds: string[]) {
  return useQuery({
    queryKey: ["report-lines-multi", ...reportIds],
    enabled: reportIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_lines")
        .select(`*, enrollments (student_id, instrument_id, lesson_duration_minutes, enrollment_role, school_id, students (first_name, last_name), instruments (name), schools (name))`)
        .in("report_id", reportIds);
      if (error) throw error;
      return data;
    },
  });
}

// ─── Kilometers used on a specific date ───
export function useKilometersForDate(teacherId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ["km-for-date", teacherId, date],
    enabled: !!teacherId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("kilometers")
        .eq("teacher_id", teacherId!)
        .eq("report_date", date!);
      if (error) throw error;
      return data?.reduce((sum, r) => sum + Number(r.kilometers), 0) ?? 0;
    },
  });
}

// ─── Enrollment Details ───
export function useEnrollmentDetails(enrollmentId: string | undefined) {
  return useQuery({
    queryKey: ["enrollment-details", enrollmentId],
    enabled: !!enrollmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`*, students (*), instruments (name), schools (name)`)
        .eq("id", enrollmentId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

// ─── Student Notes ───
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
      return data;
    },
  });
}
