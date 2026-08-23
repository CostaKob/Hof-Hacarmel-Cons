import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { useSchoolMusicTeachers } from "@/hooks/useSchoolMusicTeachers";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ChevronLeft, AlertCircle, CalendarDays, Pencil, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, parseISO } from "date-fns";
import PageTitle from "@/components/PageTitle";

const HEBREW_DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const formatDate = (d: string) => format(parseISO(d), "dd/MM/yyyy");

function clampDate(value: string, min: string, max: string) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function useAcademicDateRange() {
  const { activeYear } = useAcademicYear();
  const startYear = activeYear ? new Date(activeYear.start_date).getFullYear() : new Date().getFullYear();
  const minDate = `${startYear}-08-01`;
  const maxDate = `${startYear + 1}-08-31`;
  return { minDate, maxDate };
}

const STATUS_LABEL: Record<string, string> = {
  present: "הגיע/ה",
  absent: "לא הגיע/ה",
  double_lesson: "שיעור כפול",
  justified_absence: "היעדרות מוצדקת",
  unjustified_absence: "היעדרות לא מוצדקת",
  vacation: "חופשה",
};


const SchoolMusicAttendanceList = ({ variant = "teacher" as "teacher" | "admin" }) => {
  const { id: schoolId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeYear } = useAcademicYear();
  const { minDate, maxDate } = useAcademicDateRange();

  const today = format(new Date(), "yyyy-MM-dd");
  const monthAgo = format(addDays(new Date(), -30), "yyyy-MM-dd");

  const [startDate, setStartDate] = useState(clampDate(monthAgo, minDate, maxDate));
  const [endDate, setEndDate] = useState(clampDate(today, minDate, maxDate));
  const [teacherFilter, setTeacherFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: school } = useQuery({
    queryKey: ["school-music-school-basic", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_schools")
        .select("id, school_name, operating_days, day_of_week")
        .eq("id", schoolId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: teachers = [] } = useSchoolMusicTeachers(schoolId);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["teacher-attendance-list", schoolId, startDate, endDate],
    enabled: !!schoolId && !!startDate && !!endDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_attendance")
        .select("id, attendance_date, status, notes, teacher_id")
        .eq("school_music_school_id", schoolId!)
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .order("attendance_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const teacherById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const t of teachers) m[t.id] = t;
    return m;
  }, [teachers]);

  const operatingDays: number[] = useMemo(() => {
    const od = (school as any)?.operating_days;
    if (Array.isArray(od) && od.length > 0) return od;
    const dow = (school as any)?.day_of_week;
    return dow != null ? [dow] : [];
  }, [school]);

  // Compute "missing report" days
  const missingDays = useMemo(() => {
    if (operatingDays.length === 0) return [];
    const reportedDates = new Set(rows.map((r: any) => r.attendance_date));
    const out: string[] = [];
    const rangeStart = clampDate(startDate, minDate, maxDate);
    const rangeEnd = clampDate(endDate, minDate, maxDate);
    const start = parseISO(rangeStart);
    const end = parseISO(rangeEnd);
    const todayD = parseISO(today);
    for (let d = new Date(start); d <= end && d <= todayD; d = addDays(d, 1)) {
      if (operatingDays.includes(d.getDay())) {
        const ds = format(d, "yyyy-MM-dd");
        if (ds < minDate || ds > maxDate) continue;
        if (!reportedDates.has(ds)) out.push(ds);
      }
    }
    return out.sort().reverse();
  }, [operatingDays, rows, startDate, endDate, today, minDate, maxDate]);

  const filtered = rows.filter((r: any) => {
    if (teacherFilter !== "all" && r.teacher_id !== teacherFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of filtered as any[]) {
      const arr = map.get(r.attendance_date) ?? [];
      arr.push(r);
      map.set(r.attendance_date, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, items]) => ({ date, items }));
  }, [filtered]);

  const [deleteDate, setDeleteDate] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!schoolId || !deleteDate) return;
      const { error } = await supabase
        .from("teacher_attendance")
        .delete()
        .eq("school_music_school_id", schoolId)
        .eq("attendance_date", deleteDate);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance-list"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-attendance"] });
      toast.success("הדיווח נמחק");
      setDeleteDate(null);
    },
    onError: (e: any) => toast.error(e.message || "שגיאה במחיקה"),
  });


  const backPath = variant === "admin"
    ? `/admin/school-music-schools/${schoolId}`
    : `/teacher/school-music-schools/${schoolId}`;
  const newPath = variant === "admin"
    ? `/admin/school-music-schools/${schoolId}/attendance/new`
    : `/teacher/school-music-schools/${schoolId}/attendance/new`;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <PageTitle title="רשימת נוכחות ביס מנגן" />
      <header className="bg-primary px-5 pb-5 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button variant="ghost" size="icon" className="text-primary-foreground shrink-0" onClick={() => navigate(backPath)}>
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">דוח נוכחות</h1>
            <p className="text-xs text-primary-foreground/80 truncate">{school?.school_name ?? "—"}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate(newPath)} className="rounded-xl">
            דיווח חדש
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 -mt-3 pb-8 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">מתאריך</Label>
            <DateInput value={startDate} min={minDate} max={maxDate} onChange={(v) => setStartDate(clampDate(v, minDate, maxDate))} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">עד תאריך</Label>
            <DateInput value={endDate} min={minDate} max={maxDate} onChange={(v) => setEndDate(clampDate(v, minDate, maxDate))} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">מורה</Label>
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">סטטוס</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="present">הגיע/ה</SelectItem>
                <SelectItem value="absent">לא הגיע/ה</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {missingDays.length > 0 && teacherFilter === "all" && statusFilter === "all" && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold text-amber-900">
              <AlertCircle className="h-4 w-4" />
              ימי פעילות ללא דיווח ({missingDays.length})
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {missingDays.slice(0, 30).map((d) => (
                <Badge
                  key={d}
                  variant="outline"
                  className="border-amber-400 text-amber-900 cursor-pointer hover:bg-amber-100"
                  onClick={() => navigate(`${newPath}?date=${d}`)}
                >
                  {formatDate(d)}
                </Badge>
              ))}
              {missingDays.length > 30 && <span className="text-xs text-amber-800">+{missingDays.length - 30}</span>}
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : grouped.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין רשומות בטווח שנבחר</p>
        ) : (
          <div className="space-y-4">
            {grouped.map((g) => {
              const nameOf = (r: any) => {
                const t = teacherById[r.teacher_id];
                return t ? `${t.first_name} ${t.last_name}` : "—";
              };
              const presentItems = g.items.filter((r: any) => r.status === "present" || r.status === "double_lesson");
              const absentItems = g.items.filter((r: any) => !(r.status === "present" || r.status === "double_lesson"));
              const d = parseISO(g.date);
              const weekday = HEBREW_DAYS[d.getDay()];
              return (
                <div
                  key={g.date}
                  className="w-full rounded-2xl bg-card shadow-sm border border-border text-right transition-all hover:shadow-md overflow-hidden"
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <CalendarDays className="h-5 w-5 text-primary shrink-0" />
                      <span className="text-lg font-bold text-foreground">{formatDate(g.date)}</span>
                      <span className="text-sm font-medium text-muted-foreground">({weekday})</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge variant="secondary" className="rounded-lg text-xs">{presentItems.length} הגיעו</Badge>
                      {absentItems.length > 0 && (
                        <Badge variant="destructive" className="rounded-lg text-xs">{absentItems.length} לא הגיעו</Badge>
                      )}
                    </div>
                  </div>

                  {/* Teacher rows */}
                  <div className="border-t border-border px-4 py-2 space-y-2">
                    {[...g.items]
                      .sort((a: any, b: any) => {
                        const aPresent = a.status === "present" || a.status === "double_lesson";
                        const bPresent = b.status === "present" || b.status === "double_lesson";
                        return Number(bPresent) - Number(aPresent);
                      })
                      .map((r: any) => {
                        const isPresent = r.status === "present" || r.status === "double_lesson";
                        return (
                          <div key={r.id} className="flex items-start gap-2 text-sm">
                            <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${isPresent ? "bg-emerald-500" : "bg-red-500"}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium truncate">{nameOf(r)}</span>
                                <span className={`text-xs shrink-0 ${isPresent ? "text-muted-foreground" : "text-destructive font-medium"}`}>
                                  {STATUS_LABEL[r.status] ?? r.status}
                                </span>
                              </div>
                              {r.notes && (
                                <div className="text-xs text-muted-foreground whitespace-pre-wrap break-words">
                                  {r.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-border px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{g.items.length} מורים</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <button
                        type="button"
                        className="text-xs text-muted-foreground font-medium flex items-center gap-1"
                        onClick={() => navigate(`${newPath}?date=${g.date}`)}
                      >
                        <Pencil className="h-3 w-3" />
                        עריכה
                      </button>
                      <button
                        type="button"
                        className="text-xs text-destructive font-medium flex items-center gap-1"
                        onClick={() => setDeleteDate(g.date)}
                      >
                        <Trash2 className="h-3 w-3" />
                        מחיקה
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <AlertDialog open={!!deleteDate} onOpenChange={(o) => !o && setDeleteDate(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת דיווח נוכחות</AlertDialogTitle>
            <AlertDialogDescription>
              הדיווח לתאריך {deleteDate ? formatDate(deleteDate) : ""} יימחק לכל המורים. לא ניתן לשחזר.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="h-12 rounded-xl mt-0">ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="h-12 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); deleteMutation.mutate(); }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "מוחק..." : "מחיקה"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SchoolMusicAttendanceList;
