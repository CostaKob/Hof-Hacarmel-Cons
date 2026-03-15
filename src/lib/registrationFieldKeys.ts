// Known field keys that map to registrations table columns
export const KNOWN_FIELD_KEYS = [
  { key: "student_full_name", label: "שם מלא תלמיד/ה" },
  { key: "student_national_id", label: "ת.ז. תלמיד/ה" },
  { key: "gender", label: "לשון פנייה" },
  { key: "student_status", label: "סטטוס תלמיד (חדש/ממשיך)" },
  { key: "branch_school_name", label: "שלוחת לימודים" },
  { key: "student_school_text", label: "בית ספר" },
  { key: "grade", label: "כיתה" },
  { key: "city", label: "ישוב" },
  { key: "student_phone", label: "טלפון תלמיד/ה" },
  { key: "requested_instruments", label: "כלי נגינה מבוקש" },
  { key: "requested_lesson_duration", label: "משך שיעור" },
  { key: "parent_name", label: "שם הורה" },
  { key: "parent_national_id", label: "ת.ז. הורה" },
  { key: "parent_phone", label: "טלפון הורה" },
  { key: "parent_email", label: 'דוא"ל הורה' },
  { key: "notes", label: "הערות" },
] as const;

export const KNOWN_KEYS_SET = new Set<string>(KNOWN_FIELD_KEYS.map((f) => f.key));

export const FIELD_TYPES = [
  { value: "text", label: "טקסט" },
  { value: "email", label: 'דוא"ל' },
  { value: "phone", label: "טלפון" },
  { value: "number", label: "מספר" },
  { value: "textarea", label: "טקסט ארוך" },
  { value: "select", label: "בחירה (רשימה)" },
  { value: "multiselect", label: "בחירה מרובה" },
  { value: "radio", label: "בחירה (כפתורי רדיו)" },
] as const;

export const DATA_SOURCES = [
  { value: "", label: "ללא — אפשרויות ידניות" },
  { value: "instruments", label: "כלי נגינה (מהמערכת)" },
  { value: "schools", label: "שלוחות/בתי ספר (מהמערכת)" },
] as const;
