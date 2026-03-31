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

export const STATUS_LABELS_HE: Record<string, string> = {
  present: "נוכחות",
  double_lesson: "שיעור כפול",
  justified_absence: "היעדרות מוצדקת",
  unjustified_absence: "היעדרות לא מוצדקת",
  vacation: "חופש",
};
