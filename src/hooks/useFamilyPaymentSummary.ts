import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { calcEnrollment } from "@/lib/paymentCalc";
import { computeStandardDiscounts, type DiscountType } from "@/lib/discounts";
import { allocatePayment } from "@/lib/familyPaymentAllocation";
import { isNoTeacherEnrollment } from "@/lib/constants";

export interface FamilyPaymentSummary {
  totalDue: number;
  net: number;
  balance: number; // totalDue - net (positive = debt)
  credit: number;  // net - totalDue when positive (money owed back to family)
}

/**
 * Computes a per-family payment summary (keyed by parent_national_id) using the
 * same allocation/discount logic as the private payments page. Used to badge
 * families that are fully paid or are owed a credit.
 */
export function useFamilyPaymentSummary(yearId: string | null | undefined) {
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

  const { data: enrollments = [] } = useQuery({
    queryKey: ["priv-payments-enrollments", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, lesson_duration_minutes, start_date, end_date, price_per_lesson, is_active, teachers(id, first_name, last_name), students!inner(id, parent_national_id, has_music_production_course, has_recital_track, is_active)")
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
        .select("id, refund_of_payment_id, student_id, enrollment_id, amount, transaction_type, payment_status, enrollment_breakdown, icount_doc_number")
        .eq("academic_year_id", yearId!);
      if (error) throw error;
      return (data as any[]).filter((p) => !["1113", "1114"].includes(p.icount_doc_number));
    },
  });

  const { data: drafts = [] } = useQuery({
    queryKey: ["priv-payments-drafts", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_payment_drafts" as any)
        .select("student_id, selected_discount_ids, custom_discounts, start_date_overrides")
        .eq("academic_year_id", yearId!);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const summary = useMemo(() => {
    const map = new Map<string, FamilyPaymentSummary>();
    if (!year || !settings) return map;

    const prices = settings.lesson_prices ?? {};
    const musicProdPrice = Number(settings.music_production_price) || 0;
    const recitalPrice = Number(settings.recital_track_price) || 0;

    // Split family-level payments into per-child shares
    const studentsById = new Map<string, any>();
    for (const e of enrollments as any[]) {
      if (e.students?.id) studentsById.set(e.students.id, e.students);
    }
    const familyByNid = new Map<string, any[]>();
    for (const s of studentsById.values()) {
      const nid = (s.parent_national_id || "").trim();
      if (!nid) continue;
      familyByNid.set(nid, [...(familyByNid.get(nid) ?? []), s]);
    }
    const allocated: any[] = [];
    for (const p of payments as any[]) {
      const anchor = p.student_id ? studentsById.get(p.student_id) : null;
      const sibs = anchor
        ? (familyByNid.get((anchor.parent_national_id || "").trim()) ?? [anchor])
        : [];
      const alloc = allocatePayment(p, sibs, payments as any[]);
      if (alloc.size < 2) {
        allocated.push(p);
        continue;
      }
      for (const [sid, amt] of alloc) {
        allocated.push({ ...p, student_id: sid, amount: amt });
      }
    }

    const enrollmentIdsWithPayments = new Set<string>(allocated.map((p) => p.enrollment_id).filter(Boolean));
    const studentIdsWithPayments = new Set<string>(allocated.map((p) => p.student_id).filter(Boolean));
    // שיוכי "ללא מורה" = תלמידי חוץ בהרכבים בלבד — מתעלמים מהם כספית לחלוטין
    const relevantEnrollments = (enrollments as any[]).filter((e) => {
      if (isNoTeacherEnrollment(e)) return false;
      if (enrollmentIdsWithPayments.has(e.id) || studentIdsWithPayments.has(e.student_id)) return true;
      return e.is_active !== false && e.students?.is_active !== false;
    });

    const byStudent = new Map<string, any[]>();
    for (const e of relevantEnrollments) {
      byStudent.set(e.student_id, [...(byStudent.get(e.student_id) ?? []), e]);
    }

    const enrollmentToStudent = new Map<string, string>();
    for (const e of enrollments as any[]) enrollmentToStudent.set(e.id, e.student_id);

    const paymentsByStudent = new Map<string, any[]>();
    for (const p of allocated) {
      const sid = p.student_id ?? (p.enrollment_id ? enrollmentToStudent.get(p.enrollment_id) : null);
      if (!sid) continue;
      paymentsByStudent.set(sid, [...(paymentsByStudent.get(sid) ?? []), p]);
    }

    const draftByStudent = new Map<string, any>();
    for (const d of drafts as any[]) if (d.student_id) draftByStudent.set(d.student_id, d);

    const acc = (nid: string): FamilyPaymentSummary => {
      const cur = map.get(nid) ?? { totalDue: 0, net: 0, balance: 0, credit: 0 };
      map.set(nid, cur);
      return cur;
    };

    for (const [studentId, enrList] of byStudent.entries()) {
      const student = enrList[0].students;
      if (!student) continue;
      const nid = (student.parent_national_id || "").trim();
      if (!nid) continue;

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

      let paid = 0;
      let refunds = 0;
      for (const p of stuPayments) {
        if (p.payment_status === "pending") continue;
        const amount = Number(p.amount || 0);
        if (amount < 0 || p.transaction_type === "credit") {
          refunds += Math.abs(amount);
        } else if (p.transaction_type === "payment") {
          paid += amount;
        }
      }

      const fam = acc(nid);
      fam.totalDue += totalDue;
      fam.net += paid - refunds;
    }

    for (const fam of map.values()) {
      fam.totalDue = Math.round(fam.totalDue * 100) / 100;
      fam.net = Math.round(fam.net * 100) / 100;
      const rawBalance = Math.round((fam.totalDue - fam.net) * 100) / 100;
      fam.balance = Math.max(0, rawBalance);
      fam.credit = Math.max(0, -rawBalance);
    }

    return map;
  }, [enrollments, payments, drafts, year, settings, discountTypes]);

  return summary;
}
