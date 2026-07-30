import { supabase } from "@/integrations/supabase/client";

export const FAMILY_ASSIGNMENT_TEMPLATE_KEY = "family_assignment";

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

export function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v ?? "");
  }
  // collapse 3+ consecutive newlines into two
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
