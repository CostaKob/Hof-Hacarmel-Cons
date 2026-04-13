import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Music, Loader2, CheckCircle2, School } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Props {
  activeYear: { id: string; name: string } | null;
  nextYear: { id: string; name: string } | null;
}

const StructureCloningSection = ({ activeYear, nextYear }: Props) => {
  const queryClient = useQueryClient();

  // Check existing data in next year
  const { data: nextYearCounts } = useQuery({
    queryKey: ["next-year-structure-counts", nextYear?.id],
    queryFn: async () => {
      const [{ count: schoolCount }, { count: ensembleCount }] = await Promise.all([
        supabase.from("school_music_schools").select("*", { count: "exact", head: true }).eq("academic_year_id", nextYear!.id),
        supabase.from("ensembles").select("*", { count: "exact", head: true }).eq("academic_year_id", nextYear!.id),
      ]);
      return { schools: schoolCount ?? 0, ensembles: ensembleCount ?? 0 };
    },
    enabled: !!nextYear?.id,
  });

  // Check source data counts
  const { data: sourceCounts } = useQuery({
    queryKey: ["source-year-structure-counts", activeYear?.id],
    queryFn: async () => {
      const [{ count: schoolCount }, { count: ensembleCount }] = await Promise.all([
        supabase.from("school_music_schools").select("*", { count: "exact", head: true }).eq("academic_year_id", activeYear!.id),
        supabase.from("ensembles").select("*", { count: "exact", head: true }).eq("academic_year_id", activeYear!.id),
      ]);
      return { schools: schoolCount ?? 0, ensembles: ensembleCount ?? 0 };
    },
    enabled: !!activeYear?.id,
  });

  // Clone School Music mutation
  const cloneSchoolMusicMutation = useMutation({
    mutationFn: async () => {
      if (!activeYear || !nextYear) throw new Error("חסרה שנת מקור או יעד");

      // 1. Fetch source schools
      const { data: sourceSchools, error: schoolsErr } = await supabase
        .from("school_music_schools")
        .select("*")
        .eq("academic_year_id", activeYear.id);
      if (schoolsErr) throw schoolsErr;
      if (!sourceSchools?.length) throw new Error("אין בתי ספר מנגנים בשנה הנוכחית");

      // 2. Create new schools for target year
      const schoolIdMap = new Map<string, string>(); // old → new
      for (const school of sourceSchools) {
        const { data: newSchool, error } = await supabase
          .from("school_music_schools")
          .insert({
            academic_year_id: nextYear.id,
            school_name: school.school_name,
            is_active: true,
            coordinator_teacher_id: school.coordinator_teacher_id,
            coordinator_hours: school.coordinator_hours,
            conductor_teacher_id: school.conductor_teacher_id,
            conductor_hours: school.conductor_hours,
            principal_name: school.principal_name,
            principal_phone: school.principal_phone,
            vice_principal_name: school.vice_principal_name,
            vice_principal_phone: school.vice_principal_phone,
            notes: school.notes,
            classes_count: school.classes_count,
            day_of_week: null, // reset schedule
            class_schedules: [],
            homeroom_teachers: [],
          })
          .select("id")
          .single();
        if (error) throw error;
        schoolIdMap.set(school.id, newSchool.id);
      }

      // 3. Fetch source classes
      const oldSchoolIds = Array.from(schoolIdMap.keys());
      const { data: sourceClasses, error: classErr } = await supabase
        .from("school_music_classes")
        .select("*")
        .in("school_music_school_id", oldSchoolIds);
      if (classErr) throw classErr;

      // 4. Create new classes
      const classIdMap = new Map<string, string>(); // old → new
      for (const cls of sourceClasses || []) {
        const newSchoolId = schoolIdMap.get(cls.school_music_school_id);
        if (!newSchoolId) continue;

        const { data: newClass, error } = await supabase
          .from("school_music_classes")
          .insert({
            school_music_school_id: newSchoolId,
            class_name: cls.class_name,
            day_of_week: null, // reset schedule
            start_time: null,
            end_time: null,
            homeroom_teacher_name: null,
            homeroom_teacher_phone: null,
            notes: cls.notes,
          })
          .select("id")
          .single();
        if (error) throw error;
        classIdMap.set(cls.id, newClass.id);
      }

      // 5. Fetch source class groups and recreate
      const oldClassIds = Array.from(classIdMap.keys());
      if (oldClassIds.length > 0) {
        const { data: sourceGroups, error: groupErr } = await supabase
          .from("school_music_class_groups")
          .select("*")
          .in("school_music_class_id", oldClassIds);
        if (groupErr) throw groupErr;

        const newGroups = (sourceGroups || []).map((g) => ({
          school_music_class_id: classIdMap.get(g.school_music_class_id)!,
          teacher_id: g.teacher_id,
          instrument_id: g.instrument_id,
        })).filter((g) => g.school_music_class_id);

        if (newGroups.length > 0) {
          const { error: insertErr } = await supabase.from("school_music_class_groups").insert(newGroups);
          if (insertErr) throw insertErr;
        }
      }

      // 6. Clone school_music_groups (school-level groups)
      const { data: sourceSmGroups, error: smgErr } = await supabase
        .from("school_music_groups")
        .select("*")
        .in("school_music_school_id", oldSchoolIds);
      if (smgErr) throw smgErr;

      const newSmGroups = (sourceSmGroups || []).map((g) => ({
        school_music_school_id: schoolIdMap.get(g.school_music_school_id)!,
        teacher_id: g.teacher_id,
        instrument_id: g.instrument_id,
        weekly_hours: g.weekly_hours,
      })).filter((g) => g.school_music_school_id);

      if (newSmGroups.length > 0) {
        const { error: insertErr } = await supabase.from("school_music_groups").insert(newSmGroups);
        if (insertErr) throw insertErr;
      }

      return { schools: sourceSchools.length, classes: sourceClasses?.length ?? 0 };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["next-year-structure-counts"] });
      toast.success(`שוכפלו ${result.schools} בתי ספר ו-${result.classes} כיתות בהצלחה!`);
    },
    onError: (err: any) => toast.error(err.message || "שגיאה בשכפול מבנה בית ספר מנגן"),
  });

  // Clone Ensembles mutation
  const cloneEnsemblesMutation = useMutation({
    mutationFn: async () => {
      if (!activeYear || !nextYear) throw new Error("חסרה שנת מקור או יעד");

      // 1. Fetch source ensembles
      const { data: sourceEnsembles, error: ensErr } = await supabase
        .from("ensembles")
        .select("*")
        .eq("academic_year_id", activeYear.id);
      if (ensErr) throw ensErr;
      if (!sourceEnsembles?.length) throw new Error("אין הרכבים בשנה הנוכחית");

      // 2. Create new ensembles
      const ensembleIdMap = new Map<string, string>(); // old → new
      for (const ens of sourceEnsembles) {
        const { data: newEns, error } = await supabase
          .from("ensembles")
          .insert({
            academic_year_id: nextYear.id,
            name: ens.name,
            ensemble_type: ens.ensemble_type,
            school_id: ens.school_id,
            is_active: true,
            weekly_hours: ens.weekly_hours,
            day_of_week: ens.day_of_week,
            start_time: ens.start_time,
            room: ens.room,
            notes: ens.notes,
          })
          .select("id")
          .single();
        if (error) throw error;
        ensembleIdMap.set(ens.id, newEns.id);
      }

      // 3. Fetch source staff and recreate
      const oldEnsembleIds = Array.from(ensembleIdMap.keys());
      const { data: sourceStaff, error: staffErr } = await supabase
        .from("ensemble_staff")
        .select("*")
        .in("ensemble_id", oldEnsembleIds);
      if (staffErr) throw staffErr;

      const newStaff = (sourceStaff || []).map((s) => ({
        ensemble_id: ensembleIdMap.get(s.ensemble_id)!,
        teacher_id: s.teacher_id,
        role: s.role,
        weekly_hours: s.weekly_hours,
      })).filter((s) => s.ensemble_id);

      if (newStaff.length > 0) {
        const { error: insertErr } = await supabase.from("ensemble_staff").insert(newStaff);
        if (insertErr) throw insertErr;
      }

      return { ensembles: sourceEnsembles.length, staff: newStaff.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["next-year-structure-counts"] });
      toast.success(`שוכפלו ${result.ensembles} הרכבים ו-${result.staff} אנשי צוות בהצלחה!`);
    },
    onError: (err: any) => toast.error(err.message || "שגיאה בשכפול הרכבים"),
  });

  if (!activeYear || !nextYear) return null;

  const isCloning = cloneSchoolMusicMutation.isPending || cloneEnsemblesMutation.isPending;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div>
        <h2 className="font-semibold text-foreground text-base">העברת מבנה ארגוני</h2>
        <p className="text-sm text-muted-foreground mt-1">
          שכפול מבנה בתי ספר מנגנים והרכבים מ-{activeYear.name} ל-{nextYear.name} — ללא תלמידים
        </p>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2">
        {nextYearCounts && nextYearCounts.schools > 0 && (
          <Badge variant="outline" className="gap-1.5 text-green-700 border-green-300 dark:text-green-400 dark:border-green-700">
            <CheckCircle2 className="h-3 w-3" />
            {nextYearCounts.schools} בתי ספר מנגנים ב-{nextYear.name}
          </Badge>
        )}
        {nextYearCounts && nextYearCounts.ensembles > 0 && (
          <Badge variant="outline" className="gap-1.5 text-green-700 border-green-300 dark:text-green-400 dark:border-green-700">
            <CheckCircle2 className="h-3 w-3" />
            {nextYearCounts.ensembles} הרכבים ב-{nextYear.name}
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* School Music Clone */}
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <School className="h-5 w-5 text-primary" />
            <h3 className="font-medium text-foreground">בית ספר מנגן</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {sourceCounts?.schools ?? 0} בתי ספר ב-{activeYear.name}
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full rounded-xl gap-2"
                disabled={isCloning || !sourceCounts?.schools}
              >
                {cloneSchoolMusicMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                שכפל מבנה
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>שכפול מבנה בית ספר מנגן</AlertDialogTitle>
                <AlertDialogDescription>
                  פעולה זו תיצור מבנה חדש ל-{nextYear.name} על בסיס {activeYear.name}:
                  <br />• {sourceCounts?.schools ?? 0} בתי ספר עם כיתות וקבוצות
                  <br />• לוחות זמנים ומחנכות יאופסו
                  <br />• תלמידים לא יועתקו
                  {nextYearCounts && nextYearCounts.schools > 0 && (
                    <>
                      <br /><br />
                      <strong className="text-destructive">שים לב: כבר קיימים {nextYearCounts.schools} בתי ספר ב-{nextYear.name}. השכפול יוסיף עליהם.</strong>
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={() => cloneSchoolMusicMutation.mutate()}>
                  שכפל
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Ensembles Clone */}
        <div className="rounded-xl border border-border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-primary" />
            <h3 className="font-medium text-foreground">הרכבים</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            {sourceCounts?.ensembles ?? 0} הרכבים ב-{activeYear.name}
          </p>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full rounded-xl gap-2"
                disabled={isCloning || !sourceCounts?.ensembles}
              >
                {cloneEnsemblesMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
                שכפל מבנה
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>שכפול מבנה הרכבים</AlertDialogTitle>
                <AlertDialogDescription>
                  פעולה זו תיצור מבנה חדש ל-{nextYear.name} על בסיס {activeYear.name}:
                  <br />• {sourceCounts?.ensembles ?? 0} הרכבים עם צוות מורים
                  <br />• תלמידים לא יועתקו
                  {nextYearCounts && nextYearCounts.ensembles > 0 && (
                    <>
                      <br /><br />
                      <strong className="text-destructive">שים לב: כבר קיימים {nextYearCounts.ensembles} הרכבים ב-{nextYear.name}. השכפול יוסיף עליהם.</strong>
                    </>
                  )}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
                <AlertDialogAction onClick={() => cloneEnsemblesMutation.mutate()}>
                  שכפל
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};

export default StructureCloningSection;
