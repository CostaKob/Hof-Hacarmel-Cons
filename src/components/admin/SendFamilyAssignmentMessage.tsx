import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  FAMILY_ASSIGNMENT_TEMPLATE_KEY,
  FALLBACK_ASSIGNMENT_NOTE,
  fetchDefaultAssignmentNote,
  saveDefaultAssignmentNote,
  fetchMessageTemplate,
  renderTemplate,
  prepareWhatsAppText,
  boldNoteForWhatsApp,
  parseInlineLinks,
} from "@/lib/messageTemplates";
import { shortenUrls } from "@/lib/shortLink";
import { openWhatsApp } from "@/lib/whatsapp";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Mail, MessageCircle, List } from "lucide-react";
import { toast } from "sonner";

interface FamilyLike {
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
  partner_name?: string | null;
  partner_phone?: string | null;
  partner_email?: string | null;
}

interface ChildLike {
  id: string;
  first_name: string;
  last_name: string;
}

interface EnrollmentLike {
  student_id: string;
  is_active?: boolean;
  instruments?: { name?: string | null } | null;
  schools?: { name?: string | null } | null;
  teachers?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
  lesson_duration_minutes?: number | null;
}

interface PendingPaymentLike {
  id: string;
  amount: number;
  payment_link_url: string | null;
  enrollment_breakdown: any;
  student_id?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  family: FamilyLike;
  children: ChildLike[];
  enrollments: EnrollmentLike[];
  pendingPayments: PendingPaymentLike[];
}

function normalizeWaPhone(phone?: string | null): string {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "").replace(/^0/, "");
}

function buildAssignmentsBlock(children: ChildLike[], enrollments: EnrollmentLike[]): string {
  const lines: string[] = [];
  for (const c of children) {
    const childEnrollments = enrollments.filter(
      (e) => e.student_id === c.id && e.is_active !== false,
    );
    if (childEnrollments.length === 0) continue;
    lines.push(`— ${c.first_name} ${c.last_name} —`);
    for (const e of childEnrollments) {
      const teacherName = `${e.teachers?.first_name ?? ""} ${e.teachers?.last_name ?? ""}`.trim();
      const teacherPhone = e.teachers?.phone ?? "";
      const waPhone = normalizeWaPhone(teacherPhone);
      lines.push(`לשיעורי ${e.instruments?.name ?? ""}`);
      if (teacherName) lines.push(`מורה: ${teacherName}`);
      if (teacherPhone) lines.push(`פרטי קשר המורה: ${teacherPhone}`);
      if (waPhone) lines.push(`https://wa.me/972${waPhone}`);
      if (e.schools?.name) lines.push(`שלוחה: ${e.schools.name}`);
      if (e.lesson_duration_minutes) lines.push(`משך שיעור: ${e.lesson_duration_minutes} דקות`);
      lines.push("");
    }
  }
  return lines.join("\n").trim();
}

function buildPaymentsBlock(
  pendingPayments: PendingPaymentLike[],
  shortLinks: Record<string, string> = {},
): string {
  if (pendingPayments.length === 0) return "";
  const lines: string[] = ["פירוט תשלום:"];
  let totalAll = 0;
  for (const p of pendingPayments) {
    const bd: any = p.enrollment_breakdown || {};
    const payerLabel: string | null = bd?.payerLabel ?? null;
    const breakdownLines: Array<{ description: string; amount: number }> =
      Array.isArray(bd.lines) ? bd.lines : [];
    if (payerLabel) lines.push(`  ${payerLabel}:`);
    for (const l of breakdownLines) {
      const amt = Number(l.amount) || 0;
      const formatted = amt >= 0 ? `${amt} ₪` : `${Math.abs(amt)}- ₪`;
      lines.push(`    ${l.description}: ${formatted}`);
    }
    lines.push(`  סה״כ: ${Number(p.amount).toLocaleString("he-IL")} ₪`);
    if (p.payment_link_url) {
      const url = shortLinks[p.payment_link_url] || p.payment_link_url;
      lines.push(`  [לחצו כאן לתשלום](${url})`);
    }
    lines.push("");
    totalAll += Number(p.amount) || 0;
  }
  if (pendingPayments.length > 1) {
    lines.push(`סה״כ לתשלום: ${totalAll.toLocaleString("he-IL")} ₪`);
  }
  lines.push("ניתן לחלק עד 10 תשלומים ללא ריבית.");
  return lines.join("\n").trim();
}

