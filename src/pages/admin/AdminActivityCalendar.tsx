import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { usePersistedState } from "@/hooks/useListStatePreservation";
import { cmpHe } from "@/lib/sortHebrew";

import {
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  Users,
  GraduationCap,
  Music2,
  TrendingUp,
  Download,
  MapPin,
} from "lucide-react";

const ROUTE_KEY = "admin-activity-calendar";

const HEBREW_DAYS_SHORT = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];
const HEBREW_DAYS_LONG = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
];
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
  double_lesson: "bg-secondary text-secondary-foreground border-primary/25",
  justified_absence: "bg-muted text-muted-foreground border-border",
  unjustified_absence: "bg-destructive/10 text-destructive border-destructive/30",
  vacation: "bg-primary/10 text-primary border-primary/30",
};

const ATTENDED = new Set(["present", "double_lesson"]);

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const startOfWeek = (d: Date) => {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() - s.getDay()); // ראשון
  return s;
};
const addDays = (d: Date, n: number) => {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  s.setDate(s.getDate() + n);
  return s;
};
const dmy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;

interface LessonEntry {
  lineId: string;
  studentName: string;
  studentId: string | null;
  instrument: string;
  status: string;
  notes: string | null;
  schoolName: string;
  teacherName: string;
  teacherId: string | null;
  date: string;
}

interface TeacherRow {
  teacherId: string | null;
  teacherName: string;
  byDate: Map<string, LessonEntry[]>;
  total: number;
  attended: number;
  students: Set<string>;
  schools: Set<string>;
}

type ViewMode = "week" | "month";

