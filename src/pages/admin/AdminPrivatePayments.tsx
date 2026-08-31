import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Search, Download, Undo2, Link2, Users, User, Clock, RefreshCw } from "lucide-react";


import { useAcademicYear } from "@/hooks/useAcademicYear";
import { calcEnrollment } from "@/lib/paymentCalc";
import { computeStandardDiscounts, type DiscountType } from "@/lib/discounts";
import { formatPaymentMethodWithCount, summarizePaymentMethods } from "@/lib/paymentMethodLabel";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import { allocatePayment } from "@/lib/familyPaymentAllocation";
import { saveListScrollPosition, usePersistedState } from "@/hooks/useListStatePreservation";


const ALL = "__all__";

type StatusFilter = "all" | "unpaid" | "partial" | "paid" | "refunded" | "active_links";
type ViewMode = "students" | "families";

const AdminPrivatePayments = () => {
  const navigate = useNavigate();
  const { selectedYearId, activeYear } = useAcademicYear();
  const yearId = selectedYearId ?? activeYear?.id;

  const routeKey = "/admin/private-payments";
  const [search, setSearch] = usePersistedState(routeKey, "search", "");
  const [schoolFilter, setSchoolFilter] = usePersistedState<string>(routeKey, "school", ALL);
  const [teacherFilter, setTeacherFilter] = usePersistedState<string>(routeKey, "teacher", ALL);
  const [instrumentFilter, setInstrumentFilter] = usePersistedState<string>(routeKey, "instrument", ALL);
  const [statusFilter, setStatusFilter] = usePersistedState<StatusFilter>(routeKey, "status", "all");
  const [viewMode, setViewMode] = usePersistedState<ViewMode>(routeKey, "view", "families");
  const [showRecentPayments, setShowRecentPayments] = usePersistedState(routeKey, "recent", false);
  const [reconciling, setReconciling] = useState(false);

  // Safety net: pulls receipts from iCount and closes pending payment links
  // whose payment did go through but whose IPN never reached us.
  const runReconcile = async () => {
    setReconciling(true);
    try {
      const { data, error } = await supabase.functions.invoke("icount-reconcile-payments", {
        body: { dryRun: false },
      });
      if (error) throw error;
      const matched = (data as any)?.matched?.length ?? 0;
      toast.success(matched > 0
        ? `נסגרו ${matched} תשלומים שהתקבלו ולא נרשמו`
        : "לא נמצאו תשלומים חסרים — הכל מסונכרן");
      if (matched > 0) window.location.reload();
    } catch (e: any) {
      toast.error(e?.message ?? "הסנכרון נכשל");
    } finally {
      setReconciling(false);
    }
  };




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
        .select("id, student_id, lesson_duration_minutes, start_date, end_date, price_per_lesson, is_active, instruments(id,name), schools(id,name), teachers(id, first_name, last_name), students!inner(id, first_name, last_name, grade, parent_name, parent_phone, parent_national_id, parent_national_id_2, parent_1_id, parent_2_id, has_music_production_course, has_recital_track, student_status, is_active)")
        .eq("academic_year_id", yearId!);
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
        .select("id, refund_of_payment_id, student_id, enrollment_id, amount, transaction_type, payment_status, payment_method, installments, payment_group_id, enrollment_breakdown, created_at, paid_at, payment_date, icount_doc_number")
        .eq("academic_year_id", yearId!);
      if (error) throw error;
      // Ignore the 9-shekel test transaction (documents 1113/1114)
      return (data as any[]).filter((p) => !["1113", "1114"].includes(p.icount_doc_number));
    },
  });


  // A family payment link is stored as one row on the "anchor" child even when
  // its line items cover several siblings. Split such rows into per-child
  // shares so every sibling is credited with what was actually paid for them.
  const allocatedPayments = useMemo(() => {
    const studentsById = new Map<string, any>();
    for (const e of enrollments as any[]) {
      if (e.students?.id) studentsById.set(e.students.id, e.students);
    }
    const familyByNid = new Map<string, any[]>();
    for (const s of studentsById.values()) {
      const nid = (s.parent_national_id || "").trim();
      if (!nid) continue;
      const arr = familyByNid.get(nid) ?? [];
      arr.push(s);
      familyByNid.set(nid, arr);
    }
    const out: any[] = [];
    for (const p of payments as any[]) {
      const anchor = p.student_id ? studentsById.get(p.student_id) : null;
      const sibs = anchor
        ? (familyByNid.get((anchor.parent_national_id || "").trim()) ?? [anchor])
        : [];
      const alloc = allocatePayment(p, sibs, payments as any[]);
      if (alloc.size < 2) {
        out.push(p);
        continue;
      }
      for (const [sid, amt] of alloc) {
        out.push({ ...p, student_id: sid, amount: amt, _splitFromPaymentId: p.id });
      }
    }
    return out;
  }, [payments, enrollments]);

  const { data: drafts = [] } = useQuery({
    queryKey: ["priv-payments-drafts", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_payment_drafts" as any)
        .select("student_id, selected_discount_ids, custom_discounts, start_date_overrides, discount_enrollment_overrides")
        .eq("academic_year_id", yearId!);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const rows = useMemo(() => {
    if (!year || !settings) return [];
    const prices = settings.lesson_prices ?? {};
    const musicProdPrice = Number(settings.music_production_price) || 0;
    const recitalPrice = Number(settings.recital_track_price) || 0;

    // Ignore inactive enrollments / inactive students unless money was actually moved on them
    const enrollmentIdsWithPayments = new Set<string>(
      (allocatedPayments as any[]).map((p) => p.enrollment_id).filter(Boolean),
    );
    const studentIdsWithPayments = new Set<string>(
      (allocatedPayments as any[]).map((p) => p.student_id).filter(Boolean),
    );
    const relevantEnrollments = (enrollments as any[]).filter((e) => {
      if (enrollmentIdsWithPayments.has(e.id) || studentIdsWithPayments.has(e.student_id)) return true;
      return e.is_active !== false && e.students?.is_active !== false;
    });

    const byStudent = new Map<string, any[]>();
    for (const e of relevantEnrollments) {
      const arr = byStudent.get(e.student_id) ?? [];
      arr.push(e);
      byStudent.set(e.student_id, arr);
    }


    const enrollmentToStudent = new Map<string, string>();
    for (const e of enrollments) enrollmentToStudent.set(e.id, e.student_id);

    const paymentsByStudent = new Map<string, any[]>();
    for (const p of allocatedPayments) {
      const sid = p.student_id ?? (p.enrollment_id ? enrollmentToStudent.get(p.enrollment_id) : null);
      if (!sid) continue;
      const arr = paymentsByStudent.get(sid) ?? [];
      arr.push(p);
      paymentsByStudent.set(sid, arr);
    }

    const draftByStudent = new Map<string, any>();
    for (const d of drafts as any[]) if (d.student_id) draftByStudent.set(d.student_id, d);

    const result: any[] = [];

    for (const [studentId, enrList] of byStudent.entries()) {
      const student = enrList[0].students;
      if (!student) continue;

      const stuPayments = paymentsByStudent.get(studentId) ?? [];
      const pendingSrc = stuPayments.find((p) => p.payment_status === "pending");
      const paidWithBreakdown = stuPayments.find((p) => {
        if (p.payment_status === "pending") return false;
        const br = p?.enrollment_breakdown;
        return br && !Array.isArray(br) && br.discounts;
      });
      const paymentSource = pendingSrc ?? paidWithBreakdown;
      const draftSource = draftByStudent.get(studentId);

      const brDiscounts: any = draftSource
        ? {
            selectedDiscountIds: Array.isArray(draftSource.selected_discount_ids) ? draftSource.selected_discount_ids : [],
            customDiscounts: Array.isArray(draftSource.custom_discounts) ? draftSource.custom_discounts : [],
            startDateOverrides: draftSource.start_date_overrides && typeof draftSource.start_date_overrides === "object" ? draftSource.start_date_overrides : {},
          }
        : paymentSource
          ? (paymentSource.enrollment_breakdown && !Array.isArray(paymentSource.enrollment_breakdown)
              ? paymentSource.enrollment_breakdown.discounts ?? {}
              : {})
          : {};

      const selectedDiscountIds: string[] = Array.isArray(brDiscounts.selectedDiscountIds) ? brDiscounts.selectedDiscountIds : [];
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
      const startDateOverrides = brDiscounts.startDateOverrides && typeof brDiscounts.startDateOverrides === "object" ? brDiscounts.startDateOverrides : {};

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

      const proratedTotal = calcRows.reduce((s, r) => s + r.prorated, 0);
      const stdCompute = computeStandardDiscounts(
        calcRows.map((r) => ({ enrollmentId: r.enrollmentId, prorated: r.prorated })),
        selectedDiscounts,
      );

      const specialBase =
        (student.has_music_production_course ? musicProdPrice : 0) +
        (student.has_recital_track ? recitalPrice : 0);

      const afterStdDiscount = stdCompute.afterStdDiscount + specialBase;
      const customDiscountAmount = customDiscounts.reduce((sum: number, c: any) => {
        const v = Number(c.value) || 0;
        if (c.mode === "pct") return sum + (afterStdDiscount * v) / 100;
        return sum + v;
      }, 0);
      const totalDue = Math.max(0, Math.round((afterStdDiscount - customDiscountAmount) * 100) / 100);

      // Full potential (before any discount)
      const grossPotential = proratedTotal + specialBase;
      const discountsAmount = Math.max(0, Math.round((grossPotential - totalDue) * 100) / 100);

      // Payment accounting
      let paid = 0;      // paid (positive receipts, excludes refunds)
      let refunds = 0;   // refunded amount (positive number)
      let activeLinks = 0;
      for (const p of stuPayments) {
        if (p.payment_status === "pending") {
          activeLinks += 1;
          continue;
        }
        const amount = Number(p.amount || 0);
        if (amount < 0 || p.transaction_type === "credit") {
          refunds += Math.abs(amount);
        } else if (p.transaction_type === "payment") {
          paid += amount;
        }
      }
      const net = paid - refunds;
      const balance = Math.round((totalDue - net) * 100) / 100;

      let status: StatusFilter;
      if (totalDue > 0 && balance <= 0.01) status = "paid";
      else if (net > 0 && balance > 0.01) status = "partial";
      else status = "unpaid";

      result.push({
        studentId,
        student,
        enrollments: enrList,
        totalDue,
        grossPotential,
        discountsAmount,
        paid,
        refunds,
        net,
        balance,
        status,
        activeLinks,
        hasSpecialCourse: (student.has_music_production_course || student.has_recital_track),
        specialRevenue: specialBase,
      });
    }

    return result.sort((a, b) => `${a.student.first_name} ${a.student.last_name}`.localeCompare(`${b.student.first_name} ${b.student.last_name}`, "he"));
  }, [enrollments, allocatedPayments, drafts, year, settings, discountTypes]);


  // Family grouping — payments are managed at the family level
  const { rowsWithFamily, familyRows } = useMemo(() => {
    const keyOf = (s: any) =>
      s.parent_1_id ?? s.parent_2_id ?? (s.parent_national_id || s.parent_national_id_2) ?? `solo:${s.id}`;

    const groups = new Map<string, any[]>();
    for (const r of rows) {
      const k = keyOf(r.student);
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }

    const linksByKey = new Map<string, number>();
    for (const [k, members] of groups.entries()) {
      linksByKey.set(k, members.reduce((s, m) => s + m.activeLinks, 0));
    }

    const withFamily = rows.map((r) => {
      const k = keyOf(r.student);
      return {
        ...r,
        familyKey: k,
        familySize: groups.get(k)?.length ?? 1,
        familyActiveLinks: linksByKey.get(k) ?? 0,
      };
    });

    const fams: any[] = [];
    for (const [k, members] of groups.entries()) {
      const totalDue = members.reduce((s, m) => s + m.totalDue, 0);
      const grossPotential = members.reduce((s, m) => s + m.grossPotential, 0);
      const discountsAmount = members.reduce((s, m) => s + m.discountsAmount, 0);
      const paid = members.reduce((s, m) => s + m.paid, 0);
      const refunds = members.reduce((s, m) => s + m.refunds, 0);
      const activeLinks = linksByKey.get(k) ?? 0;
      const net = paid - refunds;
      const balance = Math.round((totalDue - net) * 100) / 100;
      const status: StatusFilter =
        totalDue > 0 && balance <= 0.01 ? "paid" : net > 0 && balance > 0.01 ? "partial" : "unpaid";
      const first = members[0].student;
      fams.push({
        familyKey: k,
        parentNationalId: first.parent_national_id || first.parent_national_id_2 || null,
        parentName: first.parent_name,
        parentPhone: first.parent_phone,
        members,
        enrollments: members.flatMap((m) => m.enrollments),
        totalDue, grossPotential, discountsAmount, paid, refunds, net, balance, status, activeLinks,
      });
    }
    fams.sort((a, b) => String(a.parentName ?? "").localeCompare(String(b.parentName ?? ""), "he"));
    return { rowsWithFamily: withFamily, familyRows: fams };
  }, [rows]);

  const recentPayments = useMemo(() => {
    const rowByStudentId = new Map(rowsWithFamily.map((row) => [row.studentId, row]));
    const studentIdByEnrollmentId = new Map<string, string>();
    for (const enrollment of enrollments) studentIdByEnrollmentId.set(enrollment.id, enrollment.student_id);

    return allocatedPayments
      .filter((payment: any) =>
        payment.payment_status === "paid" &&
        payment.transaction_type === "payment" &&
        Number(payment.amount) > 0
      )
      .map((payment: any) => {
        const studentId = payment.student_id ?? studentIdByEnrollmentId.get(payment.enrollment_id);
        const row = studentId ? rowByStudentId.get(studentId) : undefined;
        const paidAt = payment.paid_at || payment.payment_date || payment.created_at;
        return { ...payment, studentId, row, paidAt };
      })
      .filter((payment: any) => payment.row && payment.paidAt)
      .sort((a: any, b: any) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime());
  }, [allocatedPayments, enrollments, rowsWithFamily]);

  const latestPaymentByFamily = useMemo(() => {
    const latest = new Map<string, any>();
    for (const payment of recentPayments) {
      const familyKey = payment.row?.familyKey;
      if (familyKey && !latest.has(familyKey)) latest.set(familyKey, payment);
    }
    return latest;
  }, [recentPayments]);


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

  const instrumentOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of enrollments) if (e.instruments?.id) m.set(e.instruments.id, e.instruments.name);
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "he"));
  }, [enrollments]);

  const matchesCommon = (r: any) => {
    if (schoolFilter !== ALL && !r.enrollments.some((e: any) => e.schools?.id === schoolFilter)) return false;
    if (teacherFilter !== ALL && !r.enrollments.some((e: any) => e.teachers?.id === teacherFilter)) return false;
    if (instrumentFilter !== ALL && !r.enrollments.some((e: any) => e.instruments?.id === instrumentFilter)) return false;
    return true;
  };

  const filtered = useMemo(() => {
    return rowsWithFamily.filter((r) => {
      if (statusFilter === "refunded") {
        if (!(r.refunds > 0.01)) return false;
      } else if (statusFilter === "active_links") {
        if (!(r.familyActiveLinks > 0)) return false;
      } else if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!matchesCommon(r)) return false;
      if (search) {
        const q = search.toLowerCase().trim();
        const hay = `${r.student.first_name} ${r.student.last_name} ${r.student.parent_name ?? ""} ${r.student.parent_phone ?? ""} ${r.student.grade ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rowsWithFamily, statusFilter, schoolFilter, teacherFilter, instrumentFilter, search]);

  const filteredFamilies = useMemo(() => {
    const list = familyRows.filter((f) => {
      if (showRecentPayments && !latestPaymentByFamily.has(f.familyKey)) return false;
      if (statusFilter === "refunded") {
        if (!(f.refunds > 0.01)) return false;
      } else if (statusFilter === "active_links") {
        if (!(f.activeLinks > 0)) return false;
      } else if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (!matchesCommon(f)) return false;
      if (search) {
        const q = search.toLowerCase().trim();
        const hay = [
          f.parentName ?? "", f.parentPhone ?? "",
          ...f.members.map((m: any) => `${m.student.first_name} ${m.student.last_name}`),
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    if (showRecentPayments) {
      list.sort((a, b) => {
        const aPaidAt = latestPaymentByFamily.get(a.familyKey)?.paidAt;
        const bPaidAt = latestPaymentByFamily.get(b.familyKey)?.paidAt;
        return new Date(bPaidAt).getTime() - new Date(aPaidAt).getTime();
      });
    }
    return list;
  }, [familyRows, statusFilter, schoolFilter, teacherFilter, instrumentFilter, search, showRecentPayments, latestPaymentByFamily]);

  const statRows = useMemo(
    () => (viewMode === "families" ? filteredFamilies.flatMap((f: any) => f.members) : filtered),
    [viewMode, filteredFamilies, filtered],
  );

  const totals = useMemo(() => {
    let potential = 0, paid = 0, refunds = 0, discounts = 0, enrollmentsCount = 0;
    let specialRevenue = 0, specialCount = 0;
    let productionRevenue = 0, recitalRevenue = 0, productionCount = 0, recitalCount = 0;
    let paidStudents = 0, partialStudents = 0, unpaidStudents = 0, refundedStudents = 0, activeLinks = 0;
    const musicProdPrice = Number(settings?.music_production_price || 0);
    const recitalPrice = Number(settings?.recital_track_price || 0);
    for (const r of statRows) {
      enrollmentsCount += r.enrollments.length;
      if (r.hasSpecialCourse) specialCount += 1;
      if (r.student.has_music_production_course) { productionCount += 1; productionRevenue += musicProdPrice; }
      if (r.student.has_recital_track) { recitalCount += 1; recitalRevenue += recitalPrice; }
      if (r.hasSpecialCourse) specialRevenue += r.specialRevenue ?? 0;

      potential += r.totalDue;
      paid += r.paid;
      refunds += r.refunds;
      discounts += r.discountsAmount;
      activeLinks += r.activeLinks;

      if (r.status === "paid") paidStudents += 1;
      else if (r.status === "partial") partialStudents += 1;
      else unpaidStudents += 1;
      if (r.refunds > 0.01) refundedStudents += 1;
    }
    const net = paid - refunds;
    const balance = Math.max(0, Math.round((potential - net) * 100) / 100);
    const collectionPct = potential > 0 ? Math.round((net / potential) * 100) : 0;
    return {
      potential, paid, refunds, net, balance, discounts,
      studentsCount: statRows.length, familiesCount: filteredFamilies.length, enrollmentsCount,
      specialRevenue, specialCount, productionRevenue, recitalRevenue, productionCount, recitalCount,
      paidStudents, partialStudents, unpaidStudents, refundedStudents, activeLinks, collectionPct,
    };
  }, [statRows, filteredFamilies, settings]);

  const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");

  const exportCsv = () => {
    const headers = [
      "#", "שם תלמיד", "כיתה", "הורה", "טלפון", "שלוחות", "מורים", "כלים",
      "מסלולים מיוחדים", "פוטנציאל", "הנחות", "לתשלום", "שולם", "הוחזר", "נטו", "יתרה",
      "סטטוס", "לינקים פעילים",
    ];
    const escape = (v: any) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const statusLabel: Record<StatusFilter, string> = {
      all: "", unpaid: "לא שולם", partial: "שולם חלקית", paid: "שולם", refunded: "הוחזר", active_links: "לינק פעיל",
    };
    const lines = [headers.join(",")];
    statRows.forEach((r, idx) => {
      const schools = Array.from(new Set(r.enrollments.map((e: any) => e.schools?.name).filter(Boolean))).join(" · ");
      const teachers = Array.from(new Set(r.enrollments.map((e: any) => e.teachers ? `${e.teachers.first_name} ${e.teachers.last_name}` : null).filter(Boolean))).join(" · ");
      const instrs = Array.from(new Set(r.enrollments.map((e: any) => e.instruments?.name).filter(Boolean))).join(" · ");
      const special = [
        r.student.has_music_production_course ? "הפקה מוסיקלית" : null,
        r.student.has_recital_track ? "מסלול רסיטל" : null,
      ].filter(Boolean).join(" · ");
      lines.push([
        idx + 1,
        `${r.student.first_name} ${r.student.last_name}`,
        r.student.grade ?? "",
        r.student.parent_name ?? "",
        r.student.parent_phone ?? "",
        schools, teachers, instrs, special,
        Math.round(r.grossPotential),
        Math.round(r.discountsAmount),
        Math.round(r.totalDue),
        Math.round(r.paid),
        Math.round(r.refunds),
        Math.round(r.net),
        Math.round(Math.max(0, r.balance)),
        statusLabel[r.status] ?? "",
        r.activeLinks,
      ].map(escape).join(","));
    });
    const csv = "\uFEFF" + lines.join("\n"); // BOM for Hebrew Excel
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `private-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout title="תשלומים — שיעורים פרטניים" backPath="/admin">
      <PageTitle title="דוח תשלומים פרטני" />
      <div className="space-y-4">

        {/* View toggle */}
        <div className="inline-flex rounded-xl border border-border bg-card p-1 w-full sm:w-auto">
          <Button
            variant={viewMode === "families" ? "default" : "ghost"}
            size="sm"
            className="h-9 rounded-lg gap-1 flex-1 sm:flex-none"
            onClick={() => setViewMode("families")}
          >
            <Users className="h-3.5 w-3.5" /> לפי משפחה
          </Button>
          <Button
            variant={viewMode === "students" ? "default" : "ghost"}
            size="sm"
            className="h-9 rounded-lg gap-1 flex-1 sm:flex-none"
            onClick={() => setViewMode("students")}
          >
            <User className="h-3.5 w-3.5" /> לפי תלמיד
          </Button>
        </div>

        {/* Counts */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <span><span className="font-semibold text-foreground">{totals.familiesCount}</span> תאים משפחתיים</span>
          <span><span className="font-semibold text-foreground">{totals.studentsCount}</span> תלמידים</span>
          <span><span className="font-semibold text-foreground">{totals.enrollmentsCount}</span> שיוכים</span>
          <span><span className="font-semibold text-foreground">{totals.specialCount}</span> במסלולים מיוחדים</span>
          {totals.activeLinks > 0 && (
            <span><span className="font-semibold text-foreground">{totals.activeLinks}</span> קישורי תשלום פעילים</span>
          )}
        </div>

        {/* Row 1 — Potential breakdown */}
        <div className="rounded-xl border border-border bg-card p-4">
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
            <p className="text-xs text-muted-foreground">סה"כ פוטנציאל הכנסות (אחרי הנחות)</p>
            <p className="text-2xl font-bold text-foreground">{fmt(totals.potential)} ₪</p>
          </div>
        </div>

        {/* Row 2 — Money flow */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">שולם (ברוטו)</p>
            <p className="text-xl font-bold text-green-600">{fmt(totals.paid)} ₪</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">הוחזר</p>
            <p className="text-xl font-bold text-red-600">{fmt(totals.refunds)} ₪</p>
            {totals.refundedStudents > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">{totals.refundedStudents} תלמידים</p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">נטו שולם</p>
            <p className="text-xl font-bold text-foreground">{fmt(totals.net)} ₪</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">יתרה לגבייה</p>
            <p className="text-xl font-bold text-amber-600">{fmt(totals.balance)} ₪</p>
          </div>
        </div>

        {/* Row 3 — KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">% גבייה</p>
            <p className="text-xl font-bold text-foreground">{totals.collectionPct}%</p>
            <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, totals.collectionPct))}%` }}
              />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">סה"כ הנחות</p>
            <p className="text-xl font-bold text-foreground">{fmt(totals.discounts)} ₪</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">לינקים פעילים</p>
            <p className="text-xl font-bold text-foreground">{totals.activeLinks}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground text-center mb-1">פילוח לפי סטטוס</p>
            <div className="flex justify-around text-center text-xs">
              <div>
                <p className="font-bold text-green-600 text-base leading-tight">{totals.paidStudents}</p>
                <p className="text-muted-foreground">שולם</p>
              </div>
              <div>
                <p className="font-bold text-amber-600 text-base leading-tight">{totals.partialStudents}</p>
                <p className="text-muted-foreground">חלקי</p>
              </div>
              <div>
                <p className="font-bold text-foreground text-base leading-tight">{totals.unpaidStudents}</p>
                <p className="text-muted-foreground">לא שולם</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
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
              <SelectItem value="refunded">עם החזרים</SelectItem>
              <SelectItem value="active_links">עם קישור תשלום פעיל (משפחתי)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger className="w-full sm:w-44 h-11 rounded-xl"><SelectValue placeholder="שלוחה" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל השלוחות</SelectItem>
              {schoolOptions.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger className="w-full sm:w-44 h-11 rounded-xl"><SelectValue placeholder="מורה" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל המורים</SelectItem>
              {teacherOptions.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
            <SelectTrigger className="w-full sm:w-40 h-11 rounded-xl"><SelectValue placeholder="כלי" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל הכלים</SelectItem>
              {instrumentOptions.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>


        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={showRecentPayments ? "default" : "outline"}
            size="sm"
            className="h-9 rounded-xl gap-1"
            onClick={() => {
              setViewMode("families");
              setShowRecentPayments((v) => !v);
            }}
          >
            <Clock className="h-3.5 w-3.5" />
            {showRecentPayments ? "בטל סינון תשלומים אחרונים" : "תשלומים אחרונים"}
          </Button>
          <Button
            variant={statusFilter === "refunded" ? "default" : "outline"}
            size="sm"
            className="h-9 rounded-xl gap-1"
            onClick={() => setStatusFilter(statusFilter === "refunded" ? "all" : "refunded")}
          >
            <Undo2 className="h-3.5 w-3.5" />
            {statusFilter === "refunded" ? "בטל סינון החזרים" : "החזרים בלבד"}
          </Button>
          <Button
            variant={statusFilter === "active_links" ? "default" : "outline"}
            size="sm"
            className="h-9 rounded-xl gap-1"
            onClick={() => setStatusFilter(statusFilter === "active_links" ? "all" : "active_links")}
          >
            <Link2 className="h-3.5 w-3.5" />
            {statusFilter === "active_links" ? "בטל סינון קישורים" : "קישורי תשלום פעילים (משפחה)"}
          </Button>
          <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            ייצוא לאקסל
          </Button>
        </div>

        {/* List */}
        {loadingEnr ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : viewMode === "families" ? (
          filteredFamilies.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">לא נמצאו משפחות</p>
          ) : (
            <div className="space-y-2">
              {filteredFamilies.map((f: any, idx: number) => {
                const latestPayment = latestPaymentByFamily.get(f.familyKey);
                const familyPayments = allocatedPayments.filter((p: any) =>
                  f.members.some((m: any) => m.studentId === p.student_id) &&
                  p.transaction_type === "payment" &&
                  p.payment_status === "paid" &&
                  Number(p.amount) > 0
                );
                const familyMethods = summarizePaymentMethods(familyPayments);
                const statusBadge =
                  f.status === "paid" ? { label: "שולם", variant: "default" as const } :
                  f.status === "partial" ? { label: "שולם חלקית", variant: "secondary" as const } :
                  { label: "לא שולם", variant: "outline" as const };
                return (
                  <div
                    key={f.familyKey}
                    className={`rounded-xl border border-border bg-card p-4 shadow-sm transition-colors ${f.parentNationalId ? "cursor-pointer hover:bg-accent/50" : ""}`}
                    onClick={() => {
                      if (!f.parentNationalId) return;
                      saveListScrollPosition(routeKey);
                      navigate(`/admin/families/${f.parentNationalId}`);
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm text-muted-foreground font-mono">{idx + 1}.</span>
                          <p className="font-semibold text-foreground">
                            {f.parentName ? `משפחת ${f.parentName}` : "ללא הורה מקושר"}
                          </p>
                          <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" /> {f.members.length} ילדים</Badge>
                          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                          {f.refunds > 0.01 && (
                            <Badge variant="destructive" className="gap-1"><Undo2 className="h-3 w-3" /> החזר {fmt(f.refunds)} ₪</Badge>
                          )}
                          {f.activeLinks > 0 && (
                            <Badge variant="outline" className="text-blue-600 border-blue-300">🔗 {f.activeLinks} קישור פעיל</Badge>
                          )}
                        </div>

                        {f.parentPhone && (
                          <div className="text-xs text-muted-foreground mt-1"><PhoneDisplay phone={f.parentPhone} /></div>
                        )}
                        {f.paid > 0.01 && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="font-semibold text-green-600">שולם {fmt(f.paid)} ₪</span>
                            {familyMethods.length > 0 && <><span>·</span><span>{familyMethods.join(" · ")}</span></>}
                            {latestPayment?.paidAt && (
                              <>
                                <span>·</span>
                                <span dir="ltr">{format(new Date(latestPayment.paidAt), "dd/MM/yyyy HH:mm")}</span>
                              </>
                            )}
                          </div>
                        )}
                        <div className="mt-2 flex flex-col gap-0.5">
                        {f.members.map((m: any) => {
                          const memberPayments = allocatedPayments.filter((p: any) =>
                            p.student_id === m.studentId &&
                            p.transaction_type === "payment" &&
                            p.payment_status === "paid" &&
                            Number(p.amount) > 0
                          );
                          const memberMethods = f.members.length > 1 ? summarizePaymentMethods(memberPayments) : [];
                          const memberBalance = m.totalDue - m.paid;
                          return (
                            <div key={m.studentId} className="text-sm text-foreground flex flex-wrap items-baseline gap-x-2">
                              <span className="text-muted-foreground">•</span>
                              <span className="font-medium">{m.student.first_name} {m.student.last_name}</span>
                              <span className="text-xs text-muted-foreground">
                                {Array.from(new Set(m.enrollments.map((e: any) => e.instruments?.name).filter(Boolean))).join(" · ")}
                              </span>
                              <span className="text-xs text-muted-foreground">{fmt(m.totalDue)} ₪</span>
                              {memberBalance > 0.01 && (
                                <span className="text-xs text-amber-600">יתרה {fmt(memberBalance)} ₪</span>
                              )}
                              {memberMethods.length > 0 && (
                                <span className="text-[11px] text-muted-foreground leading-tight">
                                  {memberMethods.join(" · ")}
                                </span>
                              )}
                            </div>
                          );
                        })}
                        </div>
                      </div>
                      <div className="text-left shrink-0 space-y-0.5">
                        <div>
                          <p className="text-[10px] text-muted-foreground">לתשלום (משפחה)</p>
                          <p className="text-lg font-bold text-foreground leading-tight">{fmt(f.totalDue)} ₪</p>
                          {f.discountsAmount > 0.01 && (
                            <p className="text-[10px] text-muted-foreground">
                              <span className="line-through">{fmt(f.grossPotential)}</span> −{fmt(f.discountsAmount)}
                            </p>
                          )}
                        </div>
                        {f.refunds > 0.01 && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">הוחזר</p>
                            <p className="text-sm font-semibold text-red-600 leading-tight">−{fmt(f.refunds)} ₪</p>
                          </div>
                        )}
                        {f.balance > 0.01 && (
                          <div>
                            <p className="text-[10px] text-muted-foreground">יתרה</p>
                            <p className="text-sm font-semibold leading-tight text-amber-600">{fmt(f.balance)} ₪</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

            </div>
          )
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
                  onClick={() => {
                    saveListScrollPosition(routeKey);
                    navigate(`/admin/students/${r.studentId}`);
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-muted-foreground font-mono">{idx + 1}.</span>
                        <p className="font-semibold text-foreground">{r.student.first_name} {r.student.last_name}</p>
                        <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                        {r.paid > 0.01 && (
                          <Badge className="gap-1 bg-green-500/10 text-green-700 border-green-500/30 hover:bg-green-500/10">
                            שולם {fmt(r.paid)} ₪
                          </Badge>
                        )}
                        {r.refunds > 0.01 && (
                          <Badge variant="destructive" className="gap-1"><Undo2 className="h-3 w-3" /> החזר {fmt(r.refunds)} ₪</Badge>
                        )}
                        {r.familyActiveLinks > 0 && (
                          <Badge variant="outline" className="text-blue-600 border-blue-300">
                            🔗 {r.familyActiveLinks} קישור פעיל{r.familySize > 1 ? " (משפחתי)" : ""}
                          </Badge>
                        )}
                        {r.student.grade && <span className="text-xs text-muted-foreground">כיתה {r.student.grade}</span>}
                      </div>


                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                        {r.student.parent_name && <span>הורה: {r.student.parent_name}</span>}
                        {r.student.parent_phone && <PhoneDisplay phone={r.student.parent_phone} />}
                      </div>
                      <div className="mt-2 flex flex-col gap-0.5">
                        {(() => {
                          const studentPayments = allocatedPayments.filter((p: any) =>
                            p.student_id === r.studentId &&
                            p.transaction_type === "payment" &&
                            p.payment_status === "paid" &&
                            Number(p.amount) > 0
                          );
                          const methodSummary = summarizePaymentMethods(studentPayments);
                          return (
                            <>
                              {r.enrollments.map((e: any) => (
                                <div key={e.id} className="text-sm text-foreground">
                                  <span className="text-muted-foreground">•</span>{" "}
                                  {e.instruments?.name ?? "—"}
                                  {e.teachers && <span className="text-muted-foreground"> · {e.teachers.first_name} {e.teachers.last_name}</span>}
                                  {e.schools?.name && <span className="text-muted-foreground"> · {e.schools.name}</span>}
                                  {e.lesson_duration_minutes && <span className="text-muted-foreground"> · {e.lesson_duration_minutes} דק׳</span>}
                                </div>
                              ))}
                              {methodSummary.length > 0 && (
                                <div className="text-[11px] text-muted-foreground leading-tight mt-1">
                                  {methodSummary.join(" · ")}
                                </div>
                              )}
                            </>
                          );
                        })()}
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
                        <p className="text-[10px] text-muted-foreground">לתשלום</p>
                        <p className="text-lg font-bold text-foreground leading-tight">{fmt(r.totalDue)} ₪</p>
                        {r.discountsAmount > 0.01 && (
                          <p className="text-[10px] text-muted-foreground">
                            <span className="line-through">{fmt(r.grossPotential)}</span> −{fmt(r.discountsAmount)}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground">שולם</p>
                        <p className="text-sm font-semibold text-green-600 leading-tight">{fmt(r.paid)} ₪</p>
                      </div>
                      {r.refunds > 0.01 && (
                        <div>
                          <p className="text-[10px] text-muted-foreground">הוחזר</p>
                          <p className="text-sm font-semibold text-red-600 leading-tight">−{fmt(r.refunds)} ₪</p>
                        </div>
                      )}
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
          {viewMode === "families"
            ? `מציג ${filteredFamilies.length} תאים משפחתיים (${totals.studentsCount} תלמידים)`
            : `מציג ${filtered.length} תלמידים`} · הפוטנציאל מחושב לפי מחירון השיעורים והשיוכים; להנחות ולהתאמות אישיות ייעשה שימוש בטיוטת החישוב השמורה בכרטיס התלמיד
        </p>
      </div>

    </AdminLayout>
  );
};

export default AdminPrivatePayments;
