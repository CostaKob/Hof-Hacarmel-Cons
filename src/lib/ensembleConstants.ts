export const ENSEMBLE_TYPE_LABELS: Record<string, string> = {
  representative_large: "הרכבים ייצוגיים",
  representative_pop_rock: "הרכבי פופ-רוק ייצוגיים",
  representative_chamber: "הרכב קאמרי ייצוגי",
  young_large: "הרכבים צעירים",
  young_pop_rock: "הרכבי פופ-רוק צעירים",
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
    label: "סוגי הרכבים",
    types: [
      "representative_large",
      "representative_pop_rock",
      "representative_chamber",
      "young_large",
      "young_pop_rock",
      "young_chamber",
    ],
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
