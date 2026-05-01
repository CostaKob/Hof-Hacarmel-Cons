export type InstrumentCondition = "available" | "loaned" | "in_repair" | "unusable";

export const CONDITION_LABELS: Record<InstrumentCondition, string> = {
  available: "זמין",
  loaned: "מושאל",
  in_repair: "בתיקון",
  unusable: "לא שמיש",
};

export const CONDITION_COLORS: Record<InstrumentCondition, string> = {
  available: "bg-green-100 text-green-800 border-green-200",
  loaned: "bg-blue-100 text-blue-800 border-blue-200",
  in_repair: "bg-amber-100 text-amber-800 border-amber-200",
  unusable: "bg-destructive/10 text-destructive border-destructive/20",
};

export const CONDITION_OPTIONS: { value: InstrumentCondition; label: string }[] = [
  { value: "available", label: "זמין" },
  { value: "loaned", label: "מושאל" },
  { value: "in_repair", label: "בתיקון" },
  { value: "unusable", label: "לא שמיש" },
];
