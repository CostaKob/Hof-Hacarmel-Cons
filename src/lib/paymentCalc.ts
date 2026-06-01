// Payment calculation utilities
// Convention: lesson_prices in payment_settings are ANNUAL totals INCLUDING VAT.
// Annual = total for full year (LESSONS_PER_YEAR lessons). Per-lesson = annual / LESSONS_PER_YEAR.

export const LESSONS_PER_YEAR = 32;

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
  endDate?: string | null; // ISO — optional enrollment end date (caps prorating)
  pricePerLessonOverride?: number | null; // annual total (incl VAT) override
  instrumentName?: string | null;
  schoolName?: string | null;
  teacherName?: string | null;
}

export interface CalcRow {
  enrollmentId: string;
  annualBase: number; // annual total incl VAT (full 32 lessons)
  pricePerLesson: number; // annual / 32
  lessonsTotal: number; // = 32
  lessonsRemaining: number; // pro-rated by start date
  prorated: number; // pricePerLesson * lessonsRemaining
  source: "override" | "global" | "missing";
}

const dayMs = 1000 * 60 * 60 * 24;

export const calcEnrollment = (
  enrollment: EnrollmentForCalc,
  globalPrices: Record<string, number>,
  yearStart: string,
  yearEnd: string
): CalcRow => {
  const ys = new Date(yearStart);
  const ye = new Date(yearEnd);
  const totalDays = Math.max(1, Math.round((ye.getTime() - ys.getTime()) / dayMs));

  let annualBase = 0;
  let source: "override" | "global" | "missing" = "missing";

  if (enrollment.pricePerLessonOverride && enrollment.pricePerLessonOverride > 0) {
    annualBase = Number(enrollment.pricePerLessonOverride);
    source = "override";
  } else {
    const p = globalPrices[String(enrollment.duration)];
    if (p && p > 0) {
      annualBase = Number(p);
      source = "global";
    }
  }

  const pricePerLesson = annualBase / LESSONS_PER_YEAR;

  const enrollStart = new Date(enrollment.startDate);
  const fromDate = enrollStart > ys ? enrollStart : ys;
  const enrollEnd = enrollment.endDate ? new Date(enrollment.endDate) : null;
  const toDate = enrollEnd && enrollEnd < ye ? enrollEnd : ye;
  const remainingDays = Math.max(0, Math.round((toDate.getTime() - fromDate.getTime()) / dayMs));
  const lessonsRemaining = Math.min(
    LESSONS_PER_YEAR,
    Math.max(0, Math.round((remainingDays / totalDays) * LESSONS_PER_YEAR))
  );
  const prorated = Math.round(pricePerLesson * lessonsRemaining * 100) / 100;

  return {
    enrollmentId: enrollment.id,
    annualBase,
    pricePerLesson,
    lessonsTotal: LESSONS_PER_YEAR,
    lessonsRemaining,
    prorated,
    source,
  };
};
