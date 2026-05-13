import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns all teachers associated with a school music school:
 * coordinator + conductor + every group teacher (deduped).
 */
export function useSchoolMusicTeachers(schoolId: string | undefined) {
  return useQuery({
    queryKey: ["school-music-teachers", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data: school, error: sErr } = await supabase
        .from("school_music_schools")
        .select("coordinator_teacher_id, conductor_teacher_id")
        .eq("id", schoolId!)
        .maybeSingle();
      if (sErr) throw sErr;

      const { data: classes } = await supabase
        .from("school_music_classes")
        .select("id")
        .eq("school_music_school_id", schoolId!);
      const classIds = (classes ?? []).map((c) => c.id);

      let groupTeacherIds: string[] = [];
      if (classIds.length > 0) {
        const { data: groups } = await supabase
          .from("school_music_class_groups")
          .select("teacher_id")
          .in("school_music_class_id", classIds);
        groupTeacherIds = (groups ?? []).map((g: any) => g.teacher_id).filter(Boolean);
      }

      const ids = new Set<string>();
      if (school?.coordinator_teacher_id) ids.add(school.coordinator_teacher_id);
      if (school?.conductor_teacher_id) ids.add(school.conductor_teacher_id);
      groupTeacherIds.forEach((id) => ids.add(id));

      const idArr = Array.from(ids);
      if (idArr.length === 0) return [];
      const { data: teachers, error: tErr } = await supabase
        .from("teachers")
        .select("id, first_name, last_name")
        .in("id", idArr);
      if (tErr) throw tErr;
      return (teachers ?? []).sort((a, b) =>
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "he"),
      );
    },
  });
}
