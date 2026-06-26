export const ENSEMBLE_TYPE_LABELS: Record<string, string> = {
  // הרכבים ייצוגיים
  representative_orchestra: "תזמורת ייצוגית",
  representative_big_band: "ביג-בנד ייצוגי",
  representative_choir: "מקהלה ייצוגית",
  representative_pop_rock: "הרכב פופ-רוק ייצוגי",
  representative_jazz: "הרכב ג׳אז ייצוגי",
  representative_vocal: "הרכב קולי ייצוגי",
  representative_chamber: "הרכב קאמרי ייצוגי",
  // הרכבים צעירים
  young_orchestra: "תזמורת צעירה",
  young_big_band: "ביג-בנד צעיר",
  young_choir: "מקהלה צעירה",
  young_pop_rock: "הרכב פופ-רוק צעיר",
  young_jazz: "הרכב ג׳אז צעיר",
  young_vocal: "הרכב קולי צעיר",
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
    label: "הרכבים ייצוגיים",
    types: [
      "representative_orchestra",
      "representative_big_band",
      "representative_choir",
      "representative_pop_rock",
      "representative_jazz",
      "representative_vocal",
      "representative_chamber",
    ],
  },
  {
    label: "הרכבים צעירים",
    types: [
      "young_orchestra",
      "young_big_band",
      "young_choir",
      "young_pop_rock",
      "young_jazz",
      "young_vocal",
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
