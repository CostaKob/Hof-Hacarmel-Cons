export type InstrumentCondition = "available" | "loaned" | "in_repair" | "needs_repair";

export const CONDITION_LABELS: Record<InstrumentCondition, string> = {
  available: "זמין",
  loaned: "מושאל",
  in_repair: "בתיקון",
  needs_repair: "דרוש תיקון",
};

export const CONDITION_COLORS: Record<InstrumentCondition, string> = {
  available: "bg-green-100 text-green-800 border-green-200",
  loaned: "bg-blue-100 text-blue-800 border-blue-200",
  in_repair: "bg-amber-100 text-amber-800 border-amber-200",
  needs_repair: "bg-destructive/10 text-destructive border-destructive/20",
};

export const CONDITION_OPTIONS: { value: InstrumentCondition; label: string }[] = [
  { value: "available", label: "זמין" },
  { value: "loaned", label: "מושאל" },
  { value: "in_repair", label: "בתיקון" },
  { value: "needs_repair", label: "דרוש תיקון" },
];

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
  "available": "available",
  "loaned": "loaned",
  "in_repair": "in_repair",
  "needs_repair": "needs_repair",
};
