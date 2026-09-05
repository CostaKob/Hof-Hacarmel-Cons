import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { useBranchCoordinatorBranches } from "@/hooks/useBranchCoordinator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { REGISTRATION_STATUSES } from "@/lib/registrationStatuses";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import PageTitle from "@/components/PageTitle";
import {
  ChevronLeft,
  Users,
  FileText,
  UserCircle,
  ClipboardCheck,
  Search,
  GraduationCap,
  X,
  MapPin,
  Music,
  CalendarDays,
} from "lucide-react";
import { isInactiveStudentStatus } from "@/lib/constants";
import {
  emptyStatusCounts,
  calcTotal,
  getExpectedLessons,
  getMonthlyRate,
  getRateColorClass,
  STATUS_LABELS_HE,
} from "@/lib/lessonCounts";
import EnrollmentHistoryDialog from "@/components/EnrollmentHistoryDialog";



const statusLabel = (status?: string) => {
  switch (status) {
    case "present":
      return { label: "נכח", variant: "default" as const };
    case "absent":
      return { label: "נעדר", variant: "destructive" as const };
    case "approved_absence":
      return { label: "חיסור מאושר", variant: "secondary" as const };
    default:
      return { label: "לא דווח", variant: "outline" as const };
  }
};

const TeacherBranchCard = () => {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { selectedYearId } = useAcademicYear();
  const { data: branches = [] } = useBranchCoordinatorBranches(teacher?.id);
  const branch = branches.find((b) => b.school_id === schoolId);
  const [search, setSearch] = useState("");
  const [attendanceView, setAttendanceView] = useState<"summary" | "reports">("summary");
  const [historyEnrollment, setHistoryEnrollment] = useState<{ id: string; name: string } | null>(null);


  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["branch-students", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`*, students (*), instruments (name), teachers (first_name, last_name)`)
        .eq("school_id", schoolId!)
        .eq("academic_year_id", selectedYearId!)
        .eq("is_active", true)
        .returns<any[]>();
      if (error) throw error;
      return (data ?? []).filter((e) => !isInactiveStudentStatus(e.students?.student_status));
    },
  });

  const { data: registrations = [], isLoading: registrationsLoading } = useQuery({
    queryKey: ["branch-registrations", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .eq("academic_year_id", selectedYearId!)
        .order("created_at", { ascending: false })
        .returns<any[]>();
      if (error) throw error;
      const schoolName = branch?.schools?.name;
      if (!schoolName) return [];
      return (data ?? []).filter((r) => r.branch_school_name === schoolName);
    },
  });

  const { data: teachers = [], isLoading: teachersLoading } = useQuery({
    queryKey: ["branch-teachers", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          teacher_id,
          teachers (
            id, first_name, last_name, phone, email, city,
            teacher_instruments (instruments (name))
          )
        `)
        .eq("school_id", schoolId!)
        .eq("academic_year_id", selectedYearId!)
        .eq("is_active", true)
        .returns<any[]>();
      if (error) throw error;
      const map = new Map<string, any>();
      for (const e of data ?? []) {
        if (e.teachers?.id && !map.has(e.teachers.id)) {
          map.set(e.teachers.id, e.teachers);
        }
      }
      return Array.from(map.values());
    },
  });

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ["branch-attendance", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select(`id, report_date, teacher_id, teachers (first_name, last_name), report_lines (status, notes, enrollments!inner (students (first_name, last_name)))`)
        .eq("school_id", schoolId!)
        .eq("academic_year_id", selectedYearId!)
        .order("report_date", { ascending: false })
        .limit(50)
        .returns<any[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

  // Per-student attendance summary (progress tracking)
  const { data: attendanceSummary = [], isLoading: summaryLoading } = useQuery({
    queryKey: ["branch-attendance-summary", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_lines")
        .select(`
          status,
          enrollment_id,
          enrollments!inner (
            id, school_id, academic_year_id, is_active, start_date, instrument_start_date,
            students (first_name, last_name, student_status),
            instruments (name),
            teachers (first_name, last_name)
          )
        `)
        .eq("enrollments.school_id", schoolId!)
        .eq("enrollments.academic_year_id", selectedYearId!)
        .eq("enrollments.is_active", true)
        .returns<any[]>();
      if (error) throw error;
      const map = new Map<string, any>();
      for (const line of data ?? []) {
        const e = line.enrollments;
        if (!e) continue;
        if (isInactiveStudentStatus(e.students?.student_status)) continue;
        let row = map.get(e.id);
        if (!row) {
          row = {
            enrollmentId: e.id,
            studentName: `${e.students?.first_name ?? ""} ${e.students?.last_name ?? ""}`.trim(),
            instrumentName: e.instruments?.name ?? "—",
            teacherName: `${e.teachers?.first_name ?? ""} ${e.teachers?.last_name ?? ""}`.trim(),
            startDate: e.instrument_start_date || e.start_date,
            counts: emptyStatusCounts(),
          };
          map.set(e.id, row);
        }
        if (line.status in row.counts) row.counts[line.status]++;
      }
      const rows = Array.from(map.values()).map((r) => {
        const total = calcTotal(r.counts);
        const expected = getExpectedLessons(r.startDate);
        const { rate, status } = getMonthlyRate(total, r.startDate);
        return { ...r, total, expected, rate, rateStatus: status };
      });
      rows.sort((a, b) => a.rate - b.rate);
      return rows;
    },
  });


  // ── Student filters (mirrors the admin students page) ──
  const [teacherFilter, setTeacherFilter] = useState<string[]>([]);
  const [instrumentFilter, setInstrumentFilter] = useState<string[]>([]);
  const [gradeFilter, setGradeFilter] = useState<string[]>([]);
  const [cityFilter, setCityFilter] = useState<string[]>([]);
  const [durationFilter, setDurationFilter] = useState<string[]>([]);
  const [trackFilter, setTrackFilter] = useState<string[]>([]);

  const uniqSorted = (vals: (string | null | undefined)[]) =>
    [...new Set(vals.filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, "he"));

  const teacherOptions = uniqSorted(
    students.map((e: any) => (e.teachers ? `${e.teachers.first_name} ${e.teachers.last_name}` : null)),
  );
  const instrumentOptions = uniqSorted(students.map((e: any) => e.instruments?.name));
  const cityOptions = uniqSorted(students.map((e: any) => e.students?.city));
  const durationOptions = [...new Set(students.map((e: any) => String(e.lesson_duration_minutes ?? "")).filter(Boolean))]
    .sort((a, b) => Number(a) - Number(b));

  const hasStudentFilters =
    teacherFilter.length > 0 ||
    instrumentFilter.length > 0 ||
    gradeFilter.length > 0 ||
    cityFilter.length > 0 ||
    durationFilter.length > 0 ||
    trackFilter.length > 0;

  const clearStudentFilters = () => {
    setTeacherFilter([]);
    setInstrumentFilter([]);
    setGradeFilter([]);
    setCityFilter([]);
    setDurationFilter([]);
    setTrackFilter([]);
  };

  const stripMarks = (str: string) => (str ?? "").replace(/['"׳״']/g, "").trim();

  const filteredStudents = students.filter((e: any) => {
    const s = e.students;
    if (!s) return false;
    const term = search.trim();
    if (term) {
      const hay = `${s.first_name} ${s.last_name} ${s.national_id ?? ""} ${s.parent_name ?? ""} ${s.parent_phone ?? ""} ${s.city ?? ""}`;
      if (!hay.includes(term)) return false;
    }
    if (teacherFilter.length > 0) {
      const name = e.teachers ? `${e.teachers.first_name} ${e.teachers.last_name}` : "";
      if (!teacherFilter.includes(name)) return false;
    }
    if (instrumentFilter.length > 0 && !instrumentFilter.includes(e.instruments?.name)) return false;
    if (cityFilter.length > 0 && !cityFilter.includes(s.city)) return false;
    if (durationFilter.length > 0 && !durationFilter.includes(String(e.lesson_duration_minutes ?? ""))) return false;
    if (gradeFilter.length > 0) {
      const wanted = gradeFilter.map(stripMarks);
      if (!wanted.includes(stripMarks(s.grade ?? e.grade ?? ""))) return false;
    }
    if (trackFilter.length > 0) {
      const map: Record<string, string> = {
        music_production: "has_music_production_course",
        recital: "has_recital_track",
        major: "is_major_student",
        junior: "is_junior_track",
      };
      if (!trackFilter.some((t) => map[t] && s[map[t]])) return false;
    }
    return true;
  });


  const filteredRegistrations = registrations
    .filter((r) => r.status !== "converted")
    .filter((r) => {
      const term = search.trim();
      if (!term) return true;
      const hay = `${r.student_first_name} ${r.student_last_name} ${r.student_national_id ?? ""} ${r.parent_name ?? ""} ${r.parent_phone ?? ""}`;
      return hay.includes(term);
    });

  const filteredTeachers = teachers.filter((t) => {
    const term = search.trim();
    if (!term) return true;
    const instruments = (t.teacher_instruments ?? [])
      .map((ti: any) => ti.instruments?.name)
      .filter(Boolean)
      .join(" ");
    const hay = `${t.first_name} ${t.last_name} ${t.phone ?? ""} ${t.email ?? ""} ${t.city ?? ""} ${instruments}`;
    return hay.includes(term);
  });

  const loading = teacherLoading || !branch;

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!branch) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">לא נמצאה הרשאת רכז לשלוחה זו</p>
        <Button className="mt-4" onClick={() => navigate("/teacher/branches")}>
          חזרה לרשימת השלוחות
        </Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <PageTitle title={branch.schools?.name ?? "שלוחה"} />
      <header className="bg-primary px-5 pb-6 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground shrink-0"
            onClick={() => navigate("/teacher/branches")}
          >
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{branch.schools?.name ?? branch.branch_name}</h1>
            <p className="text-xs text-primary-foreground/80">חשבון רכז שלוחה</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="ms-auto shrink-0 gap-1.5 rounded-xl"
            onClick={() => navigate(`/teacher/branches/${schoolId}/schedule`)}
          >
            <CalendarDays className="h-4 w-4" />
            לוח שבועי
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 -mt-3 pb-24">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur pt-3 pb-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם, ת.ז., הורה, טלפון או ישוב..."
              className="h-11 pr-9 rounded-xl"
            />
          </div>
        </div>

        <Tabs dir="rtl" defaultValue="students" className="mt-2 text-right">
          <TabsList className="grid w-full grid-cols-4 h-11 rounded-xl">
            <TabsTrigger value="students" className="text-xs gap-1">
              <Users className="h-3.5 w-3.5" />
              תלמידים ({filteredStudents.length})
            </TabsTrigger>
            <TabsTrigger value="registrations" className="text-xs gap-1">
              <FileText className="h-3.5 w-3.5" />
              הרשמות ({filteredRegistrations.length})
            </TabsTrigger>
            <TabsTrigger value="teachers" className="text-xs gap-1">
              <UserCircle className="h-3.5 w-3.5" />
              מורים ({filteredTeachers.length})
            </TabsTrigger>
            <TabsTrigger value="attendance" className="text-xs gap-1">
              <ClipboardCheck className="h-3.5 w-3.5" />
              נוכחות
            </TabsTrigger>
          </TabsList>


          <TabsContent value="students" className="mt-3 space-y-3">
            {/* Filters — same style as the admin students page */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:flex lg:flex-wrap lg:items-center">
              <MultiSelectFilter
                className="w-full lg:w-40"
                allLabel="מורה"
                options={teacherOptions}
                value={teacherFilter}
                onChange={setTeacherFilter}
              />
              <MultiSelectFilter
                className="w-full lg:w-40"
                allLabel="כלי נגינה"
                options={instrumentOptions}
                value={instrumentFilter}
                onChange={setInstrumentFilter}
              />
              <MultiSelectFilter
                className="w-full lg:w-32"
                allLabel="כיתה"
                options={["א","ב","ג","ד","ה","ו","ז","ח","ט","י","יא","יב","בוגר"]}
                renderLabel={(g) => `כיתה ${g}`}
                value={gradeFilter}
                onChange={setGradeFilter}
              />
              <MultiSelectFilter
                className="w-full lg:w-36"
                allLabel="ישוב מגורים"
                options={cityOptions}
                value={cityFilter}
                onChange={setCityFilter}
              />
              <MultiSelectFilter
                className="w-full lg:w-32"
                allLabel="משך שיעור"
                options={durationOptions}
                renderLabel={(d) => `${d} דק׳`}
                value={durationFilter}
                onChange={setDurationFilter}
              />
              <MultiSelectFilter
                className="w-full col-span-2 md:col-span-1 lg:w-44"
                allLabel="קורסים ומסלולים"
                options={["music_production", "recital", "major", "junior"]}
                renderLabel={(k) => ({ music_production: "🎚️ הפקה מוסיקלית", recital: "🎼 רסיטל י״ב", major: "🎓 מגמת המוסיקה", junior: "📘 מסלול חטיבה" })[k] ?? k}
                value={trackFilter}
                onChange={setTrackFilter}
              />
              {hasStudentFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearStudentFilters}
                  className="h-11 rounded-xl gap-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                  נקה סינון
                </Button>
              )}
            </div>

            {studentsLoading ? (
              <p className="text-center text-muted-foreground py-8">טוען...</p>
            ) : filteredStudents.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין תלמידים פעילים בשלוחה זו</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-2">{filteredStudents.length} תלמידים</p>
                <div className="space-y-2">
                  {filteredStudents.map((e: any, index: number) => {
                    const s = e.students;
                    return (
                      <div
                        key={e.id}
                        onClick={() => navigate(`/teacher/students/${e.id}`)}
                        className={`flex flex-col sm:flex-row sm:items-stretch gap-3 rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99] ${!s?.is_active ? "opacity-50" : ""}`}
                      >
                        {/* Right half — name + details */}
                        <div className="flex items-start gap-3 sm:basis-1/2 sm:min-w-0">
                          <span className="text-xs text-muted-foreground w-6 shrink-0 text-center pt-0.5">{index + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-foreground">
                              {s?.first_name} {s?.last_name}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
                              <span>{e.instruments?.name}</span>
                              <span>·</span>
                              <span>{e.lesson_duration_minutes} דק׳</span>
                              {e.teachers && (
                                <>
                                  <span>·</span>
                                  <span>{e.teachers.first_name} {e.teachers.last_name}</span>
                                </>
                              )}
                              {(e.grade ?? s?.grade) && (
                                <>
                                  <span>·</span>
                                  <span className={s?.grade === "יב" || s?.grade === "בוגר" ? "font-bold text-amber-600 dark:text-amber-400" : ""}>
                                    כיתה {s?.grade ?? e.grade}
                                  </span>
                                </>
                              )}
                              {s?.playing_level && (
                                <>
                                  <span>·</span>
                                  <span>רמה {s.playing_level}</span>
                                </>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
                              {s?.parent_name && <span>{s.parent_name}</span>}
                              {s?.parent_phone && (
                                <>
                                  <span>·</span>
                                  <PhoneDisplay phone={s.parent_phone} stopPropagation textClassName="text-sm text-muted-foreground" />
                                </>
                              )}
                              {s?.city && (
                                <>
                                  <span>·</span>
                                  <span>{s.city}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Left half — tracks + status */}
                        <div className="flex flex-col items-start sm:items-end gap-1.5 sm:basis-1/2 sm:min-w-0">
                          <div className="flex flex-wrap items-start justify-start sm:justify-end content-start gap-1.5 w-full">
                            {s?.is_major_student && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">🎓 מגמת המוסיקה</Badge>}
                            {s?.is_junior_track && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">📘 מסלול חטיבה</Badge>}
                            {s?.has_music_production_course && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">🎚️ הפקה</Badge>}
                            {s?.has_recital_track && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">🎼 רסיטל י״ב</Badge>}
                          </div>
                          <div className="flex flex-wrap items-start justify-start sm:justify-end content-start gap-1.5 w-full">
                            <Badge variant="secondary" className="rounded-lg">
                              <GraduationCap className="h-3 w-3 ml-1" />
                              {s?.grade ?? e.grade ?? "—"}
                            </Badge>
                            <Badge
                              variant={(!e.is_active || isInactiveStudentStatus(s?.student_status)) ? "outline" : "default"}
                              className={`rounded-lg ${(!e.is_active || isInactiveStudentStatus(s?.student_status)) ? "text-destructive border-destructive" : ""}`}
                            >
                              {!e.is_active ? "רישום לא פעיל" : isInactiveStudentStatus(s?.student_status) ? s?.student_status : "פעיל"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </TabsContent>


          <TabsContent value="registrations" className="mt-3 space-y-3">
            {registrationsLoading ? (
              <p className="text-center text-muted-foreground py-8">טוען...</p>
            ) : filteredRegistrations.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין הרשמות לשלוחה זו</p>
            ) : (
              filteredRegistrations.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {r.student_first_name} {r.student_last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.grade} · {r.requested_instruments?.join(", ") ?? "—"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 border-transparent ${REGISTRATION_STATUSES[r.status]?.color ?? ""}`}
                      >
                        {REGISTRATION_STATUSES[r.status]?.label ?? r.status}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground space-y-1">
                      <p>הורה: {r.parent_name}</p>
                      {r.parent_phone && <PhoneDisplay phone={r.parent_phone} showIcon textClassName="text-xs" />}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="teachers" className="mt-3 space-y-3">
            {teachersLoading ? (
              <p className="text-center text-muted-foreground py-8">טוען...</p>
            ) : filteredTeachers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין מורים פעילים בשלוחה זו</p>
            ) : (
              filteredTeachers.map((t) => {
                const instruments = (t.teacher_instruments ?? [])
                  .map((ti: any) => ti.instruments?.name)
                  .filter(Boolean);
                return (
                  <Card
                    key={t.id}
                    onClick={() => navigate(`/teacher/branches/${schoolId}/teachers/${t.id}`)}
                    className="cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold">
                          {t.first_name} {t.last_name}
                        </p>
                        {t.city && (
                          <Badge variant="outline" className="rounded-lg gap-1 text-xs shrink-0">
                            <MapPin className="h-3 w-3" />
                            {t.city}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-1">
                        {t.phone && <PhoneDisplay phone={t.phone} showIcon textClassName="text-sm" />}
                        {t.email && <p className="text-xs text-muted-foreground">{t.email}</p>}
                      </div>
                      {instruments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {instruments.map((name: string) => (
                            <Badge key={name} variant="secondary" className="rounded-lg gap-1 text-xs">
                              <Music className="h-3 w-3" />
                              {name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="attendance" className="mt-3 space-y-3">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={attendanceView === "summary" ? "default" : "outline"}
                className="rounded-xl flex-1"
                onClick={() => setAttendanceView("summary")}
              >
                מעקב לפי תלמיד
              </Button>
              <Button
                size="sm"
                variant={attendanceView === "reports" ? "default" : "outline"}
                className="rounded-xl flex-1"
                onClick={() => setAttendanceView("reports")}
              >
                דיווחים אחרונים
              </Button>
            </div>

            {attendanceView === "summary" ? (
              summaryLoading ? (
                <p className="text-center text-muted-foreground py-8">טוען...</p>
              ) : attendanceSummary.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">אין דיווחי נוכחות בשלוחה זו</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: "בקצב תקין", n: attendanceSummary.filter((r: any) => r.rateStatus === "good").length, cls: "text-green-600" },
                      { label: "פיגור קל", n: attendanceSummary.filter((r: any) => r.rateStatus === "medium").length, cls: "text-yellow-500" },
                      { label: "בפיגור", n: attendanceSummary.filter((r: any) => r.rateStatus === "bad").length, cls: "text-red-500" },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-border bg-card py-2">
                        <div className={`text-lg font-bold ${s.cls}`}>{s.n}</div>
                        <div className="text-[11px] text-muted-foreground">{s.label}</div>
                      </div>
                    ))}
                  </div>

                  {attendanceSummary
                    .filter((r: any) =>
                      !search.trim() ||
                      `${r.studentName} ${r.instrumentName} ${r.teacherName}`.includes(search.trim())
                    )
                    .map((r: any) => (
                      <button
                        key={r.enrollmentId}
                        onClick={() => setHistoryEnrollment({ id: r.enrollmentId, name: r.studentName })}
                        className="w-full text-right rounded-2xl border border-border bg-card p-3 space-y-2 active:scale-[0.99] transition"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{r.studentName}</span>
                          <span className="flex items-center gap-2 shrink-0">
                            <span className="text-sm font-semibold text-primary">
                              {r.total} / {r.expected}
                            </span>
                            {r.rateStatus !== "unknown" && (
                              <span className={`text-xs font-medium ${getRateColorClass(r.rateStatus)}`}>
                                ({r.rate.toFixed(1)}/חודש)
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.instrumentName} · {r.teacherName || "—"}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(r.counts as Record<string, number>)
                            .filter(([, n]) => n > 0)
                            .map(([k, n]) => (
                              <Badge key={k} variant="secondary" className="text-[10px]">
                                {STATUS_LABELS_HE[k] ?? k}: {n}
                              </Badge>
                            ))}
                        </div>
                      </button>
                    ))}
                </>
              )
            ) : attendanceLoading ? (
              <p className="text-center text-muted-foreground py-8">טוען...</p>
            ) : attendance.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין דיווחי נוכחות בשלוחה זו</p>
            ) : (
              attendance.map((report) => (
                <Card key={report.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>דיווח מ-{new Date(report.report_date).toLocaleDateString("he-IL")}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {report.teachers?.first_name} {report.teachers?.last_name}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {(report.report_lines ?? []).slice(0, 5).map((line: any, idx: number) => {
                        const student = line.enrollments?.students;
                        return (
                          <div key={idx} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                            <span className="truncate">
                              {student?.first_name} {student?.last_name}
                            </span>
                            <Badge variant="secondary" className="text-[10px] shrink-0">
                              {STATUS_LABELS_HE[line.status] ?? line.status}
                            </Badge>
                          </div>
                        );
                      })}
                      {(report.report_lines ?? []).length > 5 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{(report.report_lines ?? []).length - 5} שורות נוספות
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

        </Tabs>

        <EnrollmentHistoryDialog
          enrollmentId={historyEnrollment?.id ?? null}
          studentName={historyEnrollment?.name}
          onOpenChange={(open) => !open && setHistoryEnrollment(null)}
        />
      </main>

    </div>
  );
};

export default TeacherBranchCard;
