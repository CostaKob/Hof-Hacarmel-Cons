import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { Copy, MessageCircle, CopyCheck, Info } from "lucide-react";

interface StudentData {
  id: string;
  first_name: string;
  last_name: string;
  parent_name?: string | null;
  parent_phone?: string | null;
  enrollments?: Array<{
    instruments?: { name: string } | null;
  }>;
  registration_token?: string;
}

interface WhatsAppLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  students: StudentData[];
  nextYear: { id: string; name: string } | null;
  baseUrl: string;
}

const DEFAULT_TEMPLATE = `שלום {parent_name}, לקראת שנת הלימודים {year_name}, נשמח לחידוש הרישום עבור {student_name} ללימודי {instrument}. ניתן לבצע זאת בקישור המצורף (הפרטים כבר מולאו): {link}`;

const PLACEHOLDERS = [
  { key: "{student_name}", label: "שם תלמיד/ה" },
  { key: "{parent_name}", label: "שם הורה" },
  { key: "{instrument}", label: "כלי נגינה" },
  { key: "{year_name}", label: "שם שנת לימודים" },
  { key: "{link}", label: "קישור רישום" },
];

function buildMessage(
  template: string,
  student: StudentData,
  yearName: string,
  link: string
): string {
  const studentName = `${student.first_name} ${student.last_name}`;
  const parentName = student.parent_name?.trim() || studentName;
  const instrument =
    student.enrollments
      ?.map((e) => e.instruments?.name)
      .filter(Boolean)
      .join(", ") || "מוסיקה";

  return template
    .replace(/{student_name}/g, studentName)
    .replace(/{parent_name}/g, parentName)
    .replace(/{instrument}/g, instrument)
    .replace(/{year_name}/g, yearName)
    .replace(/{link}/g, link);
}

function formatPhoneForWhatsApp(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  if (digits.startsWith("972")) return digits;
  return digits;
}

const WhatsAppLinkDialog = ({
  open,
  onOpenChange,
  students,
  nextYear,
  baseUrl,
}: WhatsAppLinkDialogProps) => {
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const yearName = nextYear?.name || "השנה הבאה";

  // Fetch existing registration tokens for these students + next year
  const studentIds = students.map((s) => s.id);
  const { data: existingTokens = [] } = useQuery({
    queryKey: ["registration-tokens", nextYear?.id, studentIds],
    enabled: open && !!nextYear?.id && studentIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("registrations")
        .select("existing_student_id, registration_token")
        .eq("academic_year_id", nextYear!.id)
        .in("existing_student_id", studentIds)
        .not("registration_token", "is", null);
      return data ?? [];
    },
  });

  const tokenMap = useMemo(() => {
    const map = new Map<string, string>();
    existingTokens.forEach((r: any) => {
      if (r.existing_student_id && r.registration_token) {
        map.set(r.existing_student_id, r.registration_token);
      }
    });
    return map;
  }, [existingTokens]);

  const studentMessages = useMemo(() => {
    return students.map((s) => {
      const token = s.registration_token || "";
      const link = token
        ? `${baseUrl}/register?yearId=${nextYear?.id || ""}&token=${token}`
        : `${baseUrl}/register?yearId=${nextYear?.id || ""}`;
      const message = buildMessage(template, s, yearName, link);
      const waPhone = formatPhoneForWhatsApp(s.parent_phone);
      const waLink = waPhone
        ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
        : "";
      return { student: s, message, waLink, hasPhone: !!waPhone };
    });
  }, [students, template, yearName, nextYear, baseUrl]);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("הועתק!");
  };

  const handleCopyAll = async () => {
    const allLines = studentMessages
      .map(
        (m) =>
          `${m.student.first_name} ${m.student.last_name}\t${m.student.parent_phone || ""}\t${m.message}`
      )
      .join("\n");
    await navigator.clipboard.writeText(allLines);
    toast.success(`${studentMessages.length} הודעות הועתקו ללוח!`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5 text-green-600" />
            יצירת הודעות WhatsApp — {yearName}
          </DialogTitle>
        </DialogHeader>

        {/* Template editor */}
        <div className="space-y-2">
          <Label className="text-sm font-semibold">תבנית הודעה</Label>
          <div className="flex flex-wrap gap-1.5 mb-1">
            {PLACEHOLDERS.map((p) => (
              <Badge
                key={p.key}
                variant="outline"
                className="text-xs cursor-pointer hover:bg-primary/10"
                onClick={() => setTemplate((prev) => prev + " " + p.key)}
              >
                {p.label}: <code className="mr-1 text-primary">{p.key}</code>
              </Badge>
            ))}
          </div>
          <Textarea
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
            className="min-h-[100px] text-sm leading-relaxed"
            dir="rtl"
          />
        </div>

        {/* Info */}
        <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            {students.length} תלמידים נבחרו. תלמידים ללא טלפון הורה יוכלו רק להעתיק הודעה (ללא קישור ישיר לוואטסאפ).
          </span>
        </div>

        {/* Student list */}
        <ScrollArea className="flex-1 min-h-0 max-h-[40vh]">
          <div className="space-y-2 pr-2">
            {studentMessages.map((m) => (
              <div
                key={m.student.id}
                className="rounded-xl border border-border p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm text-foreground">
                      {m.student.first_name} {m.student.last_name}
                    </span>
                    {m.student.parent_phone && (
                      <span className="text-xs text-muted-foreground font-mono">
                        {m.student.parent_phone}
                      </span>
                    )}
                    {!m.hasPhone && (
                      <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
                        ללא טלפון
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg text-xs"
                      onClick={() => handleCopy(m.message, m.student.id)}
                    >
                      {copiedId === m.student.id ? (
                        <CopyCheck className="h-3.5 w-3.5 text-green-600" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      העתק
                    </Button>
                    {m.hasPhone && (
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 rounded-lg text-xs bg-green-600 hover:bg-green-700 text-white"
                        asChild
                      >
                        <a href={m.waLink} target="_blank" rel="noopener noreferrer">
                          <MessageCircle className="h-3.5 w-3.5" />
                          WhatsApp
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-2 leading-relaxed whitespace-pre-line">
                  {m.message}
                </p>
              </div>
            ))}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="flex gap-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            className="flex-1 gap-2 rounded-xl"
            onClick={handleCopyAll}
          >
            <Copy className="h-4 w-4" />
            העתק הכל (טקסט + טלפון)
          </Button>
          <Button
            variant="outline"
            className="rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            סגור
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default WhatsAppLinkDialog;
