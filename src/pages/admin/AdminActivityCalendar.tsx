import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { usePersistedState } from "@/hooks/useListStatePreservation";
import { cmpHe } from "@/lib/sortHebrew";
import { ChevronRight, ChevronLeft, CalendarDays, Users } from "lucide-react";

const ROUTE_KEY = "admin-activity-calendar";

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const MONTH_NAMES = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const STATUS_LABELS: Record<string, string> = {
  present: "התקיים",
  double_lesson: "שיעור כפול",
  justified_absence: "היעדרות מוצדקת",
  unjustified_absence: "היעדרות לא מוצדקת",
  vacation: "חופשה",
};

const STATUS_STYLES: Record<string, string> = {
  present: "bg-accent text-accent-foreground border-primary/30",
  double_lesson: "bg-secondary text-secondary-foreground border-primary/20",
  justified_absence: "bg-muted text-muted-foreground border-border",
  unjustified_absence: "bg-destructive/10 text-destructive border-destructive/30",
  vacation: "bg-primary/10 text-primary border-primary/30",
};

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** ראשון של השבוע המכיל את התאריך */
const startOfWeek = (d: Date) => {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
};

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

interface LessonEntry {
  lineId: string;
  studentName: string;
  instrument: string;
  status: string;
  notes: string | null;
}

interface TeacherBlock {
  teacherId: string;
  teacherName: string;
  schoolName: string;
  reportId: string;
  lessons: LessonEntry[];
}

