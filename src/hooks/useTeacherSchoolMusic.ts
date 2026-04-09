import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch schools where the teacher is assigned to at least one class group.
 * Uses school_music_class_groups → school_music_classes → school_music_schools.
 */
export function useTeacherSchoolMusicSchools(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-school-music-schools-v2", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      // 1. Get all class-group assignments for this teacher
      const { data: myGroups, error: gErr } = await supabase
        .from("school_music_class_groups")
        .select("id, school_music_class_id, instrument_id")
        .eq("teacher_id", teacherId!);
      if (gErr) throw gErr;
      if (!myGroups || myGroups.length === 0) return [];

      // 2. Get the classes for those groups
      const classIds = [...new Set(myGroups.map((g) => g.school_music_class_id))];
      const { data: classes, error: cErr } = await supabase
        .from("school_music_classes")
        .select("id, school_music_school_id, class_name")
        .in("id", classIds);
      if (cErr) throw cErr;

      // 3. Get the unique school IDs
      const schoolIds = [...new Set((classes ?? []).map((c) => c.school_music_school_id))];
      if (schoolIds.length === 0) return [];

      // 4. Fetch those schools
      const { data: schools, error: sErr } = await supabase
        .from("school_music_schools")
        .select("id, school_name, principal_name, principal_phone, academic_year_id, is_active")
        .in("id", schoolIds)
        .eq("is_active", true)
        .order("school_name");
      if (sErr) throw sErr;

      // Attach class count per school
      return (schools ?? []).map((s) => {
        const schoolClasses = (classes ?? []).filter((c) => c.school_music_school_id === s.id);
        return { ...s, classCount: schoolClasses.length };
      });
    },
  });
}

/**
 * Fetch classes + their groups for a specific school, filtered to the teacher's assignments.
 */
export function useTeacherSchoolMusicClasses(
  schoolId: string | undefined,
  teacherId: string | undefined
) {
  return useQuery({
    queryKey: ["teacher-school-music-classes-v2", schoolId, teacherId],
    enabled: !!schoolId && !!teacherId,
    queryFn: async () => {
      // 1. All classes for this school
      const { data: classes, error: cErr } = await supabase
        .from("school_music_classes")
        .select("id, class_name, homeroom_teacher_name, homeroom_teacher_phone, day_of_week, start_time, end_time, notes")
        .eq("school_music_school_id", schoolId!)
        .order("class_name");
      if (cErr) throw cErr;

      // 2. Teacher's groups in those classes
      const classIds = (classes ?? []).map((c) => c.id);
      if (classIds.length === 0) return [];

      const { data: myGroups, error: gErr } = await supabase
        .from("school_music_class_groups")
        .select("id, school_music_class_id, instrument_id, instruments(name)")
        .eq("teacher_id", teacherId!)
        .in("school_music_class_id", classIds);
      if (gErr) throw gErr;

      // 3. Only return classes where the teacher has groups
      const classIdsWithGroups = new Set((myGroups ?? []).map((g) => g.school_music_class_id));

      return (classes ?? [])
        .filter((c) => classIdsWithGroups.has(c.id))
        .map((c) => ({
          ...c,
          groups: (myGroups ?? []).filter((g) => g.school_music_class_id === c.id),
        }));
    },
  });
}

/**
 * Fetch students for a specific class.
 */
export function useTeacherSchoolMusicStudents(classId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-school-music-students-v2", classId],
    enabled: !!classId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_students")
        .select("id, student_first_name, student_last_name, parent_name, parent_phone, instrument_id, instruments(name), school_music_class_group_id")
        .eq("school_music_class_id", classId!)
        .order("student_last_name");
      if (error) throw error;
      return data ?? [];
    },
  });
}
