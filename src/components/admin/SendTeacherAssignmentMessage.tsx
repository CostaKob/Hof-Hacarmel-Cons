import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Mail, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: any;
  enrollments: any[];
  selectedYearId: string | null;
}

function normalizeWaPhone(phone?: string | null): string {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "").replace(/^0/, "");
}

function buildMessage(student: any, enrollments: any[], pendingPayment: any | null, extraNote: string): string {
  const parentName = student.parent_name || "הורה יקר";
  const lines: string[] = [];
  lines.push(`שלום ${parentName},`);
  lines.push("");
  lines.push(`אנו שמחים לעדכן כי שויכו המורים הבאים לתלמיד/ה ${student.first_name} ${student.last_name}:`);
  lines.push("");

  for (const e of enrollments) {
    const teacherName = `${e.teachers?.first_name ?? ""} ${e.teachers?.last_name ?? ""}`.trim();
    const teacherPhone = e.teachers?.phone ?? "";
    const waPhone = normalizeWaPhone(teacherPhone);
    lines.push(`לשיעורי ${e.instruments?.name ?? ""}`);
    lines.push(`מורה: ${teacherName}`);
    if (teacherPhone) lines.push(`פרטי קשר המורה: ${teacherPhone}`);
    if (waPhone) lines.push(`https://wa.me/972${waPhone}`);
    if (e.schools?.name) lines.push(`שלוחה: ${e.schools.name}`);
    if (e.lesson_duration_minutes) lines.push(`משך שיעור: ${e.lesson_duration_minutes} דקות`);
    lines.push("");
  }

  if (pendingPayment) {
    lines.push("פירוט תשלום:");
    const breakdown = (pendingPayment.enrollment_breakdown as any) || {};
    const breakdownLines: Array<{ description: string; amount: number }> = Array.isArray(breakdown.lines) ? breakdown.lines : [];
    for (const l of breakdownLines) {
      const amt = Number(l.amount) || 0;
      const formatted = amt >= 0 ? `${amt} ₪` : `${Math.abs(amt)}- ₪`;
      lines.push(`  ${l.description}: ${formatted}`);
    }
    lines.push(`סה״כ לתשלום: ${pendingPayment.amount} ₪`);
    lines.push("ניתן לחלק עד 10 תשלומים ללא ריבית.");
    lines.push("");
    if (pendingPayment.payment_link_url) {
      lines.push("לתשלום שכר הלימוד לחצו כאן:");
      lines.push(pendingPayment.payment_link_url);
      lines.push("");
    }
  }

  if (extraNote.trim()) {
    lines.push(extraNote.trim());
    lines.push("");
  }

  lines.push("לכל שאלה ניתן לפנות:");
  lines.push("מייל: musichof@gmail.com");
  lines.push("טלפון משרד: 04-6299711");
  lines.push("וואטסאפ קורין: https://wa.me/972547467498");
  lines.push("");
  lines.push("בברכה,");
  lines.push("אולפן המוסיקה חוף הכרמל");

  return lines.join("\n");
}

const SendTeacherAssignmentMessage = ({ open, onOpenChange, student, enrollments, selectedYearId }: Props) => {
  const { data: pendingPayment } = useQuery({
    queryKey: ["admin-student-pending-payment", student?.id, selectedYearId],
    queryFn: async () => {
      const { data } = await supabase
        .from("student_payments")
        .select("payment_link_url, amount, enrollment_breakdown")
        .eq("student_id", student.id)
        .eq("academic_year_id", selectedYearId!)
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
    enabled: open && !!student?.id && !!selectedYearId,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const defaultNote = useMemo(() => {
    return new Date().getMonth() < 8
      ? "השיעורים יתחילו בספטמבר עם תחילת שנת הלימודים"
      : "השיעורים יתחילו בהקדם האפשרי";
  }, []);

  const [extraNote, setExtraNote] = useState(defaultNote);
  const [message, setMessage] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);

  useEffect(() => {
    if (open) setExtraNote(defaultNote);
  }, [open, defaultNote]);

  useEffect(() => {
    if (!open) return;
    setMessage(buildMessage(student, enrollments, pendingPayment, extraNote));
  }, [open, student, enrollments, pendingPayment, extraNote]);

  const parentWa = normalizeWaPhone(student?.parent_phone);

  const sendWhatsApp = () => {
    if (!parentWa) {
      toast.error("אין מספר טלפון להורה");
      return;
    }
    window.open(`https://wa.me/972${parentWa}?text=${encodeURIComponent(message)}`, "_blank");
  };

  const sendEmail = async () => {
    if (!student.parent_email) {
      toast.error("אין כתובת מייל להורה");
      return;
    }
    setSendingEmail(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "plain-text",
          recipientEmail: student.parent_email,
          replyTo: "musichof@gmail.com",
          templateData: {
            subject: `שיוך מורה — ${student.first_name} ${student.last_name}`,
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
          <DialogDescription>
            ניתן לערוך את ההודעה לפני השליחה.
          </DialogDescription>
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
            <Label className="text-xs">תוכן ההודעה</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={18}
              className="rounded-xl font-mono text-xs"
              dir="rtl"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-xl">
            ביטול
          </Button>
          <Button
            onClick={sendEmail}
            disabled={sendingEmail || !student?.parent_email}
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

export default SendTeacherAssignmentMessage;
