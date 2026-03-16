export const ENSEMBLE_TYPE_LABELS: Record<string, string> = {
  orchestra: "תזמורת",
  big_band: "ביג-בנד",
  choir: "מקהלה",
  large_ensemble: "הרכב גדול",
  small_ensemble: "הרכב קטן",
  chamber_ensemble: "הרכב קאמרי",
};

export const ENSEMBLE_STAFF_ROLE_LABELS: Record<string, string> = {
  conductor: "מנצח",
  instructor: "מנחה",
  piano_accompanist: "ליווי פסנתר",
  vocal_accompanist: "ליווי ווקאלי",
};

export const ENSEMBLE_TYPES = Object.keys(ENSEMBLE_TYPE_LABELS);
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
