export const ENSEMBLE_TYPE_LABELS: Record<string, string> = {
  // הרכבים ייצוגיים גדולים
  representative_orchestra: "תזמורת ייצוגית",
  representative_big_band: "ביג-בנד ייצוגי",
  representative_choir: "מקהלה ייצוגית",
  // הרכבי פופ-רוק ייצוגיים
  pop_rock_10: "הרכב י",
  pop_rock_11: "הרכב י״א",
  pop_rock_12: "הרכב י״ב",
  // הרכב קאמרי ייצוגי
  representative_chamber: "הרכב קאמרי ייצוגי",
  // הרכבים צעירים
  young_orchestra: "תזמורת צעירה",
  young_big_band: "ביג-בנד צעיר",
  young_choir: "מקהלה צעירה",
  // הרכבי פופ-רוק צעירים
  pop_rock_7: "הרכב ז",
  pop_rock_8: "הרכב ח",
  pop_rock_9: "הרכב ט",
  // הרכב קאמרי צעיר
  young_chamber: "הרכב קאמרי צעיר",
  // ערכים ישנים (לתאימות לאחור)
  orchestra: "תזמורת",
  big_band: "ביג-בנד",
  choir: "מקהלה",
  large_ensemble: "הרכב גדול",
  small_ensemble: "הרכב קטן",
  chamber_ensemble: "הרכב קאמרי",
};

export const ENSEMBLE_TYPE_GROUPS: { label: string; types: string[] }[] = [
  {
    label: "הרכבים ייצוגיים גדולים",
    types: ["representative_orchestra", "representative_big_band", "representative_choir"],
  },
  {
    label: "הרכבי פופ-רוק ייצוגיים",
    types: ["pop_rock_10", "pop_rock_11", "pop_rock_12"],
  },
  {
    label: "הרכב קאמרי ייצוגי",
    types: ["representative_chamber"],
  },
  {
    label: "הרכבים צעירים",
    types: ["young_orchestra", "young_big_band", "young_choir"],
  },
  {
    label: "הרכבי פופ-רוק צעירים",
    types: ["pop_rock_7", "pop_rock_8", "pop_rock_9"],
  },
  {
    label: "הרכב קאמרי צעיר",
    types: ["young_chamber"],
  },
];

export const ENSEMBLE_STAFF_ROLE_LABELS: Record<string, string> = {
  conductor: "מנצח",
  instructor: "מנחה",
  piano_accompanist: "ליווי פסנתר",
  vocal_accompanist: "ליווי ווקאלי",
};

export const ENSEMBLE_TYPES = ENSEMBLE_TYPE_GROUPS.flatMap((g) => g.types);
export const ENSEMBLE_STAFF_ROLES = Object.keys(ENSEMBLE_STAFF_ROLE_LABELS);

export const DAYS_OF_WEEK_LABELS: Record<number, string> = {
  0: "ראשון",
  1: "שני",
  2: "שלישי",
  3: "רביעי",
  4: "חמישי",
  5: "שישי",
  6: "שבת",
};
