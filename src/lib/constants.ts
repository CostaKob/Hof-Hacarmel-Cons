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

export const STUDENT_STATUSES = ["פעיל", "הפסיק"] as const;

export function calcYearsOfPlaying(instrumentStartDate: string | null | undefined): number | null {
  if (!instrumentStartDate) return null;
  const start = new Date(instrumentStartDate);
  const now = new Date();
  const diff = (now.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return Math.max(0, Math.floor(diff));
}
