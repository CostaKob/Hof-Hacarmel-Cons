import { supabase } from "@/integrations/supabase/client";

export const FAMILY_ASSIGNMENT_TEMPLATE_KEY = "family_assignment";
export const ASSIGNMENT_NOTE_KEY = "assignment_default_note";
export const FALLBACK_ASSIGNMENT_NOTE = "השיעורים יתחילו בספטמבר עם תחילת שנת הלימודים";

/** ההערה שמופיעה כברירת מחדל בחלון שליחת ההודעה להורה */
export async function fetchDefaultAssignmentNote(): Promise<string> {
  const { data } = await supabase
    .from("message_templates")
    .select("body")
    .eq("key", ASSIGNMENT_NOTE_KEY)
    .maybeSingle();
  return data?.body || FALLBACK_ASSIGNMENT_NOTE;
}

export async function saveDefaultAssignmentNote(note: string): Promise<void> {
  const { error } = await supabase
    .from("message_templates")
    .upsert(
      { key: ASSIGNMENT_NOTE_KEY, name: "הערה ברירת מחדל לתחילת השיעורים", subject: "", body: note },
      { onConflict: "key" },
    );
  if (error) throw error;
}

export interface MessageTemplate {
  key: string;
  name: string;
  subject: string;
  body: string;
}

export const DEFAULT_TEMPLATES: Record<string, MessageTemplate> = {
  [FAMILY_ASSIGNMENT_TEMPLATE_KEY]: {
    key: FAMILY_ASSIGNMENT_TEMPLATE_KEY,
    name: "הודעת שיוך מורה + קישור לתשלום",
    subject: "שיוך מורה — {{children}}",
    body: [
      "שלום {{parent_name}},",
      "",
      "אנו שמחים לעדכן כי שויכו המורים הבאים:",
      "",
      "{{assignments}}",
      "{{payments}}",
      "{{note}}",
      "לכל שאלה ניתן לפנות:",
      "מייל: musichof@gmail.com",
      "טלפון משרד: 04-6299711",
      "וואטסאפ קורין: https://wa.me/972547467498",
      "",
      "בברכה,",
      "אולפן המוסיקה חוף הכרמל",
    ].join("\n"),
  },
};

export const TEMPLATE_VARIABLES: Record<string, Array<{ token: string; description: string }>> = {
  [FAMILY_ASSIGNMENT_TEMPLATE_KEY]: [
    { token: "{{parent_name}}", description: "שם ההורה" },
    { token: "{{children}}", description: "שמות הילדים (מופרדים בפסיק)" },
    { token: "{{assignments}}", description: "פירוט השיוכים — מורים, כלים, שלוחה ומשך שיעור" },
    { token: "{{payments}}", description: "פירוט התשלום וקישורי התשלום" },
    { token: "{{note}}", description: "ההערה החופשית שנכתבת לפני השליחה" },
  ],
};

export async function fetchMessageTemplate(key: string): Promise<MessageTemplate> {
  const fallback = DEFAULT_TEMPLATES[key];
  const { data } = await supabase
    .from("message_templates")
    .select("key,name,subject,body")
    .eq("key", key)
    .maybeSingle();
  if (!data) return fallback;
  return {
    key: data.key,
    name: data.name || fallback?.name || key,
    subject: data.subject || fallback?.subject || "",
    body: data.body || fallback?.body || "",
  };
}

export const SAMPLE_VARIABLE_VALUES: Record<string, Record<string, string>> = {
  [FAMILY_ASSIGNMENT_TEMPLATE_KEY]: {
    parent_name: "יעל כהן",
    children: "נועם כהן, מאיה כהן",
    assignments: [
      "— נועם כהן —",
      "לשיעורי גיטרה",
      "מורה: דני לוי",
      "פרטי קשר המורה: 0541234567",
      "https://wa.me/972541234567",
      "שלוחה: כרם מהר״ל",
      "משך שיעור: 30 דקות",
    ].join("\n"),
    payments: [
      "פירוט תשלום:",
      "    גיטרה — נועם כהן: 4,200 ₪",
      "    הנחת כלי שני: 210- ₪",
      "  סה״כ: 3,990 ₪",
      "  [לחצו כאן לתשלום](https://pay.example.com/abc123)",
      "ניתן לחלק עד 10 תשלומים ללא ריבית.",
    ].join("\n"),
    note: "השיעורים יתחילו בספטמבר עם תחילת שנת הלימודים",
  },
};

/** Converts markdown links to a WhatsApp/plain-text friendly form: "טקסט: url" */
export function markdownLinksToPlain(text: string): string {
  return text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1:\n$2");
}

/**
 * Prepares text for WhatsApp:
 * - drops bare wa.me links of teachers/office (the phone number is already shown as text),
 *   so the only remaining link is the payment link — this prevents WhatsApp from
 *   generating a preview/tap-target for the first link in the message.
 * - converts markdown links to "text:\nurl"
 */
export function prepareWhatsAppText(text: string): string {
  const cleaned = text
    .split("\n")
    .filter((line) => !/^\s*https?:\/\/wa\.me\/\S*\s*$/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
  return markdownLinksToPlain(cleaned).trim();
}

/** Splits a line into text/link segments for preview rendering */
export function parseInlineLinks(
  line: string,
): Array<{ type: "text" | "link"; text: string; href?: string }> {
  const re = /(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))|(https?:\/\/[^\s]+)/g;
  const out: Array<{ type: "text" | "link"; text: string; href?: string }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ type: "text", text: line.slice(last, m.index) });
    if (m[1]) {
      const inner = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(m[1]);
      if (inner) out.push({ type: "link", text: inner[1], href: inner[2] });
      else out.push({ type: "text", text: m[1] });
    } else if (m[2]) {
      out.push({ type: "link", text: m[2], href: m[2] });
    }
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ type: "text", text: line.slice(last) });
  return out;
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v ?? "");
  }
  // collapse 3+ consecutive newlines into two
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