const AdminActivityCalendar = () => {
  const navigate = useNavigate();
  const { selectedYearId } = useAcademicYear();

  const [weekStartStr, setWeekStartStr] = usePersistedState<string>(
    ROUTE_KEY,
    "weekStart",
    fmt(startOfWeek(new Date())),
  );
  const [teacherFilter, setTeacherFilter] = usePersistedState<string[]>(ROUTE_KEY, "teachers", []);
  const [schoolFilter, setSchoolFilter] = usePersistedState<string[]>(ROUTE_KEY, "schools", []);
  const [statusFilter, setStatusFilter] = usePersistedState<string[]>(ROUTE_KEY, "statuses", []);
  const [instrumentFilter, setInstrumentFilter] = usePersistedState<string[]>(ROUTE_KEY, "instruments", []);

  const weekStart = useMemo(() => {
    const [y, m, d] = weekStartStr.split("-").map(Number);
    return startOfWeek(new Date(y, (m ?? 1) - 1, d ?? 1));
  }, [weekStartStr]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const from = fmt(days[0]);
  const to = fmt(days[6]);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["activity-calendar", selectedYearId, from, to],
    enabled: !!selectedYearId,
    queryFn: async () => {
      if (!selectedYearId) return [];
      const { data, error } = await supabase
        .from("reports")
        .select(
          `id, report_date, teacher_id, academic_year_id,
           teachers(first_name, last_name),
           schools(name),
           report_lines(
             id, status, notes,
             enrollments(students(first_name, last_name), instruments(name))
           )`,
        )
        .gte("report_date", from)
        .lte("report_date", to)
        .eq("academic_year_id", selectedYearId);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: allTeachers = [] } = useQuery({
    queryKey: ["activity-calendar-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("first_name, last_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allSchools = [] } = useQuery({
    queryKey: ["activity-calendar-schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allInstruments = [] } = useQuery({
    queryKey: ["activity-calendar-instruments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ─── אפשרויות סינון מתוך נתוני השבוע ───
  const { teacherOptions, schoolOptions, instrumentOptions } = useMemo(() => {
    const t = new Set<string>();
    const s = new Set<string>();
    const i = new Set<string>();
    for (const r of reports) {
      const name = `${r.teachers?.first_name ?? ""} ${r.teachers?.last_name ?? ""}`.trim();
      if (name) t.add(name);
      if (r.schools?.name) s.add(r.schools.name);
      for (const line of r.report_lines ?? []) {
        const inst = line.enrollments?.instruments?.name;
        if (inst) i.add(inst);
      }
    }
    return {
      teacherOptions: Array.from(
        new Set(allTeachers.map((teacher: any) => `${teacher.first_name ?? ""} ${teacher.last_name ?? ""}`.trim()).filter(Boolean)),
      ).sort(cmpHe),
      schoolOptions: Array.from(
        new Set(allSchools.map((school: any) => school.name).filter(Boolean)),
      ).sort(cmpHe),
      instrumentOptions: Array.from(
        new Set(allInstruments.map((instrument: any) => instrument.name).filter(Boolean)),
      ).sort(cmpHe),
    };
  }, [reports, allTeachers, allSchools, allInstruments]);

  // ─── קיבוץ לפי יום ← מורה ───
  const byDay = useMemo(() => {
    const map = new Map<string, TeacherBlock[]>();
    for (const r of reports) {
      const teacherName = `${r.teachers?.first_name ?? ""} ${r.teachers?.last_name ?? ""}`.trim() || "—";
      const schoolName = r.schools?.name ?? "";
      if (teacherFilter.length && !teacherFilter.includes(teacherName)) continue;
      if (schoolFilter.length && !schoolFilter.includes(schoolName)) continue;

      const lessons: LessonEntry[] = [];
      for (const line of r.report_lines ?? []) {
        const inst = line.enrollments?.instruments?.name ?? "";
        if (statusFilter.length && !statusFilter.includes(line.status)) continue;
        if (instrumentFilter.length && !instrumentFilter.includes(inst)) continue;
        const st = line.enrollments?.students;
        lessons.push({
          lineId: line.id,
          studentName: `${st?.first_name ?? ""} ${st?.last_name ?? ""}`.trim() || "—",
          instrument: inst,
          status: line.status,
          notes: line.notes,
        });
      }
      if (lessons.length === 0) continue;
      lessons.sort((a, b) => cmpHe(a.studentName, b.studentName));

      const list = map.get(r.report_date) ?? [];
      list.push({
        teacherId: r.teacher_id,
        teacherName,
        schoolName,
        reportId: r.id,
        lessons,
      });
      map.set(r.report_date, list);
    }
    for (const list of map.values()) list.sort((a, b) => cmpHe(a.teacherName, b.teacherName));
    return map;
  }, [reports, teacherFilter, schoolFilter, statusFilter, instrumentFilter]);

  const weekTotals = useMemo(() => {
    let lessons = 0;
    const teachers = new Set<string>();
    for (const blocks of byDay.values()) {
      for (const b of blocks) {
        lessons += b.lessons.length;
        teachers.add(b.teacherId);
      }
    }
    return { lessons, teachers: teachers.size };
  }, [byDay]);

  const todayStr = fmt(new Date());
  const rangeLabel = `${days[0].getDate()} ${MONTH_NAMES[days[0].getMonth()]} – ${days[6].getDate()} ${MONTH_NAMES[days[6].getMonth()]} ${days[6].getFullYear()}`;

  const hasFilters =
    teacherFilter.length || schoolFilter.length || statusFilter.length || instrumentFilter.length;

  return (
    <AdminLayout title="לוח פעילות מורים" fullWidth>
      <PageTitle title="לוח פעילות מורים" />
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarDays className="h-6 w-6 text-primary" />
              לוח פעילות מורים
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              מי לימד, מתי ואת מי — לפי דיווחי המורים
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl"
              aria-label="שבוע הבא"
              onClick={() => setWeekStartStr(fmt(addDays(weekStart, 7)))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => setWeekStartStr(fmt(startOfWeek(new Date())))}
            >
              השבוע
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl"
              aria-label="שבוע קודם"
              onClick={() => setWeekStartStr(fmt(addDays(weekStart, -7)))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{rangeLabel}</span>
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {weekTotals.teachers} מורים · {weekTotals.lessons} שיעורים
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">מורה</Label>
              <MultiSelectFilter
                options={teacherOptions}
                value={teacherFilter}
                onChange={setTeacherFilter}
                allLabel="כל המורים"
                className="w-full"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">שלוחה / בית ספר</Label>
              <MultiSelectFilter
                options={schoolOptions}
                value={schoolFilter}
                onChange={setSchoolFilter}
                allLabel="כל השלוחות"
                className="w-full"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">סטטוס נוכחות</Label>
              <MultiSelectFilter
                options={Object.keys(STATUS_LABELS)}
                value={statusFilter}
                onChange={setStatusFilter}
                allLabel="כל הסטטוסים"
                renderLabel={(o) => STATUS_LABELS[o] ?? o}
                className="w-full"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">כלי נגינה</Label>
              <MultiSelectFilter
                options={instrumentOptions}
                value={instrumentFilter}
                onChange={setInstrumentFilter}
                allLabel="כל הכלים"
                className="w-full"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-1">
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`h-2.5 w-2.5 rounded-full border ${STATUS_STYLES[key]}`} />
                {label}
              </span>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="py-12 text-center text-muted-foreground">טוען…</div>
        ) : (
          <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-7">
            {days.map((day) => {
              const key = fmt(day);
              const blocks = byDay.get(key) ?? [];
              const isToday = key === todayStr;
              return (
                <div
                  key={key}
                  className={`rounded-2xl border bg-card overflow-hidden ${isToday ? "border-primary ring-1 ring-primary/30" : ""}`}
                >
                  <div className={`px-3 py-2 border-b text-sm font-semibold flex items-center justify-between ${isToday ? "bg-primary/10 text-primary" : "bg-muted/40"}`}>
                    <span>{HEBREW_DAYS[day.getDay()]}</span>
                    <span className="text-xs font-normal opacity-70">
                      {day.getDate()}/{day.getMonth() + 1}
                    </span>
                  </div>
                  <div className="p-2 space-y-2">
                    {blocks.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-4">אין דיווחים</p>
                    ) : (
                      blocks.map((b) => (
                        <div key={b.reportId} className="rounded-xl border bg-background p-2">
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/teachers/${b.teacherId}/reports`)}
                            className="w-full text-right"
                          >
                            <span className="text-sm font-semibold text-primary hover:underline block truncate">
                              {b.teacherName}
                            </span>
                            {b.schoolName && (
                              <span className="text-[11px] text-muted-foreground block truncate">
                                {b.schoolName} · {b.lessons.length} שיעורים
                              </span>
                            )}
                          </button>
                          <ul className="mt-1.5 space-y-1">
                            {b.lessons.map((l) => (
                              <li
                                key={l.lineId}
                                title={`${l.studentName}${l.instrument ? ` · ${l.instrument}` : ""} · ${STATUS_LABELS[l.status] ?? l.status}${l.notes ? ` · ${l.notes}` : ""}`}
                                className={`rounded-lg border px-2 py-1 text-[11px] leading-tight ${STATUS_STYLES[l.status] ?? "bg-muted"}`}
                              >
                                <span className="block truncate font-medium">{l.studentName}</span>
                                {l.instrument && (
                                  <span className="block truncate opacity-70">{l.instrument}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasFilters ? (
          <div className="text-center">
            <Button
              variant="ghost"
              className="rounded-xl"
              onClick={() => {
                setTeacherFilter([]);
                setSchoolFilter([]);
                setStatusFilter([]);
                setInstrumentFilter([]);
              }}
            >
              נקה סינונים
            </Button>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
};

export default AdminActivityCalendar;