const AdminActivityCalendar = () => {
  const navigate = useNavigate();
  const { selectedYearId } = useAcademicYear();

  const [viewMode, setViewMode] = usePersistedState<ViewMode>(ROUTE_KEY, "view", "week");
  const [anchorStr, setAnchorStr] = usePersistedState<string>(ROUTE_KEY, "anchor", fmt(new Date()));
  const [teacherFilter, setTeacherFilter] = usePersistedState<string[]>(ROUTE_KEY, "teachers", []);
  const [schoolFilter, setSchoolFilter] = usePersistedState<string[]>(ROUTE_KEY, "schools", []);
  const [statusFilter, setStatusFilter] = usePersistedState<string[]>(ROUTE_KEY, "statuses", []);
  const [instrumentFilter, setInstrumentFilter] = usePersistedState<string[]>(ROUTE_KEY, "instruments", []);
  const [detail, setDetail] = useState<{ title: string; subtitle: string; lessons: LessonEntry[] } | null>(null);

  const anchor = useMemo(() => {
    const [y, m, d] = anchorStr.split("-").map(Number);
    return new Date(y, (m ?? 1) - 1, d ?? 1);
  }, [anchorStr]);

  const days = useMemo(() => {
    if (viewMode === "week") {
      const s = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(s, i));
    }
    const m = startOfMonth(anchor);
    return Array.from({ length: daysInMonth(m) }, (_, i) => new Date(m.getFullYear(), m.getMonth(), i + 1));
  }, [anchor, viewMode]);

  const from = fmt(days[0]);
  const to = fmt(days[days.length - 1]);

  const shift = (dir: number) =>
    setAnchorStr(fmt(viewMode === "week" ? addDays(anchor, dir * 7) : addMonths(anchor, dir)));

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
             enrollments(student_id, students(first_name, last_name), instruments(name))
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
          studentId: line.enrollments?.student_id ?? null,
          instrument: inst,
          status: line.status,
          notes: line.notes,
          schoolName,
          teacherName,
          teacherId: r.teacher_id ?? null,
          date: r.report_date,
        });
      }
      if (lessons.length === 0) continue;
      lessons.sort((a, b) => cmpHe(a.studentName, b.studentName));

      const key = r.teacher_id ?? teacherName;
      const row =
        map.get(key) ??
        ({
          teacherId: r.teacher_id,
          teacherName,
          byDate: new Map(),
          total: 0,
          attended: 0,
          students: new Set<string>(),
          schools: new Set<string>(),
        } as TeacherRow);
      const existing = row.byDate.get(r.report_date) ?? [];
      row.byDate.set(r.report_date, [...existing, ...lessons]);
      row.total += lessons.length;
      row.attended += lessons.filter((l) => ATTENDED.has(l.status)).length;
      lessons.forEach((l) => row.students.add(l.studentId ?? l.studentName));
      if (schoolName) row.schools.add(schoolName);
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total || cmpHe(a.teacherName, b.teacherName));
  }, [reports, teacherFilter, schoolFilter, statusFilter, instrumentFilter]);

  const allLessons = useMemo(
    () => rows.flatMap((r) => Array.from(r.byDate.values()).flat()),
    [rows],
  );

  const stats = useMemo(() => {
    const students = new Set(allLessons.map((l) => l.studentId ?? l.studentName));
    const attended = allLessons.filter((l) => ATTENDED.has(l.status)).length;
    const absences = allLessons.filter((l) => l.status.endsWith("absence")).length;

    const perDay = new Map<string, number>();
    days.forEach((d) => perDay.set(fmt(d), 0));
    allLessons.forEach((l) => perDay.set(l.date, (perDay.get(l.date) ?? 0) + 1));
    const maxPerDay = Math.max(1, ...Array.from(perDay.values()));

    const weekdayLoad = new Array(7).fill(0);
    allLessons.forEach((l) => {
      const [y, m, d] = l.date.split("-").map(Number);
      weekdayLoad[new Date(y, m - 1, d).getDay()] += 1;
    });
    const busiestIdx = weekdayLoad.indexOf(Math.max(...weekdayLoad));

    const perSchool = new Map<string, number>();
    allLessons.forEach((l) => {
      const k = l.schoolName || "ללא שלוחה";
      perSchool.set(k, (perSchool.get(k) ?? 0) + 1);
    });

    return {
      lessons: allLessons.length,
      teachers: rows.length,
      students: students.size,
      attendanceRate: allLessons.length ? Math.round((attended / allLessons.length) * 100) : 0,
      absences,
      perDay,
      maxPerDay,
      busiestDay: allLessons.length ? HEBREW_DAYS_LONG[busiestIdx] : "—",
      perSchool: Array.from(perSchool.entries()).sort((a, b) => b[1] - a[1]),
    };
  }, [allLessons, rows, days]);

  const todayStr = fmt(new Date());
  const rangeLabel =
    viewMode === "week"
      ? `${dmy(days[0])} – ${dmy(days[days.length - 1])} · ${MONTH_NAMES[days[3].getMonth()]} ${days[3].getFullYear()}`
      : `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;

  const hasFilters =
    teacherFilter.length || schoolFilter.length || statusFilter.length || instrumentFilter.length;

  const DAY_W = viewMode === "week" ? 190 : 116;
  const NAME_W = 190;

  const heatClass = (count: number) => {
    if (!count) return "";
    const ratio = count / stats.maxPerDay;
    if (ratio > 0.75) return "bg-primary/[0.14]";
    if (ratio > 0.5) return "bg-primary/[0.10]";
    if (ratio > 0.25) return "bg-primary/[0.06]";
    return "bg-primary/[0.03]";
  };

  const exportExcel = async () => {
    const XLSX = await import("xlsx");
    const aoa = [
      ["תאריך", "יום", "מורה", "תלמיד", "כלי", "שלוחה", "סטטוס", "הערות"],
      ...allLessons
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date) || cmpHe(a.teacherName, b.teacherName))
        .map((l) => {
          const [y, m, d] = l.date.split("-").map(Number);
          return [
            `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y}`,
            HEBREW_DAYS_LONG[new Date(y, m - 1, d).getDay()],
            l.teacherName,
            l.studentName,
            l.instrument,
            l.schoolName,
            STATUS_LABELS[l.status] ?? l.status,
            l.notes ?? "",
          ];
        }),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "פעילות");
    XLSX.writeFile(wb, `activity-${from}_${to}.xlsx`);
  };

  const openDetail = (row: TeacherRow, dateKey: string, lessons: LessonEntry[]) => {
    const [y, m, d] = dateKey.split("-").map(Number);
    setDetail({
      title: row.teacherName,
      subtitle: `יום ${HEBREW_DAYS_LONG[new Date(y, m - 1, d).getDay()]} · ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}/${y} · ${lessons.length} שיעורים`,
      lessons,
    });
  };

  const kpis = [
    { label: "שיעורים", value: stats.lessons, icon: Music2 },
    { label: "מורים פעילים", value: stats.teachers, icon: Users },
    { label: "תלמידים", value: stats.students, icon: GraduationCap },
    { label: "נוכחות", value: `${stats.attendanceRate}%`, icon: TrendingUp },
    { label: "היום העמוס", value: stats.busiestDay, icon: CalendarDays },
  ];

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
              איך נראה שבוע בקונסרבטוריון — מי לימד, איפה ואת מי
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border overflow-hidden">
              {(["week", "month"] as ViewMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setViewMode(m)}
                  className={`h-11 px-4 text-sm font-medium transition-colors ${
                    viewMode === m ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
                  }`}
                >
                  {m === "week" ? "שבוע" : "חודש"}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl"
              aria-label="הבא"
              onClick={() => shift(1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setAnchorStr(fmt(new Date()))}>
              {viewMode === "week" ? "השבוע" : "החודש"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-xl"
              aria-label="הקודם"
              onClick={() => shift(-1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl gap-2"
              onClick={exportExcel}
              disabled={!allLessons.length}
            >
              <Download className="h-4 w-4" />
              ייצוא
            </Button>
          </div>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border bg-card p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <k.icon className="h-3.5 w-3.5" />
                {k.label}
              </div>
              <div className="mt-1 text-xl font-bold truncate">{k.value}</div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border bg-card p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{rangeLabel}</span>
            <div className="flex flex-wrap items-center gap-2">
              {stats.perSchool.slice(0, 4).map(([name, count]) => (
                <Badge key={name} variant="secondary" className="rounded-lg gap-1 font-normal">
                  <MapPin className="h-3 w-3" />
                  {name} · {count}
                </Badge>
              ))}
            </div>
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
            אין דיווחים בטווח זה
          </div>
        ) : (
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="overflow-x-auto overscroll-contain">
              <div style={{ minWidth: NAME_W + days.length * DAY_W }}>
                {/* כותרת ימים */}
                <div className="flex sticky top-0 z-20 bg-muted/60 backdrop-blur border-b">
                  <div
                    className="z-30 bg-muted/80 border-e px-3 py-2 text-xs font-semibold flex items-center"
                    style={{ width: NAME_W, minWidth: NAME_W, insetInlineStart: 0, position: "sticky" }}
                  >
                    מורה
                  </div>
                  {days.map((d) => {
                    const key = fmt(d);
                    const isToday = key === todayStr;
                    const isWeekend = d.getDay() === 6;
                    const count = stats.perDay.get(key) ?? 0;
                    return (
                      <div
                        key={key}
                        className={`px-1 py-2 text-center border-e text-[11px] leading-tight ${
                          isToday ? "bg-primary/15 text-primary font-bold" : isWeekend ? "bg-muted/80" : heatClass(count)
                        }`}
                        style={{ width: DAY_W, minWidth: DAY_W }}
                      >
                        <div className="font-semibold">
                          {viewMode === "week" ? `${HEBREW_DAYS_LONG[d.getDay()]} ${dmy(d)}` : d.getDate()}
                        </div>
                        <div className="opacity-70">
                          {viewMode === "week"
                            ? `${count} שיעורים`
                            : `${HEBREW_DAYS_SHORT[d.getDay()]}${count ? ` · ${count}` : ""}`}
                        </div>
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
                      className="z-10 bg-card border-e px-3 py-2 flex flex-col justify-center gap-0.5"
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
                        {row.total} שיעורים · {row.students.size} תלמידים
                      </span>
                      {row.schools.size > 0 && (
                        <span className="text-[10px] text-muted-foreground truncate">
                          {Array.from(row.schools).join(" · ")}
                        </span>
                      )}
                    </div>
                    {days.map((d) => {
                      const key = fmt(d);
                      const lessons = row.byDate.get(key) ?? [];
                      const isToday = key === todayStr;
                      const isWeekend = d.getDay() === 6;
                      const shown = viewMode === "week" ? lessons : lessons.slice(0, 4);
                      return (
                        <div
                          key={key}
                          onClick={() => lessons.length && openDetail(row, key, lessons)}
                          className={`border-e p-1 align-top ${lessons.length ? "cursor-pointer hover:bg-muted/40" : ""} ${
                            isToday ? "bg-primary/5" : isWeekend ? "bg-muted/30" : ""
                          }`}
                          style={{ width: DAY_W, minWidth: DAY_W }}
                        >
                          <div className="flex flex-col gap-1">
                            {shown.map((l) => (
                              <div
                                key={l.lineId}
                                title={`${l.studentName}${l.instrument ? ` · ${l.instrument}` : ""}${
                                  l.schoolName ? ` · ${l.schoolName}` : ""
                                } · ${STATUS_LABELS[l.status] ?? l.status}${l.notes ? ` · ${l.notes}` : ""}`}
                                className={`rounded-md border px-1.5 py-0.5 text-[10px] leading-tight ${
                                  viewMode === "week" ? "text-start" : "text-center"
                                } ${STATUS_STYLES[l.status] ?? "bg-muted"}`}
                              >
                                <span className="block truncate font-medium">{l.studentName}</span>
                                {(l.instrument || (viewMode === "week" && l.schoolName)) && (
                                  <span className="block truncate opacity-70">
                                    {[l.instrument, viewMode === "week" ? l.schoolName : ""]
                                      .filter(Boolean)
                                      .join(" · ")}
                                  </span>
                                )}
                              </div>
                            ))}
                            {lessons.length > shown.length && (
                              <span className="text-[10px] text-muted-foreground text-center">
                                +{lessons.length - shown.length} נוספים
                              </span>
                            )}
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

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto overscroll-contain" dir="rtl">
          <DialogHeader className="text-right">
            <DialogTitle>{detail?.title}</DialogTitle>
            <DialogDescription>{detail?.subtitle}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {detail?.lessons.map((l) => (
              <div
                key={l.lineId}
                className="rounded-xl border p-3 flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <button
                    type="button"
                    disabled={!l.studentId}
                    onClick={() => l.studentId && navigate(`/admin/students/${l.studentId}`)}
                    className="font-medium text-primary hover:underline disabled:text-foreground disabled:no-underline"
                  >
                    {l.studentName}
                  </button>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {[l.instrument, l.schoolName].filter(Boolean).join(" · ") || "—"}
                  </div>
                  {l.notes && <div className="text-xs mt-1">{l.notes}</div>}
                </div>
                <span
                  className={`shrink-0 rounded-md border px-2 py-0.5 text-[11px] ${
                    STATUS_STYLES[l.status] ?? "bg-muted"
                  }`}
                >
                  {STATUS_LABELS[l.status] ?? l.status}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminActivityCalendar;
