import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TeacherSchoolRole = "רכז" | "מנצח" | "מורה לקבוצה";

/**
 * Fetch schools where the teacher is coordinator, conductor, or group teacher.
 * Returns school data with roles.
 */
export function useTeacherSchoolMusicSchools(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-school-music-schools-v3", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      // 1. Schools where teacher is coordinator or conductor
      const { data: directSchools, error: dsErr } = await supabase
        .from("school_music_schools")
        .select("id, school_name, principal_name, principal_phone, coordinator_teacher_id, conductor_teacher_id, is_active")
        .eq("is_active", true)
        .or(`coordinator_teacher_id.eq.${teacherId},conductor_teacher_id.eq.${teacherId}`);
      if (dsErr) throw dsErr;

      // 2. Schools via class groups
      const { data: myGroups, error: gErr } = await supabase
        .from("school_music_class_groups")
        .select("school_music_class_id")
        .eq("teacher_id", teacherId!);
      if (gErr) throw gErr;

      let groupSchoolIds: string[] = [];
      if (myGroups && myGroups.length > 0) {
        const classIds = [...new Set(myGroups.map((g) => g.school_music_class_id))];
        const { data: classes, error: cErr } = await supabase
          .from("school_music_classes")
          .select("school_music_school_id")
          .in("id", classIds);
        if (cErr) throw cErr;
        groupSchoolIds = [...new Set((classes ?? []).map((c) => c.school_music_school_id))];
      }

      // 3. Merge and deduplicate
      const directIds = new Set((directSchools ?? []).map((s) => s.id));
      const missingIds = groupSchoolIds.filter((id) => !directIds.has(id));

      let groupOnlySchools: any[] = [];
      if (missingIds.length > 0) {
        const { data, error } = await supabase
          .from("school_music_schools")
          .select("id, school_name, principal_name, principal_phone, coordinator_teacher_id, conductor_teacher_id, is_active")
          .eq("is_active", true)
          .in("id", missingIds);
        if (error) throw error;
        groupOnlySchools = data ?? [];
      }

      const allSchools = [...(directSchools ?? []), ...groupOnlySchools];
      const groupSchoolIdSet = new Set(groupSchoolIds);

      // 4. Count classes per school for each teacher
      const schoolIds = allSchools.map((s) => s.id);
      let classCounts: Record<string, number> = {};
      if (schoolIds.length > 0) {
        const { data: allClasses } = await supabase
          .from("school_music_classes")
          .select("id, school_music_school_id")
          .in("school_music_school_id", schoolIds);
        for (const c of allClasses ?? []) {
          classCounts[c.school_music_school_id] = (classCounts[c.school_music_school_id] || 0) + 1;
        }
      }

      return allSchools
        .map((s) => {
          const roles: TeacherSchoolRole[] = [];
          if (s.coordinator_teacher_id === teacherId) roles.push("רכז");
          if (s.conductor_teacher_id === teacherId) roles.push("מנצח");
          if (groupSchoolIdSet.has(s.id)) roles.push("מורה לקבוצה");
          return {
            ...s,
            teacherRoles: roles,
            classCount: classCounts[s.id] || 0,
          };
        })
        .filter((s) => s.teacherRoles.length > 0)
        .sort((a, b) => a.school_name.localeCompare(b.school_name, "he"));
    },
  });
}

/**
 * Fetch classes for a school.
 * Coordinator/Conductor see ALL classes; group teachers see only their classes.
 */
export function useTeacherSchoolMusicClasses(
  schoolId: string | undefined,
  teacherId: string | undefined,
  isAdmin: boolean // coordinator or conductor
) {
  return useQuery({
    queryKey: ["teacher-school-music-classes-v3", schoolId, teacherId, isAdmin],
    enabled: !!schoolId && !!teacherId,
    queryFn: async () => {
      // 1. All classes for this school
      const { data: classes, error: cErr } = await supabase
        .from("school_music_classes")
        .select("id, class_name, homeroom_teacher_name, homeroom_teacher_phone, day_of_week, start_time, end_time, notes")
        .eq("school_music_school_id", schoolId!)
        .order("class_name");
      if (cErr) throw cErr;
      if (!classes || classes.length === 0) return [];

      const classIds = classes.map((c) => c.id);

      // 2. All groups for those classes (with teacher + instrument info)
      const { data: allGroups, error: gErr } = await supabase
        .from("school_music_class_groups")
        .select("id, school_music_class_id, instrument_id, teacher_id, instruments(name), teachers(first_name, last_name)")
        .in("school_music_class_id", classIds);
      if (gErr) throw gErr;

      if (isAdmin) {
        // Coordinator/Conductor: see ALL classes with ALL groups
        return classes.map((c) => ({
          ...c,
          groups: (allGroups ?? []).filter((g) => g.school_music_class_id === c.id),
        }));
      }

      // Group teacher: only classes where they have groups
      const myClassIds = new Set(
        (allGroups ?? []).filter((g) => g.teacher_id === teacherId).map((g) => g.school_music_class_id)
      );

      return classes
        .filter((c) => myClassIds.has(c.id))
        .map((c) => ({
          ...c,
          groups: (allGroups ?? []).filter((g) => g.school_music_class_id === c.id),
        }));
    },
  });
}

/**
 * Fetch students for a specific class.
 */
export function useTeacherSchoolMusicStudents(classId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-school-music-students-v3", classId],
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
