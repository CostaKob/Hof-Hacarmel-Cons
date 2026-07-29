// Family-level payment calculator.
//
// For each child, we replicate the same computation used on
// AdminStudentPaymentCalc.tsx: prorated per-enrollment amounts via
// `calcEnrollment`, then standard discounts via `computeStandardDiscounts`,
// then flat/percentage custom discounts on top — using the child's saved
// `student_payment_drafts` row as the source of truth for discounts.
//
// The result exposes both per-enrollment net amounts (so the family card can
// show which enrollment is worth what after discounts, and let the admin
// pick which enrollments to bill) and per-child rollups.

import { calcEnrollment } from "@/lib/paymentCalc";
import { computeStandardDiscounts, type DiscountType } from "@/lib/discounts";

export interface FamilyEnrollmentInput {
  id: string;
  student_id: string;
  lesson_duration_minutes: number;
  price_per_lesson: number | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  instruments: { name: string } | null;
  schools: { name: string } | null;
  teachers: { first_name: string; last_name: string } | null;
}

export interface FamilyDraftRow {
  student_id: string;
  selected_discount_ids: string[] | null;
  custom_discounts:
    | { label: string; value: string; mode: "pct" | "amount" }[]
    | null;
  start_date_overrides: Record<string, string> | null;
  discount_enrollment_overrides: Record<string, string[]> | null;
}

export interface ChildEnrollmentBreakdown {
  enrollmentId: string;
  studentId: string;
  instrumentName: string;
  teacherName: string;
  schoolName: string;
  duration: number;
  isActive: boolean;
  annualBase: number;
  prorated: number;
  lessonsRemaining: number;
  lessonsTotal: number;
  discountPct: number; // sum of standard discount %s
  discountLabels: string[]; // names of standard discounts applied to this enrollment
  net: number; // prorated * (1 - discountPct/100)
  source: "override" | "global" | "missing";
}




export interface ChildTotals {
  studentId: string;
  enrollments: ChildEnrollmentBreakdown[];
  proratedTotal: number;
  standardDiscountAmount: number;
  customDiscountAmount: number;
  net: number;
  /** Per-discount breakdown (standard + custom), amounts are positive. */
  discountLines: { label: string; amount: number }[];
}


