/**
 * Lesson counting rules used consistently across teacher and admin summary views.
 *
 * For each reported line status:
 *   present            → 1
 *   double_lesson       → 2
 *   justified_absence   → 0
 *   unjustified_absence → 1
 *   vacation            → 0
 */

export const LESSON_WEIGHT: Record<string, number> = {
  present: 1,
  double_lesson: 2,
  justified_absence: 0,
  unjustified_absence: 1,
  vacation: 0,
};

export interface StatusCounts {
  present: number;
  double_lesson: number;
  justified_absence: number;
  unjustified_absence: number;
  vacation: number;
}

export interface EnrollmentSummaryRow {
  enrollmentId: string;
  studentName: string;
  teacherName?: string;
  instrumentName: string;
  schoolName: string;
  lessonDuration: number;
  isActive: boolean;
  counts: StatusCounts;
  totalLessons: number;
  expectedLessons: number;
}

export function emptyStatusCounts(): StatusCounts {
  return { present: 0, double_lesson: 0, justified_absence: 0, unjustified_absence: 0, vacation: 0 };
}

export function calcTotal(c: StatusCounts): number {
  return (
    c.present * LESSON_WEIGHT.present +
    c.double_lesson * LESSON_WEIGHT.double_lesson +
    c.justified_absence * LESSON_WEIGHT.justified_absence +
    c.unjustified_absence * LESSON_WEIGHT.unjustified_absence +
    c.vacation * LESSON_WEIGHT.vacation
  );
}

const EXPECTED_MONTHS_MAP: Record<number, number> = {
  9: 10, 10: 9, 11: 8, 12: 7,
  1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1,
};

export function getExpectedLessons(startDate: string | null | undefined): number {
  if (!startDate) return 32;
  const month = new Date(startDate).getMonth() + 1;
  const months = EXPECTED_MONTHS_MAP[month] ?? 0;
  return Math.round(months * 3.2);
}

export const STATUS_LABELS_HE: Record<string, string> = {
  present: "נוכחות",
  double_lesson: "שיעור כפול",
  justified_absence: "היעדרות מוצדקת",
  unjustified_absence: "היעדרות לא מוצדקת",
  vacation: "חופש",
};

export type RateStatus = "good" | "medium" | "bad" | "unknown";

export function getMonthlyRate(totalLessons: number, startDate: string | null | undefined): { rate: number; status: RateStatus } {
  if (!startDate) return { rate: 0, status: "unknown" };
  const start = new Date(startDate);
  const today = new Date();
  let monthsPassed =
    (today.getFullYear() - start.getFullYear()) * 12 +
    (today.getMonth() - start.getMonth()) + 1;
  if (monthsPassed <= 0) return { rate: 0, status: "unknown" };
  const rate = totalLessons / monthsPassed;
  let status: RateStatus = "good";
  if (rate < 2.5) status = "bad";
  else if (rate < 3.2) status = "medium";
  return { rate, status };
}

export function getRateColorClass(status: RateStatus): string {
  if (status === "good") return "text-green-600";
  if (status === "medium") return "text-yellow-500";
  if (status === "bad") return "text-red-500";
  return "text-muted-foreground";
}
