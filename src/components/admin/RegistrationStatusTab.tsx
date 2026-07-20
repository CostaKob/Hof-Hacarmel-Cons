import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, CheckCircle2, Clock, Phone, GraduationCap } from "lucide-react";
import { PhoneDisplay } from "@/components/PhoneDisplay";

const RegistrationStatusTab = () => {
  const navigate = useNavigate();
  const { years, activeYear } = useAcademicYear();

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

  const [search, setSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [instrumentFilter, setInstrumentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "registered" | "pending" | "graduated">("all");

  // Previous year enrollments
  const { data: prevEnrollments = [], isLoading: prevLoading } = useQuery({
    queryKey: ["admin-prev-year-enrollments-all", previousYear?.id],
    enabled: !!previousYear?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, is_active, grade, students(id, first_name, last_name, national_id, parent_phone, phone, student_status), teachers(id, first_name, last_name), instruments(id, name), schools(id, name)")
        .eq("academic_year_id", previousYear!.id);
      if (error) throw error;
      return data as any[];
    },
  });

  // Registrations in active year
  const { data: activeRegs = [] } = useQuery({
    queryKey: ["admin-active-year-registrations", activeYear?.id],
    enabled: !!activeYear?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, student_national_id, existing_student_id")
        .eq("academic_year_id", activeYear!.id);
      if (error) throw error;
      return data as any[];
    },
  });

  // Active year enrollments (already enrolled counts as registered)
  const { data: activeEnrollments = [] } = useQuery({
    queryKey: ["admin-active-year-enrollments-ids", activeYear?.id],
    enabled: !!activeYear?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("student_id, students(national_id)")
        .eq("academic_year_id", activeYear!.id);
      if (error) throw error;
      return data as any[];
    },
  });

  const { registeredNids, registeredStudentIds } = useMemo(() => {
    const nids = new Set<string>();
    const sids = new Set<string>();
    for (const r of activeRegs) {
      if (r.student_national_id) nids.add(String(r.student_national_id).trim());
      if (r.existing_student_id) sids.add(r.existing_student_id);
    }
    for (const e of activeEnrollments) {
      if (e.student_id) sids.add(e.student_id);
      if (e.students?.national_id) nids.add(String(e.students.national_id).trim());
    }
    return { registeredNids: nids, registeredStudentIds: sids };
  }, [activeRegs, activeEnrollments]);

  const students = useMemo(() => {
    const map = new Map<string, any>();
    for (const e of prevEnrollments) {
      if (!e.is_active) continue;
      const s = e.students;
      if (!s) continue;
      if (s.student_status === "הפסיק") continue;
      const existing = map.get(s.id);
      const teacherName = `${e.teachers?.first_name ?? ""} ${e.teachers?.last_name ?? ""}`.trim();
      const item = {
        teacherId: e.teachers?.id,
        teacherName,
        instrumentId: e.instruments?.id,
        instrumentName: e.instruments?.name,
        schoolId: e.schools?.id,
        schoolName: e.schools?.name,
      };
      if (existing) {
        existing.enrollments.push(item);
      } else {
        map.set(s.id, {
          studentId: s.id,
          firstName: s.first_name,
          lastName: s.last_name,
          nationalId: (s.national_id ?? "").trim(),
          parentPhone: s.parent_phone,
          phone: s.phone,
          previousGrade: e.grade ?? null,
          enrollments: [item],
        });
      }
    }
    return Array.from(map.values()).map((s) => ({
      ...s,
      isGraduated: s.previousGrade === "יב",
      isRegistered: (s.nationalId && registeredNids.has(s.nationalId)) || registeredStudentIds.has(s.studentId),
    }));
  }, [prevEnrollments, registeredNids, registeredStudentIds]);


  const teacherOptions = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s: any) => s.enrollments.forEach((e: any) => e.teacherName && set.add(e.teacherName)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [students]);

  const schoolOptions = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s: any) => s.enrollments.forEach((e: any) => e.schoolName && set.add(e.schoolName)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [students]);

  const instrumentOptions = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s: any) => s.enrollments.forEach((e: any) => e.instrumentName && set.add(e.instrumentName)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "he"));
  }, [students]);

  const filtered = useMemo(() => {
    return students
      .filter((s) => {
        if (statusFilter === "registered" && !s.isRegistered) return false;
        if (statusFilter === "pending" && s.isRegistered) return false;
        if (teacherFilter !== "all" && !s.enrollments.some((e: any) => e.teacherName === teacherFilter)) return false;
        if (schoolFilter !== "all" && !s.enrollments.some((e: any) => e.schoolName === schoolFilter)) return false;
        if (instrumentFilter !== "all" && !s.enrollments.some((e: any) => e.instrumentName === instrumentFilter)) return false;
        if (search) {
          const q = search.toLowerCase().trim();
          const hay = `${s.firstName} ${s.lastName} ${s.nationalId} ${s.parentPhone ?? ""} ${s.phone ?? ""} ${s.enrollments.map((e: any) => `${e.teacherName} ${e.instrumentName} ${e.schoolName}`).join(" ")}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aGrad = a.previousGrade === "יב" ? 1 : 0;
        const bGrad = b.previousGrade === "יב" ? 1 : 0;
        if (aGrad !== bGrad) return aGrad - bGrad;
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "he");
      });
  }, [students, statusFilter, teacherFilter, schoolFilter, instrumentFilter, search]);

  const registeredCount = students.filter((s) => s.isRegistered).length;
  const pendingCount = students.length - registeredCount;

  if (!previousYear) {
    return (
      <div className="rounded-2xl bg-card p-6 text-center text-muted-foreground border border-border shadow-sm">
        לא נמצאה שנת לימודים קודמת להשוואה.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="rounded-2xl bg-card p-4 shadow-sm border border-border space-y-3">
        <div className="text-sm text-center leading-relaxed">
          <span className="text-muted-foreground">מעבר משנת </span>
          <span className="font-semibold">{previousYear.name}</span>
          <span className="text-muted-foreground"> לשנת </span>
          <span className="font-semibold">{activeYear?.name}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setStatusFilter("all")}
            className={`rounded-xl px-3 py-2.5 text-center border transition ${statusFilter === "all" ? "bg-primary/10 border-primary" : "bg-muted/30 border-transparent"}`}
          >
            <div className="text-2xl font-bold">{students.length}</div>
            <div className="text-xs text-muted-foreground">סה״כ</div>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("registered")}
            className={`rounded-xl px-3 py-2.5 text-center border transition ${statusFilter === "registered" ? "bg-emerald-100 dark:bg-emerald-950/40 border-emerald-400" : "bg-emerald-50 dark:bg-emerald-950/20 border-transparent"}`}
          >
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{registeredCount}</div>
            <div className="text-xs text-emerald-700 dark:text-emerald-400">נרשמו</div>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter("pending")}
            className={`rounded-xl px-3 py-2.5 text-center border transition ${statusFilter === "pending" ? "bg-amber-100 dark:bg-amber-950/40 border-amber-400" : "bg-amber-50 dark:bg-amber-950/20 border-transparent"}`}
          >
            <div className="text-2xl font-bold text-amber-700 dark:text-amber-400">{pendingCount}</div>
            <div className="text-xs text-amber-700 dark:text-amber-400">עדיין לא</div>
          </button>
        </div>
      </div>

      {/* Search + filters */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="חיפוש: שם, ת.ז, טלפון, מורה..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pr-9 h-12 rounded-xl"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={teacherFilter} onValueChange={setTeacherFilter}>
          <SelectTrigger className="w-48 h-11 rounded-xl"><SelectValue placeholder="מורה" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל המורים</SelectItem>
            {teacherOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={schoolFilter} onValueChange={setSchoolFilter}>
          <SelectTrigger className="w-44 h-11 rounded-xl"><SelectValue placeholder="שלוחה" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל השלוחות</SelectItem>
            {schoolOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
          <SelectTrigger className="w-44 h-11 rounded-xl"><SelectValue placeholder="כלי" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הכלים</SelectItem>
            {instrumentOptions.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {prevLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">אין תלמידים להצגה</p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">מוצגים {filtered.length} מתוך {students.length}</p>
          {filtered.map((s) => {
            const isGraduated = s.previousGrade === "יב";
            return (
              <button
                key={s.studentId}
                onClick={() => navigate(`/admin/students/${s.studentId}`)}
                className={`w-full flex items-start gap-3 rounded-2xl p-3.5 shadow-sm border text-right transition hover:shadow-md ${
                  isGraduated
                    ? "bg-muted/40 border-border opacity-75"
                    : `bg-card ${s.isRegistered ? "border-emerald-300/60" : "border-amber-300/60"}`
                }`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  isGraduated ? "bg-muted" : s.isRegistered ? "bg-emerald-100 dark:bg-emerald-950/40" : "bg-amber-100 dark:bg-amber-950/40"
                }`}>
                  {isGraduated ? (
                    <GraduationCap className="h-5 w-5 text-muted-foreground" />
                  ) : s.isRegistered ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground text-sm">{s.firstName} {s.lastName}</p>
                    {s.previousGrade && (
                      <span className="text-[11px] text-muted-foreground">({previousYear.name}: כיתה {s.previousGrade})</span>
                    )}
                    {isGraduated && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground border">סיים יב</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    {s.enrollments.map((e: any, i: number) => (
                      <div key={i} className="flex items-center gap-1.5 flex-wrap">
                        <span>{e.instrumentName}</span>
                        {e.teacherName && <><span>·</span><span>{e.teacherName}</span></>}
                        {e.schoolName && <><span>·</span><span>{e.schoolName}</span></>}
                      </div>
                    ))}
                  </div>
                  {s.parentPhone && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-0.5">
                      <Phone className="h-3 w-3" />
                      <PhoneDisplay phone={s.parentPhone} stopPropagation textClassName="text-xs text-muted-foreground" />
                    </div>
                  )}
                </div>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${
                  s.isRegistered
                    ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    : "bg-amber-100 text-amber-700 border border-amber-200"
                }`}>
                  {s.isRegistered ? "נרשם" : "טרם נרשם"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RegistrationStatusTab;
