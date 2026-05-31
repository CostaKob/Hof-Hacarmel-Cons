import { useState, useCallback, useMemo, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { saveListScrollPosition, useListStatePreservation } from "@/hooks/useListStatePreservation";
import AdminLayout from "@/components/admin/AdminLayout";
import { PhoneDisplay } from "@/components/PhoneDisplay";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileSpreadsheet, Users, ListChecks } from "lucide-react";
import StudentImportDialog from "@/components/admin/StudentImportDialog";
import { calcEnrollment } from "@/lib/paymentCalc";

const AdminStudents = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [importOpen, setImportOpen] = useState(false);
  const { selectedYearId, years } = useAcademicYear();
  useListStatePreservation("/admin/students");

  useEffect(() => {
    sessionStorage.setItem("admin-students-return-url", `${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  const selectedYear = years.find((y) => y.id === selectedYearId);

  const search = searchParams.get("q") || "";
  const view = searchParams.get("view") || "enrollments"; // enrollments | all
  const teacherFilter = searchParams.get("teacher") || "all";
  const schoolFilter = searchParams.get("school") || "all";
  const durationFilter = searchParams.get("duration") || "all";
  const cityFilter = searchParams.get("city") || "all";
  const statusFilter = searchParams.get("status") || "active";
  const gradeFilter = searchParams.get("grade") || "all";
  const levelFilter = searchParams.get("level") || "all";
  const paymentFilter = searchParams.get("payment") || "all";

  const setFilter = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === "") next.delete(key);
      else if (key === "status" && value === "active") next.delete(key);
      else if (key === "view" && value === "enrollments") next.delete(key);
      else if (key !== "status" && key !== "view" && value === "all") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-students-enrollments", selectedYearId],
    queryFn: async () => {
      let q = supabase
        .from("enrollments")
        .select("id, lesson_duration_minutes, is_active, academic_year_id, grade, start_date, price_per_lesson, total_lessons_allocated, students(id, first_name, last_name, city, is_active, grade, playing_level, student_status, national_id, parent_name, parent_phone, phone, is_major_student), teachers(id, first_name, last_name), schools(id, name), instruments(id, name)")
        .order("created_at", { ascending: false });
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]).sort((a: any, b: any) => {
        const nameA = `${a.students?.last_name ?? ""} ${a.students?.first_name ?? ""}`;
        const nameB = `${b.students?.last_name ?? ""} ${b.students?.first_name ?? ""}`;
        return nameA.localeCompare(nameB, "he");
      });
    },
  });

  const { data: yearPayments = [] } = useQuery({
    queryKey: ["admin-year-payments", selectedYearId],
    queryFn: async () => {
      if (!selectedYearId) return [];
      const { data, error } = await supabase
        .from("student_payments")
        .select("student_id, enrollment_id, amount, transaction_type, payment_status, payment_date, created_at, enrollment_breakdown")
        .eq("academic_year_id", selectedYearId)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedYearId,
  });

  const { data: paymentSettings } = useQuery({
    queryKey: ["admin-students-payment-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_settings" as any).select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: yearFull } = useQuery({
    queryKey: ["admin-students-year-billing", selectedYearId],
    enabled: !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("*").eq("id", selectedYearId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const enrollmentRowsByStudent = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of rows as any[]) {
      const sid = r?.students?.id;
      if (!sid || !r.is_active) continue;
      map.set(sid, [...(map.get(sid) ?? []), r]);
    }
    return map;
  }, [rows]);

  const getSavedDiscountState = useCallback((sid: string) => {
    const fromPayment = (yearPayments as any[]).find((p) => {
      const br = p?.enrollment_breakdown;
      return p.student_id === sid && br && !Array.isArray(br) && br.discounts && p.payment_status === "pending";
    }) ?? (yearPayments as any[]).find((p) => {
      const br = p?.enrollment_breakdown;
      return br && !Array.isArray(br) && br.discounts && p.student_id === sid;
    });

    let saved: any = null;
    if (selectedYearId && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(`payment-calc-discounts:${sid}:${selectedYearId}`);
        saved = raw ? JSON.parse(raw) : null;
      } catch { /* ignore malformed local state */ }
    }

    const paymentDiscounts = fromPayment?.enrollment_breakdown?.discounts;
    return saved ?? paymentDiscounts ?? null;
  }, [selectedYearId, yearPayments]);

  // Net paid summed at student level (paid/credit only; pending links do not reduce debt)
  const paidByStudent = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of yearPayments as any[]) {
      if (!p.student_id) continue;
      if (p.payment_status === "pending" || p.payment_status === "failed") continue;
      const amount = Number(p.amount || 0);
      const netAmount = amount < 0
        ? amount
        : p.transaction_type === "credit"
          ? -Math.abs(amount)
          : amount;
      map.set(p.student_id, (map.get(p.student_id) ?? 0) + netAmount);
    }
    return map;
  }, [yearPayments]);

  const balanceByStudent = useMemo(() => {
    const map = new Map<string, number>();
    if (!paymentSettings || !yearFull) return map;
    const prices = paymentSettings.lesson_prices ?? {};
    const rates = {
      sibling: Number(yearFull.discount_sibling_pct ?? 0),
      secondInstrument: Number(yearFull.discount_second_instrument_pct ?? 0),
      majorStudent: Number(yearFull.discount_major_student_pct ?? 0),
    };

    for (const [sid, studentRows] of enrollmentRowsByStudent.entries()) {
      const discounts = getSavedDiscountState(sid);
      const startDateOverrides = discounts?.startDateOverrides && typeof discounts.startDateOverrides === "object" ? discounts.startDateOverrides : {};
      const calcRows = studentRows.map((e: any) => calcEnrollment(
        {
          id: e.id,
          duration: e.lesson_duration_minutes,
          startDate: startDateOverrides[e.id] ?? e.start_date,
          pricePerLessonOverride: e.price_per_lesson,
          instrumentName: e.instruments?.name,
          schoolName: e.schools?.name,
          teacherName: e.teachers ? `${e.teachers.first_name} ${e.teachers.last_name}` : null,
        },
        prices,
        yearFull.start_date,
        yearFull.end_date,
      ));

      const proratedTotal = calcRows.reduce((sum, r) => sum + r.prorated, 0);
      const sibling = !!discounts?.sibling;
      const secondInstrument = !!discounts?.secondInstrument;
      const majorStudent = discounts && typeof discounts.majorStudent === "boolean" ? discounts.majorStudent : !!studentRows[0]?.students?.is_major_student;
      const secondInstrumentEnrollmentId = secondInstrument && calcRows.length >= 2
        ? [...calcRows].sort((a, b) => a.prorated - b.prorated)[0].enrollmentId
        : null;
      const afterStdDiscount = calcRows.reduce((sum, r) => {
        const pct = (sibling ? rates.sibling : 0)
          + (majorStudent ? rates.majorStudent : 0)
          + (r.enrollmentId === secondInstrumentEnrollmentId ? rates.secondInstrument : 0);
        return sum + Math.round(r.prorated * (1 - pct / 100));
      }, 0);
      const customDiscountAmount = (Array.isArray(discounts?.customDiscounts) ? discounts.customDiscounts : []).reduce((sum: number, c: any) => {
        const v = Number(c.value) || 0;
        return sum + (c.mode === "pct" ? (afterStdDiscount * v) / 100 : v);
      }, 0);
      const totalDue = Math.max(0, Math.round(afterStdDiscount - customDiscountAmount));
      const paid = paidByStudent.get(sid) ?? 0;
      map.set(sid, totalDue - paid);

      if (proratedTotal <= 0 && paid <= 0) {
        map.set(sid, 0);
      }
    }
    return map;
  }, [paymentSettings, yearFull, enrollmentRowsByStudent, getSavedDiscountState, paidByStudent]);

  // Returns "full" | "partial" | "unpaid"
  // Connected to the same calculated balance used in the payment summary screen.
  const getPaymentStatus = useCallback((r: any): "full" | "partial" | "unpaid" => {
    const sid = r?.students?.id;
    const stuPaid = sid ? (paidByStudent.get(sid) ?? 0) : 0;
    const balance = sid ? balanceByStudent.get(sid) : null;
    if (typeof balance === "number") {
      if (Math.round(balance) <= 0) return "full";
      return stuPaid > 0.5 ? "partial" : "unpaid";
    }
    if (stuPaid > 0.5) return "partial";
    return "unpaid";
  }, [paidByStudent, balanceByStudent]);

  const getPaymentBalance = useCallback((r: any) => {
    const sid = r?.students?.id;
    const balance = sid ? balanceByStudent.get(sid) : null;
    return typeof balance === "number" ? Math.max(0, Math.round(balance)) : null;
  }, [balanceByStudent]);

  // All-students view: raw students table (independent of enrollments)
  const { data: allStudents = [], isLoading: loadingAll } = useQuery({
    queryKey: ["admin-all-students-raw"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, national_id, phone, parent_name, parent_phone, city, grade, student_status, is_active, created_at");
      if (error) throw error;
      return (data ?? []).sort((a: any, b: any) =>
        `${a.last_name ?? ""} ${a.first_name ?? ""}`.localeCompare(`${b.last_name ?? ""} ${b.first_name ?? ""}`, "he")
      );
    },
  });

  const activeStudentsCount = allStudents.filter((s: any) => s.is_active && s.student_status !== "הפסיק").length;

  const filteredAll = allStudents.filter((s: any) => {
    if (search) {
      const normalize = (str: string) => (str ?? "").toLowerCase().replace(/['"׳״']/g, "").trim();
      const q = normalize(search);
      const haystack = normalize(`${s.first_name ?? ""} ${s.last_name ?? ""} ${s.national_id ?? ""} ${s.parent_name ?? ""} ${s.parent_phone ?? ""} ${s.phone ?? ""} ${s.city ?? ""} ${s.grade ?? ""}`);
      if (!haystack.includes(q)) return false;
    }
    if (cityFilter !== "all" && s.city !== cityFilter) return false;
    if (gradeFilter !== "all") {
      const stripMarks = (str: string) => (str ?? "").replace(/['"׳״']/g, "").trim();
      if (stripMarks(s.grade ?? "") !== stripMarks(gradeFilter)) return false;
    }
    if (statusFilter === "active" && (!s.is_active || s.student_status === "הפסיק")) return false;
    if (statusFilter === "stopped" && s.is_active && s.student_status !== "הפסיק") return false;
    return true;
  });

  const { data: allTeachers = [] } = useQuery({
    queryKey: ["admin-students-all-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, first_name, last_name")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const teachers = [...allTeachers].sort((a: any, b: any) =>
    `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "he")
  );
  const schools = [...new Map(rows.map((r: any) => [r.schools?.id, r.schools] as [string, any]).filter(([id]) => id)).values()]
    .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? "", "he"));
  const cities = [...new Set(rows.map((r: any) => r.students?.city).filter(Boolean))].sort((a, b) => (a as string).localeCompare(b as string, "he"));
  const durations = [...new Set(rows.map((r: any) => r.lesson_duration_minutes))].sort((a, b) => a - b);

  const filtered = rows.filter((r: any) => {
    if (search) {
      const normalize = (s: string) => s.toLowerCase().replace(/['"׳״']/g, "").trim();
      const q = normalize(search);
      const searchStr = normalize(`${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""} ${r.students?.national_id ?? ""} ${r.students?.parent_name ?? ""} ${r.students?.parent_phone ?? ""} ${r.students?.phone ?? ""} ${r.grade ?? ""} ${r.students?.grade ?? ""} ${r.students?.city ?? ""} ${r.teachers?.first_name ?? ""} ${r.teachers?.last_name ?? ""} ${r.schools?.name ?? ""} ${r.instruments?.name ?? ""} ${r.students?.playing_level ?? ""} ${r.lesson_duration_minutes ?? ""}`);
      if (!searchStr.includes(q)) return false;
    }
    if (teacherFilter !== "all" && r.teachers?.id !== teacherFilter) return false;
    if (schoolFilter !== "all" && r.schools?.id !== schoolFilter) return false;
    if (durationFilter !== "all" && String(r.lesson_duration_minutes) !== durationFilter) return false;
    if (cityFilter !== "all" && r.students?.city !== cityFilter) return false;
    if (gradeFilter !== "all") {
      const stripMarks = (s: string) => (s ?? "").replace(/['"׳״']/g, "").trim();
      const rowGrade = stripMarks(r.students?.grade ?? "");
      if (rowGrade !== stripMarks(gradeFilter)) return false;
    }
    if (levelFilter !== "all" && r.students?.playing_level !== levelFilter) return false;
    if (statusFilter === "active" && (!r.is_active || r.students?.student_status === "הפסיק")) return false;
    if (statusFilter === "stopped" && (r.is_active && r.students?.student_status !== "הפסיק")) return false;
    if (paymentFilter !== "all" && getPaymentStatus(r) !== paymentFilter) return false;
    return true;
  });

  return (
    <AdminLayout title="תלמידים" backPath="/admin">
      {/* Search + New */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש: שם, ת.ז, הורה, טלפון, מורה, שלוחה, עיר, כלי..."
            value={search}
            onChange={(e) => setFilter("q", e.target.value)}
            className="pr-9 h-12 rounded-xl"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-12 rounded-xl text-base" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            ייבוא מאקסל
          </Button>
          <Button className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/students/new")}>
            <Plus className="h-4 w-4" />
            תלמיד חדש
          </Button>
        </div>
      </div>

      {/* View toggle */}
      <div className="mb-4 inline-flex rounded-xl border border-border bg-card p-1 shadow-sm">
        <button
          onClick={() => setFilter("view", "enrollments")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === "enrollments" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ListChecks className="h-4 w-4" />
          לפי שיוכים
        </button>
        <button
          onClick={() => setFilter("view", "all")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === "all" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Users className="h-4 w-4" />
          כל התלמידים
          <Badge variant="secondary" className="rounded-md text-[10px] px-1.5 py-0 ml-1">
            {activeStudentsCount} פעילים
          </Badge>
        </button>
      </div>

      <StudentImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {view === "enrollments" && (
          <>
            <Select value={teacherFilter} onValueChange={(v) => setFilter("teacher", v)}>
              <SelectTrigger className="w-40 h-11 rounded-xl"><SelectValue placeholder="מורים" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">מורים</SelectItem>
                {(teachers as any[]).map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={schoolFilter} onValueChange={(v) => setFilter("school", v)}>
              <SelectTrigger className="w-40 h-11 rounded-xl"><SelectValue placeholder="בתי ספר" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">בתי ספר</SelectItem>
                {(schools as any[]).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={durationFilter} onValueChange={(v) => setFilter("duration", v)}>
              <SelectTrigger className="w-36 h-11 rounded-xl"><SelectValue placeholder="משך שיעור" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">משך שיעור</SelectItem>
                {durations.map((d) => (
                  <SelectItem key={d} value={String(d)}>{d} דק׳</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}

        <Select value={cityFilter} onValueChange={(v) => setFilter("city", v)}>
          <SelectTrigger className="w-36 h-11 rounded-xl"><SelectValue placeholder="עיר מגורים" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">עיר מגורים</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c as string} value={c as string}>{c as string}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setFilter("status", v)}>
          <SelectTrigger className="w-32 h-11 rounded-xl"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">פעילים</SelectItem>
            <SelectItem value="all">סטטוס</SelectItem>
            <SelectItem value="stopped">הפסיקו</SelectItem>
          </SelectContent>
        </Select>

        <Select value={gradeFilter} onValueChange={(v) => setFilter("grade", v)}>
          <SelectTrigger className="w-32 h-11 rounded-xl"><SelectValue placeholder="כיתה" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כיתה</SelectItem>
            {["א'","ב'","ג'","ד'","ה'","ו'","ז'","ח'","ט'","י'","י\"א","י\"ב","בוגר"].map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {view === "enrollments" && (
          <>
            <Select value={levelFilter} onValueChange={(v) => setFilter("level", v)}>
              <SelectTrigger className="w-32 h-11 rounded-xl"><SelectValue placeholder="רמת לימוד" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">רמת לימוד</SelectItem>
                {["א","ב","ג"].map((l) => (
                  <SelectItem key={l} value={l}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={paymentFilter} onValueChange={(v) => setFilter("payment", v)}>
              <SelectTrigger className="w-36 h-11 rounded-xl"><SelectValue placeholder="תשלומים" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">תשלומים</SelectItem>
                <SelectItem value="full">שולם במלואו</SelectItem>
                <SelectItem value="partial">שולם חלקית</SelectItem>
                <SelectItem value="unpaid">לא שולם</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>

      {/* Card-based list */}
      {view === "all" ? (
        loadingAll ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filteredAll.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">לא נמצאו תלמידים</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-2">
              {filteredAll.length} תלמידים · {activeStudentsCount} פעילים בסך הכול
            </p>
            <div className="space-y-2">
              {filteredAll.map((s: any, index: number) => {
                const stopped = !s.is_active || s.student_status === "הפסיק";
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      saveListScrollPosition("/admin/students");
                      navigate(`/admin/students/${s.id}`, {
                        state: { returnTo: `${location.pathname}${location.search}` },
                      });
                    }}
                    className={`flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99] ${stopped ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">{index + 1}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground">
                          {s.first_name} {s.last_name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                          {s.national_id && <span>ת.ז {s.national_id}</span>}
                          {s.grade && (<><span>·</span><span>כיתה {s.grade}</span></>)}
                          {s.city && (<><span>·</span><span>{s.city}</span></>)}
                          {s.parent_phone && (<><span>·</span><PhoneDisplay phone={s.parent_phone} stopPropagation textClassName="text-sm text-muted-foreground" /></>)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mr-3 shrink-0">
                      <Badge variant={stopped ? "outline" : "default"} className={`rounded-lg ${stopped ? "text-destructive border-destructive" : ""}`}>
                        {stopped ? (s.student_status === "הפסיק" ? "הפסיק" : "לא פעיל") : "פעיל"}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )
      ) : isLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {rows.length === 0 && selectedYear
            ? `אין נתונים לשנת ${selectedYear.name}`
            : "לא נמצאו תלמידים"}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-2">{filtered.length} תלמידים</p>
          <div className="space-y-2">
            {filtered.map((r: any, index: number) => {
              const payStatus = getPaymentStatus(r);
              const payBalance = getPaymentBalance(r);
              const payLabel = payStatus === "full"
                ? "שולם"
                : payStatus === "partial"
                ? `שולם חלקית${payBalance ? ` · יתרה ₪${payBalance.toLocaleString()}` : ""}`
                : payBalance ? `לא שולם · יתרה ₪${payBalance.toLocaleString()}` : "לא שולם";
              const payClass = payStatus === "full"
                ? "bg-green-500/10 text-green-700 border-green-500/30"
                : payStatus === "partial"
                ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
                : "bg-destructive/10 text-destructive border-destructive/30";
              return (
                <div
                  key={r.id}
                  onClick={() => {
                    saveListScrollPosition("/admin/students");
                    navigate(`/admin/students/${r.students?.id}`, {
                      state: { returnTo: `${location.pathname}${location.search}` },
                    });
                  }}
                  className={`flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99] ${!r.students?.is_active ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">
                        {r.students?.first_name} {r.students?.last_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                        <span>{r.instruments?.name}</span>
                        <span>·</span>
                        <span>{r.schools?.name}</span>
                        <span>·</span>
                        <span>{r.lesson_duration_minutes} דק׳</span>
                        {r.teachers && (
                          <>
                            <span>·</span>
                            <span>{r.teachers.first_name} {r.teachers.last_name}</span>
                          </>
                        )}
                        {(r.grade ?? r.students?.grade) && (
                          <>
                            <span>·</span>
                            <span className={r.students?.grade === "יב" || r.students?.grade === "בוגר" ? "font-bold text-amber-600 dark:text-amber-400" : ""}>
                              כיתה {r.students?.grade}
                            </span>
                            {r.grade && r.grade !== r.students?.grade && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600 dark:text-amber-400">
                                שיוך: {r.grade}
                              </Badge>
                            )}
                          </>
                        )}
                        {r.students?.playing_level && (
                          <>
                            <span>·</span>
                            <span>רמה {r.students.playing_level}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mr-3 shrink-0">
                    <Badge
                      variant="outline"
                      className={`rounded-lg text-xs ${payClass}`}
                    >
                      {payLabel}
                    </Badge>
                    <Badge variant={(!r.is_active || r.students?.student_status === "הפסיק") ? "outline" : "default"} className={`rounded-lg ${(!r.is_active || r.students?.student_status === "הפסיק") ? "text-destructive border-destructive" : ""}`}>
                      {!r.is_active ? "רישום לא פעיל" : r.students?.student_status === "הפסיק" ? "הפסיק" : "פעיל"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminStudents;
