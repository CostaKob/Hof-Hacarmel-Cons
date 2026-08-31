export const GRADES = [
  "א", "ב", "ג", "ד", "ה", "ו",
  "ז", "ח", "ט", "י", "יא", "יב",
  "בוגר",
] as const;

export const GRADE_PROMOTION: Record<string, string | null> = {
  "א": "ב",
  "ב": "ג",
  "ג": "ד",
  "ד": "ה",
  "ה": "ו",
  "ו": "ז",
  "ז": "ח",
  "ח": "ט",
  "ט": "י",
  "י": "יא",
  "יא": "יב",
  "יב": null,
  "בוגר": "בוגר",
};

export const PLAYING_LEVELS = ["א", "ב", "ג"] as const;

export const STUDENT_STATUSES = ["פעיל", "הפסיק", "לא ימשיך"] as const;

/** Statuses that take a student out of the active / "not yet registered" lists */
export const INACTIVE_STUDENT_STATUSES = ["הפסיק", "לא ימשיך"] as const;

export function isInactiveStudentStatus(status?: string | null): boolean {
  return (INACTIVE_STUDENT_STATUSES as readonly string[]).includes(status ?? "");
}

export function calcYearsOfPlaying(instrumentStartDate: string | null | undefined): number | null {
  if (!instrumentStartDate) return null;
  const start = new Date(instrumentStartDate);
  const now = new Date();
  const diff = (now.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.floor(diff));
}

/** שם המורה הוירטואלי עבור תלמידי חוץ המשתתפים בהרכבים בלבד (ללא שיעור פרטי). */
export const NO_TEACHER_NAME = "ללא מורה";

/** שיוך למורה "ללא מורה" — תלמיד חוץ בהרכב; מתעלמים ממנו בדוחות כספיים. */
export function isNoTeacherEnrollment(e: any): boolean {
  const t = e?.teachers;
  return !!t && `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim() === NO_TEACHER_NAME;
}
