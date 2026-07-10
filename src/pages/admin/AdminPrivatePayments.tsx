import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { calcEnrollment } from "@/lib/paymentCalc";
import { computeStandardDiscounts, type DiscountType } from "@/lib/discounts";
import { PhoneDisplay } from "@/components/PhoneDisplay";

const ALL = "__all__";

type StatusFilter = "all" | "unpaid" | "partial" | "paid" | "uncalculated";

const AdminPrivatePayments = () => {
  const navigate = useNavigate();
  const { selectedYearId, activeYear } = useAcademicYear();
  const yearId = selectedYearId ?? activeYear?.id;

  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState<string>(ALL);
  const [teacherFilter, setTeacherFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data: year } = useQuery({
    queryKey: ["priv-payments-year", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("*").eq("id", yearId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_settings" as any).select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: discountTypes = [] } = useQuery({
    queryKey: ["discount-types", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_types" as any)
        .select("*")
        .eq("academic_year_id", yearId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data as any[]) as DiscountType[];
    },
  });

  const { data: enrollments = [], isLoading: loadingEnr } = useQuery({
    queryKey: ["priv-payments-enrollments", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, lesson_duration_minutes, start_date, end_date, price_per_lesson, is_active, instruments(name), schools(id,name), teachers(id, first_name, last_name), students!inner(id, first_name, last_name, grade, parent_name, parent_phone, has_music_production_course, has_recital_track, student_status, is_active)")
        .eq("academic_year_id", yearId!);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: specialStudents = [] } = useQuery({
    queryKey: ["priv-payments-special-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, grade, parent_name, parent_phone, has_music_production_course, has_recital_track, is_active")
        .or("has_music_production_course.eq.true,has_recital_track.eq.true");
      if (error) throw error;
      return data as any[];
    },
  });



  const { data: payments = [] } = useQuery({
    queryKey: ["priv-payments-rows", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_payments")
        .select("id, student_id, enrollment_id, amount, transaction_type, payment_status, enrollment_breakdown, created_at")
        .eq("academic_year_id", yearId!);
      if (error) throw error;
      return data as any[];
    },
  });

  const rows = useMemo(() => {
    if (!year || !settings) return [];
    const prices = settings.lesson_prices ?? {};
    const musicProdPrice = Number(settings.music_production_price) || 0;
    const recitalPrice = Number(settings.recital_track_price) || 0;

    // Group enrollments by student
    const byStudent = new Map<string, any[]>();
    for (const e of enrollments) {
      const arr = byStudent.get(e.student_id) ?? [];
      arr.push(e);
      byStudent.set(e.student_id, arr);
    }

    // Group payments by student — resolve student_id via enrollment if missing
    const enrollmentToStudent = new Map<string, string>();
    for (const e of enrollments) enrollmentToStudent.set(e.id, e.student_id);

    const paymentsByStudent = new Map<string, any[]>();
    const paymentsForStudent = (sid: string) => paymentsByStudent.get(sid) ?? [];
    for (const p of payments) {
      const sid = p.student_id ?? (p.enrollment_id ? enrollmentToStudent.get(p.enrollment_id) : null);
      if (!sid) continue;
      const arr = paymentsByStudent.get(sid) ?? [];
      arr.push(p);
      paymentsByStudent.set(sid, arr);
    }

    const result: any[] = [];


    for (const [studentId, enrList] of byStudent.entries()) {
      const student = enrList[0].students;
      if (!student) continue;

      const stuPayments = paymentsForStudent(studentId);
      const pendingSrc = stuPayments.find((p) => p.payment_status === "pending");
      const paidWithBreakdown = stuPayments.find((p) => {
        if (p.payment_status === "pending") return false;
        const br = p?.enrollment_breakdown;
        return br && !Array.isArray(br) && br.discounts;
      });
      const source = pendingSrc ?? paidWithBreakdown;
      const hasSource = !!source;

      let totalDue = 0;
      let paid = 0;
      let balance = 0;
      let status: StatusFilter = "uncalculated";
      let specialRevenue = 0;
      let proratedTotal = 0;

      if (hasSource) {
        const brDiscounts: any = source.enrollment_breakdown && !Array.isArray(source.enrollment_breakdown)
          ? source.enrollment_breakdown.discounts ?? {}
          : {};

        const selectedDiscountIds: string[] = Array.isArray(brDiscounts.selectedDiscountIds)
          ? brDiscounts.selectedDiscountIds
          : [];
        const legacyMap: Record<string, string> = { sibling: "sibling", secondInstrument: "second_instrument", majorStudent: "major_student" };
        const idSet = new Set<string>(selectedDiscountIds);
        for (const k of Object.keys(legacyMap)) {
          if (brDiscounts[k] === true) {
            const dt = discountTypes.find((d) => d.legacy_key === legacyMap[k]);
            if (dt) idSet.add(dt.id);
          }
        }

        const selectedDiscounts = discountTypes.filter((d) => idSet.has(d.id));
        const customDiscounts = Array.isArray(brDiscounts.customDiscounts) ? brDiscounts.customDiscounts : [];
        const startDateOverrides = brDiscounts.startDateOverrides && typeof brDiscounts.startDateOverrides === "object"
          ? brDiscounts.startDateOverrides
          : {};

        const calcRows = enrList.map((e) =>
          calcEnrollment(
            {
              id: e.id,
              duration: e.lesson_duration_minutes,
              startDate: startDateOverrides[e.id] ?? e.start_date,
              endDate: e.end_date,
              pricePerLessonOverride: e.price_per_lesson,
            },
            prices,
            year.start_date,
            year.end_date
          )
        );

        proratedTotal = calcRows.reduce((s, r) => s + r.prorated, 0);
        const stdCompute = computeStandardDiscounts(
          calcRows.map((r) => ({ enrollmentId: r.enrollmentId, prorated: r.prorated })),
          selectedDiscounts,
        );

        const specialBase =
          (student.has_music_production_course ? musicProdPrice : 0) +
          (student.has_recital_track ? recitalPrice : 0);
        const specialAfterStd = specialBase;

        const afterStdDiscount = stdCompute.afterStdDiscount + specialAfterStd;
        const customDiscountAmount = customDiscounts.reduce((sum: number, c: any) => {
          const v = Number(c.value) || 0;
          if (c.mode === "pct") return sum + (afterStdDiscount * v) / 100;
          return sum + v;
        }, 0);
        totalDue = Math.max(0, Math.round((afterStdDiscount - customDiscountAmount) * 100) / 100);

        let paidAmt = 0, credit = 0, net = 0;
        for (const p of stuPayments) {
          if (p.payment_status === "pending") continue;
          const amount = Number(p.amount || 0);
          if (amount < 0) { credit += Math.abs(amount); net += amount; }
          else if (p.transaction_type === "payment") { paidAmt += amount; net += amount; }
          else { credit += amount; net -= amount; }
        }
        paid = net;
        balance = Math.round((totalDue - net) * 100) / 100;

        if (totalDue > 0 && balance <= 0.01) status = "paid";
        else if (net > 0 && balance > 0.01) status = "partial";
        else status = "unpaid";

        specialRevenue = specialAfterStd;
      }

      result.push({
        studentId,
        student,
        enrollments: enrList,
        totalDue,
        paid,
        balance,
        status,
        hasSpecialCourse: (student.has_music_production_course || student.has_recital_track),
        specialRevenue,
        proratedTotal,
        hasSource,
      });
    }

    // Special-track-only students without a payment link are intentionally omitted —
    // report shows exact numbers from payment links only.


    return result.sort((a, b) => `${a.student.first_name} ${a.student.last_name}`.localeCompare(`${b.student.first_name} ${b.student.last_name}`, "he"));
  }, [enrollments, payments, year, settings, discountTypes, specialStudents]);


  const schoolOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of enrollments) if (e.schools?.id) m.set(e.schools.id, e.schools.name);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "he"));
  }, [enrollments]);

  const teacherOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of enrollments) if (e.teachers?.id) m.set(e.teachers.id, `${e.teachers.first_name} ${e.teachers.last_name}`);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "he"));
  }, [enrollments]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (schoolFilter !== ALL && !r.enrollments.some((e: any) => e.schools?.id === schoolFilter)) return false;
      if (teacherFilter !== ALL && !r.enrollments.some((e: any) => e.teachers?.id === teacherFilter)) return false;
      if (search) {
        const q = search.toLowerCase().trim();
        const hay = `${r.student.first_name} ${r.student.last_name} ${r.student.parent_name ?? ""} ${r.student.parent_phone ?? ""} ${r.student.grade ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, schoolFilter, teacherFilter, search]);

  const calculatedRows = useMemo(() => filtered.filter((r) => r.hasSource), [filtered]);

  const totals = useMemo(() => {
    let potential = 0, paid = 0, balance = 0, enrollmentsCount = 0, specialRevenue = 0, specialCount = 0;
    let productionRevenue = 0, recitalRevenue = 0, productionCount = 0, recitalCount = 0;
    const musicProdPrice = Number(settings?.music_production_price || 0);
    const recitalPrice = Number(settings?.recital_track_price || 0);
    for (const r of filtered) {
      enrollmentsCount += r.enrollments.length;
      if (r.hasSpecialCourse) { specialCount += 1; }
      if (r.student.has_music_production_course) { productionCount += 1; }
      if (r.student.has_recital_track) { recitalCount += 1; }
      if (!r.hasSource) continue;
      potential += r.totalDue;
      paid += Math.max(0, r.paid);
      balance += Math.max(0, r.balance);
      if (r.hasSpecialCourse) { specialRevenue += r.specialRevenue ?? 0; }
      if (r.student.has_music_production_course) { productionRevenue += musicProdPrice; }
      if (r.student.has_recital_track) { recitalRevenue += recitalPrice; }
    }
    return { potential, paid, balance, studentsCount: filtered.length, enrollmentsCount, specialRevenue, specialCount, productionRevenue, recitalRevenue, productionCount, recitalCount };
  }, [filtered, settings]);



  const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");

  return (
    <AdminLayout title="תשלומים — שיעורים פרטניים" backPath="/admin">
      <PageTitle title="דוח תשלומים פרטני" />
      <div className="space-y-4">

        {/* Counts */}
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span><span className="font-semibold text-foreground">{totals.studentsCount}</span> תלמידים</span>
          <span><span className="font-semibold text-foreground">{totals.enrollmentsCount}</span> שיוכים</span>
          <span><span className="font-semibold text-foreground">{totals.specialCount}</span> במסלולים מיוחדים</span>
        </div>


        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 sm:col-span-2">
            <div className="grid grid-cols-2 divide-x divide-border rtl:divide-x-reverse">
              <div className="px-2 py-1 text-center">
                <p className="text-xs text-muted-foreground">פרטני</p>
                <p className="text-xl font-bold text-foreground">{fmt(totals.potential - totals.specialRevenue)} ₪</p>
              </div>
              <div className="px-2 py-1 text-center">
                <p className="text-xs text-muted-foreground">מסלולים מיוחדים</p>
                <p className="text-xl font-bold text-foreground">{fmt(totals.specialRevenue)} ₪</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  🎚️ הפקה ({totals.productionCount}) {fmt(totals.productionRevenue)} ₪ · 🎼 רסיטל ({totals.recitalCount}) {fmt(totals.recitalRevenue)} ₪
                </p>
              </div>
            </div>
            <div className="mt-3 border-t border-border pt-3 text-center">
              <p className="text-xs text-muted-foreground">סה"כ פוטנציאל הכנסות</p>
              <p className="text-2xl font-bold text-foreground">{fmt(totals.potential)} ₪</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">סה"כ שולם</p>
            <p className="text-2xl font-bold text-green-600">{fmt(totals.paid)} ₪</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">יתרה לגבייה</p>
            <p className="text-2xl font-bold text-amber-600">{fmt(totals.balance)} ₪</p>
          </div>
        </div>


        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש שם תלמיד, הורה, טלפון..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 h-11 rounded-xl"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-full sm:w-40 h-11 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              <SelectItem value="unpaid">לא שולם</SelectItem>
              <SelectItem value="partial">שולם חלקית</SelectItem>
              <SelectItem value="paid">שולם במלואו</SelectItem>
            </SelectContent>
          </Select>
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger className="w-full sm:w-48 h-11 rounded-xl"><SelectValue placeholder="שלוחה" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל השלוחות</SelectItem>
              {schoolOptions.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger className="w-full sm:w-48 h-11 rounded-xl"><SelectValue placeholder="מורה" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל המורים</SelectItem>
              {teacherOptions.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {loadingEnr ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">לא נמצאו תלמידים</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r, idx) => {
              const statusBadge =
                r.status === "paid" ? { label: "שולם", variant: "default" as const } :
                r.status === "partial" ? { label: "שולם חלקית", variant: "secondary" as const } :
                { label: "לא שולם", variant: "outline" as const };
              return (
                <div
                  key={r.studentId}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => navigate(`/admin/students/${r.studentId}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-muted-foreground font-mono">{idx + 1}.</span>
                        <p className="font-semibold text-foreground">{r.student.first_name} {r.student.last_name}</p>
                        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                        {r.student.grade && <span className="text-xs text-muted-foreground">כיתה {r.student.grade}</span>}
                      </div>

                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                        {r.student.parent_name && <span>הורה: {r.student.parent_name}</span>}
                        {r.student.parent_phone && <PhoneDisplay phone={r.student.parent_phone} />}
                      </div>
                      <div className="mt-2 flex flex-col gap-0.5">
                        {r.enrollments.map((e: any) => (
                          <div key={e.id} className="text-sm text-foreground">
                            <span className="text-muted-foreground">•</span>{" "}
                            {e.instruments?.name ?? "—"}
                            {e.teachers && <span className="text-muted-foreground"> · {e.teachers.first_name} {e.teachers.last_name}</span>}
                            {e.schools?.name && <span className="text-muted-foreground"> · {e.schools.name}</span>}
                            {e.lesson_duration_minutes && <span className="text-muted-foreground"> · {e.lesson_duration_minutes} דק׳</span>}
                          </div>
                        ))}
                        {r.hasSpecialCourse && (
                          <div className="text-sm text-foreground">
                            <span className="text-muted-foreground">•</span>{" "}
                            {r.student.has_music_production_course && "🎚️ הפקה מוסיקלית"}
                            {r.student.has_music_production_course && r.student.has_recital_track && " · "}
                            {r.student.has_recital_track && "🎼 מסלול רסיטל"}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-left shrink-0 space-y-0.5">
                      <div>
                        <p className="text-[10px] text-muted-foreground">פוטנציאל</p>
                        <p className="text-lg font-bold text-foreground leading-tight">{fmt(r.totalDue)} ₪</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">שולם</p>
                        <p className="text-sm font-semibold text-green-600 leading-tight">{fmt(Math.max(0, r.paid))} ₪</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">יתרה</p>
                        <p className={`text-sm font-semibold leading-tight ${r.balance > 0.01 ? "text-amber-600" : "text-muted-foreground"}`}>{fmt(Math.max(0, r.balance))} ₪</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center pt-2">
          מציג {filtered.length} תלמידים · הפוטנציאל מחושב לפי מחירון השיעורים והנחות שנשמרו בקישור התשלום האחרון של כל תלמיד
        </p>
      </div>
    </AdminLayout>
  );
};

export default AdminPrivatePayments;
