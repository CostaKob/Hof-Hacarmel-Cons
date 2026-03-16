import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** All school_music_schools where the teacher is group teacher, coordinator, or conductor */
export function useTeacherSchoolMusicSchools(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-school-music-schools", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      // RLS already filters to schools the teacher has access to
      const { data, error } = await supabase
        .from("school_music_schools")
        .select("*, academic_years(name)")
        .eq("is_active", true)
        .order("school_name");
      if (error) throw error;

      // Also fetch groups to determine teacher roles
      const { data: groups, error: gErr } = await supabase
        .from("school_music_groups")
        .select("school_music_school_id, teacher_id");
      if (gErr) throw gErr;

      return (data ?? []).map((s: any) => {
        const roles: string[] = [];
        const myGroups = (groups ?? []).filter(
          (g: any) => g.school_music_school_id === s.id && g.teacher_id === teacherId
        );
        if (myGroups.length > 0) roles.push("מורה לקבוצה");
        if (s.coordinator_teacher_id === teacherId) roles.push("רכז");
        if (s.conductor_teacher_id === teacherId) roles.push("מנצח");
        return { ...s, teacherRoles: roles, teacherGroupCount: myGroups.length };
      }).filter((s: any) => s.teacherRoles.length > 0);
    },
  });
}

/** Single school detail for teacher view */
export function useTeacherSchoolMusicDetail(schoolId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-school-music-detail", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_schools")
        .select(
          "*, academic_years(name), coordinator:teachers!school_music_schools_coordinator_teacher_id_fkey(id, first_name, last_name, phone), conductor:teachers!school_music_schools_conductor_teacher_id_fkey(id, first_name, last_name, phone)"
        )
        .eq("id", schoolId!)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useTeacherSchoolMusicGroups(schoolId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-school-music-groups", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_groups")
        .select("*, instruments(name), teachers(first_name, last_name, phone)")
        .eq("school_music_school_id", schoolId!);
      if (error) throw error;
      return data ?? [];
    },
  });
}
