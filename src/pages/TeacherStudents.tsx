import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeacherProfile, useTeacherAllEnrollments } from "@/hooks/useTeacherData";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Search, ChevronLeft, Copy, CheckCircle2, Clock } from "lucide-react";

const TeacherStudents = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { selectedYearId, years, activeYear } = useAcademicYear();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { data: enrollments, isLoading: enrollmentsLoading } = useTeacherAllEnrollments(teacher?.id, selectedYearId);

  const [tab, setTab] = useState<"current" | "registration">("current");
  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [instrumentFilter, setInstrumentFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("active");

  // ── Previous year = newest year that is NOT active (e.g. תשפ"ו when תשפ"ז is active) ──
  const previousYear = useMemo(() => {
    if (!years?.length || !activeYear) return null;
    const candidates = years.filter(
      (y) => !y.is_active && new Date(y.start_date).getTime() < new Date(activeYear.start_date).getTime()
    );
    if (!candidates.length) return null;
    return [...candidates].sort((a, b) =>
      new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
    )[0];
  }, [years, activeYear]);

  // ── Fetch teacher's enrollments from PREVIOUS year ──
  const { data: previousYearEnrollments, isLoading: prevLoading } = useQuery({
    queryKey: ["teacher-prev-year-enrollments", teacher?.id, previousYear?.id],
    enabled: !!teacher?.id && !!previousYear?.id && tab === "registration",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`*, students (*), instruments (name), schools (id, name)`)
        .eq("teacher_id", teacher!.id)
        .eq("academic_year_id", previousYear!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Registered national IDs for the active year (via SECURITY DEFINER RPC; teachers can't read registrations directly) ──
  const { data: registeredFromForms } = useQuery({
    queryKey: ["registered-nids-for-year", activeYear?.id],
    enabled: !!activeYear?.id && tab === "registration",
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_registered_national_ids_for_year", {
        _year_id: activeYear!.id,
      });
      if (error) throw error;
      return (data ?? []) as { national_id: string }[];
    },
  });

  // ── Also count students already enrolled in the active year (e.g. promoted by admin) as "registered" ──
  const { data: activeYearEnrollmentNids } = useQuery({
    queryKey: ["teacher-active-year-enrolled-nids", activeYear?.id],
    enabled: !!activeYear?.id && tab === "registration",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("students!inner(national_id)")
        .eq("academic_year_id", activeYear!.id);
      if (error) throw error;
      return (data ?? []) as { students: { national_id: string | null } }[];
    },
  });

  const registeredIds = useMemo(() => {
    const set = new Set<string>();
    registeredFromForms?.forEach((r) => {
      if (r.national_id) set.add(r.national_id.trim());
    });
    activeYearEnrollmentNids?.forEach((e) => {
      const nid = e.students?.national_id;
      if (nid) set.add(nid.trim());
    });
    return set;
  }, [registeredFromForms, activeYearEnrollmentNids]);

  // ── Unique students from PREVIOUS-year enrollments (active only) ──
  const previousYearStudents = useMemo(() => {
    if (!previousYearEnrollments) return [];
    const map = new Map<string, any>();
    previousYearEnrollments.forEach((e: any) => {
      if (!e.is_active) return;
      if ((e.students as any)?.student_status === "הפסיק") return;
      const s = e.students;
      if (!s) return;
      if (!map.has(s.id)) {
        map.set(s.id, {
          studentId: s.id,
          firstName: s.first_name,
          lastName: s.last_name,
          nationalId: (s.national_id ?? "").trim(),
          parentPhone: s.parent_phone,
          instrumentName: e.instruments?.name,
          schoolName: e.schools?.name,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "he")
    );
  }, [enrollments]);

  const registrationRows = useMemo(() => {
    return previousYearStudents.map((s) => ({
      ...s,
      isRegistered: s.nationalId ? registeredIds.has(s.nationalId) : false,
    }));
  }, [previousYearStudents, registeredIds]);

  const registrationFiltered = useMemo(() => {
    return registrationRows.filter((r) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return `${r.firstName} ${r.lastName}`.toLowerCase().includes(q);
    });
  }, [registrationRows, search]);

  const registeredCount = registrationRows.filter((r) => r.isRegistered).length;
  const pendingCount = registrationRows.length - registeredCount;

  // ── Existing filters for "current" tab ──
  const schools = useMemo(() => {
    if (!enrollments) return [];
    const unique = new Map<string, string>();
    enrollments.forEach((e) => {
      if (e.schools) unique.set(e.school_id, e.schools.name);
    });
    return Array.from(unique, ([id, name]) => ({ id, name }));
  }, [enrollments]);

  const instruments = useMemo(() => {
    if (!enrollments) return [];
    const unique = new Map<string, string>();
    enrollments.forEach((e) => {
      if (e.instruments) unique.set(e.instrument_id, e.instruments.name);
    });
    return Array.from(unique, ([id, name]) => ({ id, name }));
  }, [enrollments]);

  const filtered = useMemo(() => {
    if (!enrollments) return [];
    return enrollments
      .filter((e) => {
        const studentName = `${e.students?.first_name ?? ""} ${e.students?.last_name ?? ""}`;
        if (search && !studentName.includes(search)) return false;
        if (schoolFilter !== "all" && e.school_id !== schoolFilter) return false;
        if (instrumentFilter !== "all" && e.instrument_id !== instrumentFilter) return false;
        if (activeFilter === "active" && (!e.is_active || (e.students as any)?.student_status === "הפסיק")) return false;
        if (activeFilter === "inactive" && (e.is_active && (e.students as any)?.student_status !== "הפסיק")) return false;
        return true;
      })
      .sort((a, b) => {
        const nameA = `${a.students?.first_name ?? ""} ${a.students?.last_name ?? ""}`;
        const nameB = `${b.students?.first_name ?? ""} ${b.students?.last_name ?? ""}`;
        return nameA.localeCompare(nameB, "he");
      });
  }, [enrollments, search, schoolFilter, instrumentFilter, activeFilter]);

  const isLoading = teacherLoading || enrollmentsLoading;

  const registrationLink = activeYear
    ? `${window.location.origin}/register?year=${encodeURIComponent(activeYear.name)}`
    : "";

  const copyLink = async () => {
    if (!registrationLink) return;
    try {
      await navigator.clipboard.writeText(registrationLink);
      toast({ title: "הלינק הועתק", description: registrationLink });
    } catch {
      toast({ title: "העתקה נכשלה", variant: "destructive" });
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary px-5 pb-6 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => navigate("/teacher")}
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold">
            {tab === "current" ? `התלמידים שלי (${filtered.length})` : "מצב הרשמה לשנה הבאה"}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-4">
        {/* Tabs */}
        <div className="flex gap-2 rounded-2xl bg-muted p-1 shadow-sm">
          <button
            onClick={() => setTab("current")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              tab === "current" ? "bg-card text-foreground shadow" : "text-muted-foreground"
            }`}
          >
            תלמידים נוכחיים
          </button>
          <button
            onClick={() => setTab("registration")}
            className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors ${
              tab === "registration" ? "bg-card text-foreground shadow" : "text-muted-foreground"
            }`}
          >
            מצב הרשמה
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם תלמיד..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 h-12 rounded-2xl bg-card shadow-sm border-border text-base"
          />
        </div>

        {tab === "current" && (
          <>
            {/* Filters */}
            <div className="grid grid-cols-3 gap-3">
              <Select value={schoolFilter} onValueChange={setSchoolFilter}>
                <SelectTrigger className="h-11 rounded-xl bg-card">
                  <SelectValue placeholder="כל בתי הספר" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל בתי הספר</SelectItem>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
                <SelectTrigger className="h-11 rounded-xl bg-card">
                  <SelectValue placeholder="כל הכלים" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הכלים</SelectItem>
                  {instruments.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="h-11 rounded-xl bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">פעילים</SelectItem>
                  <SelectItem value="all">הכל</SelectItem>
                  <SelectItem value="inactive">לא פעילים</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results */}
            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">טוען...</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">לא נמצאו רישומים</p>
            ) : (
              <div className="space-y-3">
                {filtered.map((enrollment, index) => (
                  <button
                    key={enrollment.id}
                    onClick={() => navigate(`/teacher/students/${enrollment.id}`)}
                    className={`flex w-full items-center gap-3 rounded-2xl bg-card p-4 shadow-sm border text-right transition-all active:scale-[0.98] hover:shadow-md ${!enrollment.is_active || (enrollment.students as any)?.student_status === "הפסיק" ? "border-destructive/30" : "border-primary/30"}`}
                  >
                    <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${!enrollment.is_active || (enrollment.students as any)?.student_status === "הפסיק" ? "bg-destructive/10" : "bg-primary/10"}`}>
                      <span className={`text-sm font-bold ${!enrollment.is_active || (enrollment.students as any)?.student_status === "הפסיק" ? "text-destructive" : "text-primary"}`}>{index + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">
                        {enrollment.students?.first_name} {enrollment.students?.last_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                        <span>{enrollment.instruments?.name}</span>
                        <span>·</span>
                        <span>{enrollment.lesson_duration_minutes} דק׳</span>
                        <span>·</span>
                        <span>{enrollment.schools?.name}</span>
                      </div>
                    </div>
                    {(!enrollment.is_active || (enrollment.students as any)?.student_status === "הפסיק") && (
                      <Badge variant="outline" className="rounded-lg text-destructive border-destructive shrink-0">לא פעיל</Badge>
                    )}
                    <ChevronLeft className="h-5 w-5 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {tab === "registration" && (
          <>
            {!previousYear ? (
              <div className="rounded-2xl bg-card p-5 text-center text-muted-foreground border border-border shadow-sm">
                לא נמצאה שנת לימודים קודמת להשוואה.
              </div>
            ) : (
              <>
                {/* Summary + copy link */}
                <div className="rounded-2xl bg-card p-4 shadow-sm border border-border space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">תלמידים מ־</span>
                    <span className="font-semibold">{previousYear.name} → {activeYear?.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2.5 text-center">
                      <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{registeredCount}</div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-400">נרשמו</div>
                    </div>
                    <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 px-3 py-2.5 text-center">
                      <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{pendingCount}</div>
                      <div className="text-xs text-amber-700 dark:text-amber-400">עדיין לא</div>
                    </div>
                  </div>
                  <Button onClick={copyLink} className="w-full h-11 rounded-xl" variant="outline">
                    <Copy className="ml-2 h-4 w-4" />
                    העתקת לינק להרשמה
                  </Button>
                </div>

                {/* List */}
                {isLoading ? (
                  <p className="text-center text-muted-foreground py-8">טוען...</p>
                ) : registrationFiltered.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">אין תלמידים להצגה</p>
                ) : (
                  <div className="space-y-2.5">
                    {registrationFiltered.map((r) => (
                      <div
                        key={r.studentId}
                        className={`flex items-center gap-3 rounded-2xl bg-card p-3.5 shadow-sm border ${
                          r.isRegistered ? "border-emerald-300/60" : "border-amber-300/60"
                        }`}
                      >
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                          r.isRegistered ? "bg-emerald-100 dark:bg-emerald-950/40" : "bg-amber-100 dark:bg-amber-950/40"
                        }`}>
                          {r.isRegistered ? (
                            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground truncate">
                            {r.firstName} {r.lastName}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            {r.instrumentName && <span>{r.instrumentName}</span>}
                            {r.schoolName && <><span>·</span><span>{r.schoolName}</span></>}
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`rounded-lg shrink-0 ${
                            r.isRegistered
                              ? "border-emerald-500 text-emerald-700 dark:text-emerald-400"
                              : "border-amber-500 text-amber-700 dark:text-amber-400"
                          }`}
                        >
                          {r.isRegistered ? "נרשם" : "ממתין"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default TeacherStudents;
