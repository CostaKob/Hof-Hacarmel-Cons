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

const HEBREW_DAYS_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
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

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

interface LessonEntry {
  lineId: string;
  studentName: string;
  instrument: string;
  status: string;
  notes: string | null;
  schoolName: string;
}

interface TeacherRow {
  teacherId: string;
  teacherName: string;
  /** dateStr -> lessons */
  byDate: Map<string, LessonEntry[]>;
  total: number;
}

const AdminActivityCalendar = () => {
  const navigate = useNavigate();
  const { selectedYearId } = useAcademicYear();

  const [monthStr, setMonthStr] = usePersistedState<string>(
    ROUTE_KEY,
    "month",
    fmt(startOfMonth(new Date())),
  );
  const [teacherFilter, setTeacherFilter] = usePersistedState<string[]>(ROUTE_KEY, "teachers", []);
  const [schoolFilter, setSchoolFilter] = usePersistedState<string[]>(ROUTE_KEY, "schools", []);
  const [statusFilter, setStatusFilter] = usePersistedState<string[]>(ROUTE_KEY, "statuses", []);
  const [instrumentFilter, setInstrumentFilter] = usePersistedState<string[]>(ROUTE_KEY, "instruments", []);

  const monthDate = useMemo(() => {
    const [y, m] = monthStr.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, 1);
  }, [monthStr]);

  const days = useMemo(
    () =>
      Array.from({ length: daysInMonth(monthDate) }, (_, i) =>
        new Date(monthDate.getFullYear(), monthDate.getMonth(), i + 1),
      ),
    [monthDate],
  );
  const from = fmt(days[0]);
  const to = fmt(days[days.length - 1]);

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

  const teacherOptions = useMemo(
    () =>
      Array.from(
        new Set(
          allTeachers
            .map((t: any) => `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim())
            .filter(Boolean),
        ),
      ).sort(cmpHe),
    [allTeachers],
  );
  const schoolOptions = useMemo(
    () => Array.from(new Set(allSchools.map((s: any) => s.name).filter(Boolean))).sort(cmpHe),
    [allSchools],
  );
  const instrumentOptions = useMemo(
    () => Array.from(new Set(allInstruments.map((i: any) => i.name).filter(Boolean))).sort(cmpHe),
    [allInstruments],
  );

  // ─── קיבוץ: מורה (שורה) × יום (עמודה) ───
  const rows = useMemo(() => {
    const map = new Map<string, TeacherRow>();
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
          schoolName,
        });
      }
      if (lessons.length === 0) continue;
      lessons.sort((a, b) => cmpHe(a.studentName, b.studentName));

      const key = r.teacher_id ?? teacherName;
      const row =
        map.get(key) ??
        ({ teacherId: r.teacher_id, teacherName, byDate: new Map(), total: 0 } as TeacherRow);
      const existing = row.byDate.get(r.report_date) ?? [];
      row.byDate.set(r.report_date, [...existing, ...lessons]);
      row.total += lessons.length;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => cmpHe(a.teacherName, b.teacherName));
  }, [reports, teacherFilter, schoolFilter, statusFilter, instrumentFilter]);

  const totals = useMemo(
    () => ({ teachers: rows.length, lessons: rows.reduce((s, r) => s + r.total, 0) }),
    [rows],
  );

  const todayStr = fmt(new Date());
  const monthLabel = `${MONTH_NAMES[monthDate.getMonth()]} ${monthDate.getFullYear()}`;

  const hasFilters =
    teacherFilter.length || schoolFilter.length || statusFilter.length || instrumentFilter.length;

  const DAY_W = 116;
  const NAME_W = 168;

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
              aria-label="חודש הבא"
              onClick={() => setMonthStr(fmt(addMonths(monthDate, 1)))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => setMonthStr(fmt(startOfMonth(new Date())))}
            >
              החודש
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl"
              aria-label="חודש קודם"
              onClick={() => setMonthStr(fmt(addMonths(monthDate, -1)))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{monthLabel}</span>
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Users className="h-4 w-4" />
              {totals.teachers} מורים · {totals.lessons} שיעורים
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
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border bg-card py-16 text-center text-muted-foreground">
            אין דיווחים בחודש זה
          </div>
        ) : (
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="overflow-x-auto overscroll-contain">
              <div style={{ minWidth: NAME_W + days.length * DAY_W }}>
                {/* כותרת ימים */}
                <div className="flex sticky top-0 z-20 bg-muted/60 backdrop-blur border-b">
                  <div
                    className="sticky end-auto start-0 z-30 bg-muted/80 border-e px-3 py-2 text-xs font-semibold flex items-center"
                    style={{ width: NAME_W, minWidth: NAME_W, insetInlineStart: 0, position: "sticky" }}
                  >
                    מורה
                  </div>
                  {days.map((d) => {
                    const key = fmt(d);
                    const isToday = key === todayStr;
                    const isWeekend = d.getDay() === 6;
                    return (
                      <div
                        key={key}
                        className={`px-1 py-2 text-center border-e text-[11px] leading-tight ${
                          isToday ? "bg-primary/15 text-primary font-bold" : isWeekend ? "bg-muted/80" : ""
                        }`}
                        style={{ width: DAY_W, minWidth: DAY_W }}
                      >
                        <div className="font-semibold">{d.getDate()}</div>
                        <div className="opacity-70">{HEBREW_DAYS_SHORT[d.getDay()]}</div>
                      </div>
                    );
                  })}
                </div>

                {/* שורות מורים */}
                {rows.map((row, idx) => (
                  <div
                    key={row.teacherId ?? row.teacherName}
                    className={`flex border-b last:border-b-0 ${idx % 2 ? "bg-muted/20" : ""}`}
                  >
                    <div
                      className="sticky z-10 bg-card border-e px-3 py-2 flex flex-col justify-center"
                      style={{ width: NAME_W, minWidth: NAME_W, insetInlineStart: 0, position: "sticky" }}
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/admin/teachers/${row.teacherId}/reports`)}
                        className="text-right text-sm font-semibold text-primary hover:underline truncate"
                      >
                        {row.teacherName}
                      </button>
                      <span className="text-[11px] text-muted-foreground">
                        {row.total} שיעורים
                      </span>
                    </div>
                    {days.map((d) => {
                      const key = fmt(d);
                      const lessons = row.byDate.get(key) ?? [];
                      const isToday = key === todayStr;
                      const isWeekend = d.getDay() === 6;
                      return (
                        <div
                          key={key}
                          className={`border-e p-1 align-top ${
                            isToday ? "bg-primary/5" : isWeekend ? "bg-muted/30" : ""
                          }`}
                          style={{ width: DAY_W, minWidth: DAY_W }}
                        >
                          <div className="flex flex-col gap-1">
                            {lessons.map((l) => (
                              <div
                                key={l.lineId}
                                title={`${l.studentName}${l.instrument ? ` · ${l.instrument}` : ""}${
                                  l.schoolName ? ` · ${l.schoolName}` : ""
                                } · ${STATUS_LABELS[l.status] ?? l.status}${l.notes ? ` · ${l.notes}` : ""}`}
                                className={`rounded-md border px-1.5 py-0.5 text-[10px] leading-tight text-center ${
                                  STATUS_STYLES[l.status] ?? "bg-muted"
                                }`}
                              >
                                <span className="block truncate font-medium">{l.studentName}</span>
                                {l.instrument && (
                                  <span className="block truncate opacity-70">{l.instrument}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
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
