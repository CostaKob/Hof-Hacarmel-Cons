// Payment calculation utilities
export const monthsBetween = (from: Date, to: Date): number => {
  // Inclusive months count, partial month counts as 1
  const start = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
  return Math.max(0, months);
};

export interface DiscountFlags {
  sibling?: boolean;
  secondInstrument?: boolean;
  majorStudent?: boolean;
  custom?: { label: string; pct: number }[];
}

export interface DiscountRates {
  sibling: number;
  secondInstrument: number;
  majorStudent: number;
}

export const totalDiscountPct = (flags: DiscountFlags, rates: DiscountRates): number => {
  let pct = 0;
  if (flags.sibling) pct += rates.sibling;
  if (flags.secondInstrument) pct += rates.secondInstrument;
  if (flags.majorStudent) pct += rates.majorStudent;
  for (const c of flags.custom ?? []) pct += Number(c.pct) || 0;
  return pct;
};

export interface EnrollmentForCalc {
  id: string;
  duration: number; // 30/45/60
  startDate: string; // ISO
  pricePerLessonOverride?: number | null;
  instrumentName?: string | null;
  schoolName?: string | null;
  teacherName?: string | null;
}

export interface CalcRow {
  enrollmentId: string;
  annualBase: number;
  monthsTotal: number;
  monthsRemaining: number;
  prorated: number;
  source: "override" | "global" | "missing";
}

export const calcEnrollment = (
  enrollment: EnrollmentForCalc,
  globalPrices: Record<string, number>,
  yearStart: string,
  yearEnd: string
): CalcRow => {
  const ys = new Date(yearStart);
  const ye = new Date(yearEnd);
  const monthsTotal = monthsBetween(ys, ye);

  let annualBase = 0;
  let source: "override" | "global" | "missing" = "missing";

  if (enrollment.pricePerLessonOverride && enrollment.pricePerLessonOverride > 0) {
    // override is annual price (same convention as global)
    annualBase = Number(enrollment.pricePerLessonOverride);
    source = "override";
  } else {
    const p = globalPrices[String(enrollment.duration)];
    if (p && p > 0) {
      annualBase = Number(p);
      source = "global";
    }
  }

  const enrollStart = new Date(enrollment.startDate);
  const fromDate = enrollStart > ys ? enrollStart : ys;
  const monthsRemaining = monthsBetween(fromDate, ye);
  const monthlyRate = monthsTotal > 0 ? annualBase / monthsTotal : 0;
  const prorated = Math.round(monthlyRate * monthsRemaining);

  return { enrollmentId: enrollment.id, annualBase, monthsTotal, monthsRemaining, prorated, source };
};
