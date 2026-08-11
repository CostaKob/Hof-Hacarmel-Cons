import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  FAMILY_ASSIGNMENT_TEMPLATE_KEY,
  fetchMessageTemplate,
  renderTemplate,
  prepareWhatsAppText,
  parseInlineLinks,
} from "@/lib/messageTemplates";
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
import { Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";

interface FamilyLike {
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
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
  const defaultNote = useMemo(() => {
    return new Date().getMonth() < 8
      ? "השיעורים יתחילו בספטמבר עם תחילת שנת הלימודים"
      : "השיעורים יתחילו בהקדם האפשרי";
  }, []);

  const [extraNote, setExtraNote] = useState(defaultNote);
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  const { data: template } = useQuery({
    queryKey: ["message-template", FAMILY_ASSIGNMENT_TEMPLATE_KEY],
    queryFn: () => fetchMessageTemplate(FAMILY_ASSIGNMENT_TEMPLATE_KEY),
  });

  useEffect(() => {
    if (open) setExtraNote(defaultNote);
  }, [open, defaultNote]);

  const childrenSubject = children.map((c) => `${c.first_name} ${c.last_name}`).join(", ");

  useEffect(() => {
    if (!open || !template) return;
    setMessage(
      renderTemplate(template.body, {
        parent_name: family.parent_name || "הורה יקר",
        children: childrenSubject,
        assignments: buildAssignmentsBlock(children, enrollments),
        payments: buildPaymentsBlock(pendingPayments),
        note: extraNote.trim(),
      }),
    );
  }, [open, template, family, children, enrollments, pendingPayments, extraNote, childrenSubject]);

  const parentWa = normalizeWaPhone(family.parent_phone);

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
    window.open(
      `https://wa.me/972${parentWa}?text=${encodeURIComponent(prepareWhatsAppText(message))}`,
      "_blank",
    );
  };

  const sendEmail = async () => {
    if (!family.parent_email) {
      toast.error("אין כתובת מייל להורה");
      return;
    }
    setSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "plain-text",
          recipientEmail: family.parent_email,
          replyTo: "musichof@gmail.com",
          templateData: {
            subject: subject.trim() || "שיוך מורה",
            body: message,
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
          <div className="space-y-1">
            <Label className="text-xs">הערה לתחילת השיעורים</Label>
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
            disabled={sendingEmail || !family.parent_email}
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