export function computeChildTotals(
  studentId: string,
  enrollments: FamilyEnrollmentInput[],
  draft: FamilyDraftRow | null,
  discountTypes: DiscountType[],
  globalPrices: Record<string, number>,
  yearStart: string,
  yearEnd: string,
): ChildTotals {
  const startOverrides = draft?.start_date_overrides ?? {};
  const selectedIds = draft?.selected_discount_ids ?? [];
  const customs = draft?.custom_discounts ?? [];
  const discountOverrides = draft?.discount_enrollment_overrides ?? {};

  // Only include the child's own enrollments; family callers pass a filtered list.
  const rows = enrollments.map((e) => {
    const c = calcEnrollment(
      {
        id: e.id,
        duration: Number(e.lesson_duration_minutes) || 0,
        startDate: startOverrides[e.id] ?? e.start_date,
        endDate: e.end_date ?? null,
        pricePerLessonOverride: e.price_per_lesson ?? null,
      },
      globalPrices,
      yearStart,
      yearEnd,
    );
    return { e, c };
  });

  const selected = discountTypes.filter((d) => selectedIds.includes(d.id));
  const std = computeStandardDiscounts(
    rows.map(({ c }) => ({ enrollmentId: c.enrollmentId, prorated: c.prorated })),
    selected,
    discountOverrides,
  );

  const breakdown: ChildEnrollmentBreakdown[] = rows.map(({ e, c }) => {
    const pct = std.perEnrollmentPct.get(c.enrollmentId) ?? 0;
    const net = Math.round(c.prorated * (1 - pct / 100) * 100) / 100;
    const discountLabels = std.lines
      .filter((ln) => {
        if (ln.percentage <= 0) return false;
        // "cheapest_enrollment" sets appliedEnrollmentIds; other scopes
        // (all / sibling_cheapest) apply to every enrollment.
        if (ln.applies_to === "cheapest_enrollment") {
          return ln.appliedEnrollmentIds.includes(c.enrollmentId);
        }
        return true;
      })
      .map((ln) => ln.label);
    return {
      enrollmentId: c.enrollmentId,
      studentId,
      instrumentName: e.instruments?.name ?? "—",
      teacherName: e.teachers
        ? `${e.teachers.first_name} ${e.teachers.last_name}`.trim()
        : "—",
      schoolName: e.schools?.name ?? "—",
      duration: Number(e.lesson_duration_minutes) || 0,
      isActive: !!e.is_active,
      annualBase: c.annualBase,
      prorated: c.prorated,
      lessonsRemaining: c.lessonsRemaining,
      lessonsTotal: c.lessonsTotal,
      discountPct: pct,
      discountLabels,
      net,
      source: c.source,
    };
  });

  const proratedTotal = breakdown.reduce((s, r) => s + r.prorated, 0);
  const afterStd = std.afterStdDiscount;
  const standardDiscountAmount = Math.round((proratedTotal - afterStd) * 100) / 100;

  // Custom discounts: percentage of afterStd OR flat ILS. Match the
  // AdminStudentPaymentCalc convention. Distribute proportionally across
  // enrollments so per-enrollment nets sum to the child total.
  const customDiscountAmount = customs.reduce((sum, c) => {
    const v = Number(c.value) || 0;
    if (c.mode === "pct") return sum + (afterStd * v) / 100;
    return sum + v;
  }, 0);

  const netUnrounded = Math.max(0, afterStd - customDiscountAmount);
  const net = Math.round(netUnrounded * 100) / 100;

  if (customDiscountAmount > 0 && afterStd > 0) {
    // Scale per-enrollment nets so their sum equals `net`.
    const scale = net / afterStd;
    for (const b of breakdown) {
      b.net = Math.round(b.net * scale * 100) / 100;
    }
    // Fix rounding drift onto the first row.
    const s = breakdown.reduce((a, b) => a + b.net, 0);
    const drift = Math.round((net - s) * 100) / 100;
    if (drift !== 0 && breakdown.length > 0) {
      breakdown[0].net = Math.round((breakdown[0].net + drift) * 100) / 100;
    }
    // Surface custom discount labels + effective % on every enrollment row.
    const customLabels = customs
      .filter((c) => (Number(c.value) || 0) > 0)
      .map((c) =>
        c.mode === "pct"
          ? `${c.label} (${Number(c.value)}%)`
          : `${c.label} (₪${Number(c.value)})`,
      );
    for (const b of breakdown) {
      if (customLabels.length) b.discountLabels = [...b.discountLabels, ...customLabels];
      b.discountPct =
        b.prorated > 0
          ? Math.round((1 - b.net / b.prorated) * 1000) / 10
          : b.discountPct;
    }
  }


  const discountLines: { label: string; amount: number }[] = [];
  for (const ln of std.lines) {
    if (ln.amount > 0) discountLines.push({ label: `${ln.label} (${ln.percentage}%)`, amount: Math.round(ln.amount * 100) / 100 });
  }
  for (const c of customs) {
    const v = Number(c.value) || 0;
    if (!v) continue;
    const amt = c.mode === "pct" ? (afterStd * v) / 100 : v;
    if (amt <= 0) continue;
    const label = c?.label
      ? `${c.label}${c.mode === "pct" ? ` (${v}%)` : ""}`
      : (c?.mode === "pct" ? `הנחה ${v}%` : "הנחה");
    discountLines.push({ label, amount: Math.round(amt * 100) / 100 });
  }

  return {
    studentId,
    enrollments: breakdown,
    proratedTotal,
    standardDiscountAmount,
    customDiscountAmount: Math.round(customDiscountAmount * 100) / 100,
    net,
    discountLines,
  };
}

