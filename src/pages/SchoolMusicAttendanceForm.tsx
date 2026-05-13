import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSchoolMusicTeachers } from "@/hooks/useSchoolMusicTeachers";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Check, X, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

type Status = "present" | "absent";
interface Row { status: Status; notes: string }

interface Props {
  /** "teacher" → returns to /teacher/school-music-schools/:id, "admin" → /admin/school-music-schools/:id */
  variant?: "teacher" | "admin";
}

const SchoolMusicAttendanceForm = ({ variant = "teacher" }: Props) => {
  const { id: schoolId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeYear } = useAcademicYear();
  const today = format(new Date(), "yyyy-MM-dd");

  const [date, setDate] = useState(today);
  const [rows, setRows] = useState<Record<string, Row>>({});

  const { data: school } = useQuery({
    queryKey: ["school-music-school-basic", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_schools")
        .select("id, school_name, academic_year_id")
        .eq("id", schoolId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: teachers = [], isLoading: loadingTeachers } = useSchoolMusicTeachers(schoolId);

  const { data: existing = [] } = useQuery({
    queryKey: ["teacher-attendance", schoolId, date],
    enabled: !!schoolId && !!date,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_attendance")
        .select("teacher_id, status, notes")
        .eq("school_music_school_id", schoolId!)
        .eq("attendance_date", date);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Initialize rows from existing data + defaults
  useEffect(() => {
    const next: Record<string, Row> = {};
    for (const t of teachers) {
      const found = (existing as any[]).find((e) => e.teacher_id === t.id);
      next[t.id] = {
        status: (found?.status as Status) ?? "present",
        notes: found?.notes ?? "",
      };
    }
    setRows(next);
  }, [teachers, existing]);

  const allPresent = useMemo(
    () => teachers.length > 0 && teachers.every((t) => rows[t.id]?.status === "present"),
    [teachers, rows],
  );

  const markAllPresent = () => {
    const next: Record<string, Row> = {};
    for (const t of teachers) next[t.id] = { status: "present", notes: "" };
    setRows(next);
  };

  const setStatus = (teacherId: string, status: Status) => {
    setRows((prev) => ({ ...prev, [teacherId]: { ...prev[teacherId], status, notes: status === "present" ? "" : prev[teacherId]?.notes ?? "" } }));
  };
  const setNotes = (teacherId: string, notes: string) => {
    setRows((prev) => ({ ...prev, [teacherId]: { ...prev[teacherId], notes } }));
  };

  const academicYearId = school?.academic_year_id ?? activeYear?.id ?? null;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!schoolId || !date) throw new Error("חסרים נתונים");
      if (!academicYearId) throw new Error("לא ניתן לשמור — אין שנת לימודים");
      const payload = teachers.map((t) => ({
        school_music_school_id: schoolId,
        teacher_id: t.id,
        attendance_date: date,
        status: rows[t.id]?.status ?? "present",
        notes: rows[t.id]?.notes || null,
        academic_year_id: academicYearId,
      }));
      if (payload.length === 0) throw new Error("אין מורים לדיווח");
      const { error } = await supabase
        .from("teacher_attendance")
        .upsert(payload as any, { onConflict: "school_music_school_id,teacher_id,attendance_date" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance", schoolId, date] });
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance-list"] });
      toast.success("הנוכחות נשמרה");
    },
    onError: (e: any) => toast.error(e.message || "שגיאה בשמירה"),
  });

  const backPath = variant === "admin"
    ? `/admin/school-music-schools/${schoolId}`
    : `/teacher/school-music-schools/${schoolId}`;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-5 pb-5 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button variant="ghost" size="icon" className="text-primary-foreground shrink-0" onClick={() => navigate(backPath)}>
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">דיווח נוכחות</h1>
            <p className="text-xs text-primary-foreground/80 truncate">{school?.school_name ?? "—"}</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 -mt-3 pb-32 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">תאריך הדיווח</Label>
            <Input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className="h-12 rounded-xl" />
          </div>
          <Button type="button" variant="outline" onClick={markAllPresent} disabled={loadingTeachers || teachers.length === 0} className="w-full h-11 rounded-xl">
            <CheckCheck className="h-4 w-4 ml-1" />
            כולם הגיעו
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-base">צוות בית הספר ({teachers.length})</h2>
            {allPresent && <Badge variant="secondary">כולם נוכחים</Badge>}
          </div>

          {loadingTeachers ? (
            <p className="text-sm text-muted-foreground">טוען...</p>
          ) : teachers.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין מורים משויכים לבית הספר.</p>
          ) : (
            <div className="space-y-3">
              {teachers.map((t) => {
                const r = rows[t.id] ?? { status: "present" as Status, notes: "" };
                const absent = r.status === "absent";
                return (
                  <div key={t.id} className="rounded-xl border border-border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-sm">{t.first_name} {t.last_name}</p>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setStatus(t.id, "present")}
                          className={`flex items-center gap-1 h-9 px-3 rounded-lg text-xs font-medium border transition-colors ${!absent ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input"}`}
                        >
                          <Check className="h-3.5 w-3.5" /> הגיע/ה
                        </button>
                        <button
                          type="button"
                          onClick={() => setStatus(t.id, "absent")}
                          className={`flex items-center gap-1 h-9 px-3 rounded-lg text-xs font-medium border transition-colors ${absent ? "bg-destructive text-destructive-foreground border-destructive" : "bg-background text-muted-foreground border-input"}`}
                        >
                          <X className="h-3.5 w-3.5" /> לא הגיע/ה
                        </button>
                      </div>
                    </div>
                    {absent && (
                      <Textarea
                        value={r.notes}
                        onChange={(e) => setNotes(t.id, e.target.value)}
                        placeholder="סיבת ההיעדרות (אופציונלי)"
                        rows={2}
                        className="rounded-xl text-sm"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="fixed bottom-0 inset-x-0 bg-background/95 backdrop-blur border-t border-border p-4">
          <div className="mx-auto max-w-2xl flex gap-2">
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || teachers.length === 0} className="flex-1 h-12 rounded-xl">
              {saveMutation.isPending ? "שומר..." : "שמירת דיווח"}
            </Button>
            <Button variant="outline" onClick={() => navigate(backPath)} className="h-12 rounded-xl">
              ביטול
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SchoolMusicAttendanceForm;