const SendFamilyAssignmentMessage = ({
  open,
  onOpenChange,
  family,
  children,
  enrollments,
  pendingPayments,
}: Props) => {
  const { data: defaultNote, refetch: refetchNote } = useQuery({
    queryKey: ["assignment-default-note"],
    queryFn: fetchDefaultAssignmentNote,
    initialData: FALLBACK_ASSIGNMENT_NOTE,
  });

  const [extraNote, setExtraNote] = useState(defaultNote);
  const [savingNote, setSavingNote] = useState(false);

  useEffect(() => {
    if (open) setExtraNote(defaultNote);
  }, [open, defaultNote]);

  const saveNoteAsDefault = async () => {
    setSavingNote(true);
    try {
      await saveDefaultAssignmentNote(extraNote.trim());
      await refetchNote();
      toast.success("ההערה נשמרה כברירת מחדל");
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בשמירה");
    } finally {
      setSavingNote(false);
    }
  };
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const recipients = useMemo(
    () =>
      [
        {
          key: "parent",
          label: family.parent_name || "הורה 1",
          phone: family.parent_phone || null,
          email: family.parent_email || null,
        },
        {
          key: "partner",
          label: family.partner_name || "הורה 2",
          phone: family.partner_phone || null,
          email: family.partner_email || null,
        },
      ].filter((r) => r.phone || r.email),
    [family],
  );

  const [recipientKey, setRecipientKey] = useState<string>("parent");

  useEffect(() => {
    if (open) setRecipientKey(recipients[0]?.key ?? "parent");
  }, [open, recipients]);

  const recipient = recipients.find((r) => r.key === recipientKey) ?? recipients[0];

  const { data: template } = useQuery({
    queryKey: ["message-template", FAMILY_ASSIGNMENT_TEMPLATE_KEY],
    queryFn: () => fetchMessageTemplate(FAMILY_ASSIGNMENT_TEMPLATE_KEY),
  });

  useEffect(() => {
    if (open) setExtraNote(defaultNote);
  }, [open, defaultNote]);

  const childrenSubject = children.map((c) => `${c.first_name} ${c.last_name}`).join(", ");

  const [shortLinks, setShortLinks] = useState<Record<string, string>>({});
  const payLinkKey = pendingPayments.map((p) => p.payment_link_url || "").join("|");

  useEffect(() => {
    let cancelled = false;
    if (!open) {
      setShortLinks({});
      return;
    }
    shortenUrls(pendingPayments.map((p) => p.payment_link_url)).then((map) => {
      if (!cancelled) setShortLinks(map);
    });
    return () => {
      cancelled = true;
    };
  }, [open, payLinkKey]);

  useEffect(() => {
    if (!open || !template) return;
    setMessage(
      renderTemplate(template.body, {
        parent_name: family.parent_name || "הורה יקר",
        children: childrenSubject,
        assignments: buildAssignmentsBlock(children, enrollments),
        payments: buildPaymentsBlock(pendingPayments, shortLinks),
        note: extraNote.trim(),
      }),
    );
  }, [open, template, family, children, enrollments, pendingPayments, extraNote, childrenSubject, shortLinks]);

  const parentWa = normalizeWaPhone(recipient?.phone);

  useEffect(() => {
    if (!open) return;
    setSubject(
      renderTemplate(template?.subject || "שיוך מורה — {{children}}", {
        children: childrenSubject,
        parent_name: family.parent_name || "",
      }),
    );
  }, [open, template, childrenSubject, family.parent_name]);

  const sendWhatsApp = () => {
    if (!parentWa) {
      toast.error("אין מספר טלפון להורה");
      return;
    }
    openWhatsApp(
      `972${parentWa}`,
      boldNoteForWhatsApp(prepareWhatsAppText(message), extraNote.trim()),
    );
  };

  const sendEmail = async () => {
    if (!recipient?.email) {
      toast.error("אין כתובת מייל להורה");
      return;
    }
    setSendingEmail(true);
    try {
      const noteText = extraNote.trim();
      const emailBody = noteText
        ? message.split("\n").map((l) => (noteText.split("\n").some((n) => n.trim() && l.trim() === n.trim()) ? `[[HL]]${l}` : l)).join("\n")
        : message;
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "plain-text",
          recipientEmail: recipient.email,
          replyTo: "musichof@gmail.com",
          templateData: {
            subject: subject.trim() || "שיוך מורה",
            body: emailBody,
          },
        },
      });
      if (error) throw error;
      toast.success("ההודעה נשלחה למייל ההורה");
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בשליחת המייל");
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>שליחת הודעת שיוך מורה להורה</DialogTitle>
          <DialogDescription>ניתן לערוך את ההודעה לפני השליחה.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {recipients.length > 1 && (
            <div className="space-y-1">
              <Label className="text-xs">שליחה אל</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {recipients.map((r) => (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => setRecipientKey(r.key)}
                    className={`rounded-xl border p-3 text-right transition ${
                      recipientKey === r.key
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/50"
                    }`}
                  >
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">
                      {r.phone || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate" dir="ltr">
                      {r.email || "—"}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">הערה לתחילת השיעורים</Label>
              {extraNote.trim() !== (defaultNote ?? "").trim() && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 rounded-lg px-2 text-xs"
                  disabled={savingNote}
                  onClick={saveNoteAsDefault}
                >
                  {savingNote ? "שומר..." : "שמור כברירת מחדל"}
                </Button>
              )}
            </div>
            <Textarea
              value={extraNote}
              onChange={(e) => setExtraNote(e.target.value)}
              rows={2}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">נושא המייל</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="h-11 rounded-xl"
              dir="rtl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">תוכן ההודעה</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={20}
              className="rounded-xl font-mono text-xs"
              dir="rtl"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">תצוגה מקדימה (כפי שיתקבל במייל)</Label>
            <div className="rounded-xl border bg-background p-4 text-sm leading-6" dir="rtl">
                {message.split("\n").map((line, i) => (
                <p key={i} className="min-h-[1.25rem]">
                  {parseInlineLinks(line).map((part, j) =>
                    part.type === "link" ? (
                      <a
                        key={j}
                        href={part.href}
                        target="_blank"
                        rel="noreferrer"
                        className={
                          part.text === "לחצו כאן לתשלום"
                            ? "font-bold text-primary underline text-lg"
                            : "font-bold text-primary underline"
                        }
                      >
                        {part.text}
                      </a>
                    ) : (
                      <span key={j}>{part.text}</span>
                    ),
                  )}
                </p>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl">
            ביטול
          </Button>
          <Button
            onClick={sendEmail}
            disabled={sendingEmail || !recipient?.email}
            className="h-11 rounded-xl"
            variant="outline"
          >
            <Mail className="h-4 w-4" />
            {sendingEmail ? "שולח..." : "שלח במייל"}
          </Button>
          <Button
            onClick={sendWhatsApp}
            disabled={!parentWa}
            className="h-11 rounded-xl bg-green-600 hover:bg-green-700 text-white"
          >
            <MessageCircle className="h-4 w-4" />
            שלח בוואטסאפ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendFamilyAssignmentMessage;
