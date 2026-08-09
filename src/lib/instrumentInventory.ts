export type InstrumentCondition = "available" | "loaned" | "in_repair" | "needs_repair" | "missing";

export const CONDITION_LABELS: Record<InstrumentCondition, string> = {
  available: "זמין",
  loaned: "מושאל",
  in_repair: "בתיקון",
  needs_repair: "דרוש תיקון",
  missing: "לא מאותר",
};

export const CONDITION_COLORS: Record<InstrumentCondition, string> = {
  available: "bg-green-100 text-green-800 border-green-200",
  loaned: "bg-blue-100 text-blue-800 border-blue-200",
  in_repair: "bg-amber-100 text-amber-800 border-amber-200",
  needs_repair: "bg-destructive/10 text-destructive border-destructive/20",
  missing: "bg-muted text-muted-foreground border-border",
};

export const CONDITION_OPTIONS: { value: InstrumentCondition; label: string }[] = [
  { value: "available", label: "זמין" },
  { value: "loaned", label: "מושאל" },
  { value: "in_repair", label: "בתיקון" },
  { value: "needs_repair", label: "דרוש תיקון" },
  { value: "missing", label: "לא מאותר" },
];

/* ── Axis 1: location / possession ───────────────────────────── */
export type InstrumentLocationStatus = "available" | "loaned" | "missing";

export const LOCATION_OPTIONS: { value: InstrumentLocationStatus; label: string }[] = [
  { value: "available", label: "זמין" },
  { value: "loaned", label: "מושאל" },
  { value: "missing", label: "לא מאותר" },
];

export const LOCATION_LABELS: Record<InstrumentLocationStatus, string> = {
  available: "זמין",
  loaned: "מושאל",
  missing: "לא מאותר",
};

/* ── Axis 2: repair state ────────────────────────────────────── */
export type InstrumentRepairState = "ok" | "needs_repair" | "in_repair" | "unusable";

export const REPAIR_STATE_LABELS: Record<InstrumentRepairState, string> = {
  ok: "תקין",
  needs_repair: "דרוש תיקון / השלמה",
  in_repair: "בתיקון",
  unusable: "לא שמיש",
};

export const REPAIR_STATE_COLORS: Record<InstrumentRepairState, string> = {
  ok: "bg-green-100 text-green-800 border-green-200",
  needs_repair: "bg-destructive/10 text-destructive border-destructive/20",
  in_repair: "bg-amber-100 text-amber-800 border-amber-200",
  unusable: "bg-neutral-800 text-neutral-100 border-neutral-700",
};

export const REPAIR_STATE_OPTIONS: { value: InstrumentRepairState; label: string }[] = [
  { value: "ok", label: "תקין" },
  { value: "needs_repair", label: "דרוש תיקון / השלמה" },
  { value: "in_repair", label: "בתיקון" },
  { value: "unusable", label: "לא שמיש" },
];

/* ── Annual physical check ───────────────────────────────────── */
export type InstrumentCheckResult = "ok" | "needs_repair" | "needs_completion" | "missing" | "unusable";

export const CHECK_RESULT_LABELS: Record<InstrumentCheckResult, string> = {
  ok: "תקין",
  needs_repair: "דרוש תיקון",
  needs_completion: "דרוש השלמה",
  missing: "לא נמצא",
  unusable: "לא שמיש",
};

export const CHECK_RESULT_COLORS: Record<InstrumentCheckResult, string> = {
  ok: "bg-green-100 text-green-800 border-green-200",
  needs_repair: "bg-destructive/10 text-destructive border-destructive/20",
  needs_completion: "bg-amber-100 text-amber-800 border-amber-200",
  missing: "bg-muted text-muted-foreground border-border",
  unusable: "bg-neutral-800 text-neutral-100 border-neutral-700",
};


// Global instrument size list
export const INSTRUMENT_SIZES = ["1/8", "1/4", "1/2", "3/4", "4/4"] as const;
export type InstrumentSize = typeof INSTRUMENT_SIZES[number];

// Map Hebrew labels (used in Excel imports / display) to canonical values
export const SIZE_LABEL_TO_VALUE: Record<string, string> = {
  "1/8": "1/8", "שמינית": "1/8", "1\\8": "1/8",
  "1/4": "1/4", "רבע": "1/4", "1\\4": "1/4",
  "1/2": "1/2", "חצי": "1/2", "1\\2": "1/2",
  "3/4": "3/4", "שלושת רבעי": "3/4", "שלושת רבע": "3/4", "3\\4": "3/4",
  "4/4": "4/4", "שלם": "4/4", "מלא": "4/4",
};

export const normalizeSize = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const t = String(raw).trim();
  if (!t) return null;
  return SIZE_LABEL_TO_VALUE[t] || t;
};

// Map Hebrew condition labels (Excel imports) to enum values
export const CONDITION_LABEL_TO_VALUE: Record<string, InstrumentCondition> = {
  "זמין": "available",
  "מושאל": "loaned",
  "בתיקון": "in_repair",
  "דרוש תיקון": "needs_repair",
  "לא מאותר": "missing",
  "available": "available",
  "loaned": "loaned",
  "in_repair": "in_repair",
  "needs_repair": "needs_repair",
  "missing": "missing",
};
