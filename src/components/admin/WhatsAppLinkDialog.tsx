import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, MessageCircle, CopyCheck, Info, Loader2, Send, CheckCircle2, XCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { GRADE_PROMOTION } from "@/lib/constants";

interface StudentData {
  id: string;
  first_name: string;
  last_name: string;
  national_id?: string | null;
  grade?: string | null;
  gender?: string | null;
  city?: string | null;
  phone?: string | null;
  parent_name?: string | null;
  parent_phone?: string | null;
  parent_email?: string | null;
  parent_national_id?: string | null;
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

function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let token = "";
  for (let i = 0; i < 24; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

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
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
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
  const queryClient = useQueryClient();
  const [template, setTemplate] = useState(DEFAULT_TEMPLATE);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sendSummary, setSendSummary] = useState<{
    sent: Array<{ name: string; phone: string }>;
    failed: Array<{ name: string; reason: string }>;
  } | null>(null);

  const yearName = nextYear?.name || "השנה הבאה";
  const studentIds = students.map((s) => s.id);

  const { data: existingTokens = [], isLoading: tokensLoading, refetch: refetchTokens } = useQuery({
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

    existingTokens.forEach((registration: any) => {
      if (registration.existing_student_id && registration.registration_token) {
        map.set(registration.existing_student_id, registration.registration_token);
      }
    });

    return map;
  }, [existingTokens]);

  const studentsWithoutTokens = useMemo(
    () => students.filter((student) => !tokenMap.has(student.id) && !student.registration_token),
    [students, tokenMap],
  );

  const createMissingMutation = useMutation({
    mutationFn: async () => {
      if (!nextYear || studentsWithoutTokens.length === 0) return;

      const registrations = studentsWithoutTokens.map((student) => ({
        academic_year_id: nextYear.id,
        student_first_name: student.first_name,
        student_last_name: student.last_name,
        student_national_id: student.national_id || "",
        gender: student.gender || null,
        student_status: "continuing",
        branch_school_name: "",
        student_school_text: "",
        grade: GRADE_PROMOTION[student.grade || ""] || student.grade || "",
        city: student.city || "",
        student_phone: student.phone || null,
        requested_instruments: (student.enrollments || [])
          .map((enrollment) => enrollment.instruments?.name)
          .filter(Boolean),
        requested_lesson_duration: "",
        parent_name: student.parent_name || "",
        parent_national_id: student.parent_national_id || "",
        parent_phone: student.parent_phone || "",
        parent_email: student.parent_email || "",
        approval_checked: false,
        status: "new" as const,
        existing_student_id: student.id,
        registration_token: generateToken(),
      }));

      const { error } = await supabase.from("registrations").insert(registrations);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchTokens();
      queryClient.invalidateQueries({ queryKey: ["registration-tokens"] });
      toast.success(`נוצרו ${studentsWithoutTokens.length} רישומי חידוש עם טוקנים`);
    },
    onError: (error: any) => {
      toast.error(error.message || "שגיאה ביצירת רישומים");
    },
  });

  useEffect(() => {
    if (!open || tokensLoading || !nextYear || studentsWithoutTokens.length === 0) return;
    if (createMissingMutation.isPending || createMissingMutation.isSuccess) return;

    createMissingMutation.mutate();
  }, [
    open,
    tokensLoading,
    nextYear,
    studentsWithoutTokens.length,
    createMissingMutation.isPending,
    createMissingMutation.isSuccess,
  ]);

  const isReady = !tokensLoading && !createMissingMutation.isPending;

  // Initialize selectedIds when students load
  useEffect(() => {
    if (open && students.length > 0) {
      setSelectedIds(new Set(students.map((s) => s.id)));
    }
  }, [open, students]);

  const studentMessages = useMemo(() => {
    return students.map((student) => {
      const token = tokenMap.get(student.id) || student.registration_token || "";
      const link = token
        ? `${baseUrl}/register?yearId=${nextYear?.id || ""}&token=${token}`
        : `${baseUrl}/register?yearId=${nextYear?.id || ""}`;
      const message = buildMessage(template, student, yearName, link);
      const waPhone = formatPhoneForWhatsApp(student.parent_phone);
      const waLink = waPhone
        ? `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`
        : "";

      return {
        student,
        message,
        waLink,
        hasPhone: !!waPhone,
      };
    });
  }, [students, template, yearName, nextYear?.id, baseUrl, tokenMap]);

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    toast.success("הועתק!");
  };

  const handleCopyAll = async () => {
    const allLines = studentMessages
      .map(
        (messageItem) =>
          `${messageItem.student.first_name} ${messageItem.student.last_name}\t${messageItem.student.parent_phone || ""}\t${messageItem.message}`,
      )
      .join("\n");

    await navigator.clipboard.writeText(allLines);
    toast.success(`${studentMessages.length} הודעות הועתקו ללוח!`);
  };

  const selectedMessages = studentMessages.filter((m) => selectedIds.has(m.student.id));
  const withPhone = selectedMessages.filter((m) => m.hasPhone);
  const withoutPhone = selectedMessages.filter((m) => !m.hasPhone);

  const allSelected = selectedIds.size === students.length;
  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(students.map((s) => s.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSendAll = () => {
    const sent: Array<{ name: string; phone: string }> = [];
    const failed: Array<{ name: string; reason: string }> = [];

    selectedMessages.forEach((messageItem) => {
      const name = `${messageItem.student.first_name} ${messageItem.student.last_name}`;
      if (!messageItem.hasPhone) {
        failed.push({ name, reason: "ללא מספר טלפון הורה" });
        return;
      }
      window.open(messageItem.waLink, "_blank");
      sent.push({ name, phone: messageItem.student.parent_phone || "" });
    });

    setSendSummary({ sent, failed });
    setShowConfirm(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        dir="rtl"
        className="w-[calc(100vw-0.75rem)] max-w-[calc(100vw-0.75rem)] sm:max-w-3xl max-h-[calc(100dvh-1rem)] flex flex-col overflow-hidden p-3 sm:p-6"
      >
        <DialogHeader className="pr-10 text-right">
          <DialogTitle className="flex items-start gap-2 text-right text-base leading-tight sm:text-lg">
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            <span className="break-words">יצירת הודעות WhatsApp — {yearName}</span>
          </DialogTitle>
        </DialogHeader>

        {!isReady ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">
              {createMissingMutation.isPending
                ? `יוצר רישומי חידוש עבור ${studentsWithoutTokens.length} תלמידים...`
                : "טוען נתונים..."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain pr-1">
              <div className="space-y-4 pb-2">
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">תבנית הודעה</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {PLACEHOLDERS.map((placeholder) => (
                      <Badge
                        key={placeholder.key}
                        variant="outline"
                        className="h-auto max-w-full cursor-pointer whitespace-normal break-all py-1 text-right text-xs hover:bg-primary/10"
                        onClick={() => setTemplate((prev) => `${prev} ${placeholder.key}`)}
                      >
                        <span>{placeholder.label}:</span>
                        <code className="mr-1 break-all text-primary">{placeholder.key}</code>
                      </Badge>
                    ))}
                  </div>
                  <Textarea
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    className="min-h-[120px] text-sm leading-relaxed"
                    dir="rtl"
                  />
                </div>

                <div className="flex items-start gap-2 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {students.length} תלמידים נבחרו. תלמידים ללא טלפון הורה יוכלו רק להעתיק הודעה (ללא קישור ישיר לוואטסאפ).
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      id="select-all"
                    />
                    <label htmlFor="select-all" className="text-sm font-medium cursor-pointer select-none">
                      {allSelected ? "בטל בחירת הכל" : "בחר הכל"}
                    </label>
                    <span className="text-xs text-muted-foreground">
                      ({selectedIds.size}/{students.length})
                    </span>
                  </div>

                  {studentMessages.map((messageItem) => {
                    const isSelected = selectedIds.has(messageItem.student.id);
                    return (
                    <div
                      key={messageItem.student.id}
                      className={`rounded-xl border p-3 space-y-2 overflow-hidden transition-colors ${isSelected ? "border-border" : "border-border/40 opacity-60"}`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleOne(messageItem.student.id)}
                          />
                          <span className="text-sm font-medium text-foreground break-words">
                            {messageItem.student.first_name} {messageItem.student.last_name}
                          </span>
                          {messageItem.student.parent_phone && (
                            <span className="max-w-full break-all text-xs font-mono text-muted-foreground">
                              {messageItem.student.parent_phone}
                            </span>
                          )}
                          {!messageItem.hasPhone && (
                            <Badge variant="outline" className="text-xs border-amber-300 text-amber-600">
                              ללא טלפון
                            </Badge>
                          )}
                        </div>

                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 w-full gap-1.5 rounded-lg text-xs sm:w-auto"
                            onClick={() => handleCopy(messageItem.message, messageItem.student.id)}
                          >
                            {copiedId === messageItem.student.id ? (
                              <CopyCheck className="h-3.5 w-3.5 text-green-600" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            העתק
                          </Button>

                          {messageItem.hasPhone && (
                            <Button
                              size="sm"
                              className="h-9 w-full gap-1.5 rounded-lg text-xs bg-green-600 text-white hover:bg-green-700 sm:w-auto"
                              asChild
                            >
                              <a href={messageItem.waLink} target="_blank" rel="noopener noreferrer">
                                <MessageCircle className="h-3.5 w-3.5" />
                                WhatsApp
                              </a>
                            </Button>
                          )}
                        </div>
                      </div>

                      <p className="rounded-lg bg-muted/50 p-2 text-xs leading-relaxed text-muted-foreground whitespace-pre-line break-words">
                        {messageItem.message}
                      </p>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row">
              <Button
                className="w-full gap-2 rounded-xl bg-green-600 text-white hover:bg-green-700 sm:flex-1"
                onClick={() => setShowConfirm(true)}
                disabled={withPhone.length === 0}
              >
                <Send className="h-4 w-4" />
                שלח לכולם ({withPhone.length})
              </Button>
              <Button
                variant="outline"
                className="w-full gap-2 rounded-xl sm:flex-1"
                onClick={handleCopyAll}
              >
                <Copy className="h-4 w-4" />
                העתק הכל
              </Button>
              <Button
                variant="outline"
                className="w-full rounded-xl sm:w-auto"
                onClick={() => onOpenChange(false)}
              >
                סגור
              </Button>
            </div>
          </>
        )}
      </DialogContent>

      {/* Confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent dir="rtl" className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-right">שליחת הודעות לכולם</AlertDialogTitle>
            <AlertDialogDescription className="text-right space-y-2">
              <p>
                פעולה זו תפתח {withPhone.length} חלונות WhatsApp חדשים — אחד לכל הורה עם מספר טלפון.
              </p>
              {withoutPhone.length > 0 && (
                <p className="text-amber-600 font-medium">
                  ⚠ {withoutPhone.length} תלמידים ללא מספר טלפון הורה — ההודעה שלהם לא תישלח.
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                שים לב: ייתכן שהדפדפן יחסום חלק מהחלונות. אם זה קורה, אפשר את החלונות הקופצים (pop-ups) בהגדרות הדפדפן.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse">
            <AlertDialogAction
              className="bg-green-600 text-white hover:bg-green-700"
              onClick={handleSendAll}
            >
              <Send className="h-4 w-4 ml-2" />
              שלח {withPhone.length} הודעות
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Summary dialog */}
      <Dialog open={!!sendSummary} onOpenChange={() => setSendSummary(null)}>
        <DialogContent dir="rtl" className="max-w-md max-h-[80dvh] flex flex-col">
          <DialogHeader className="text-right">
            <DialogTitle className="text-right">סיכום שליחה</DialogTitle>
          </DialogHeader>
          {sendSummary && (
            <div className="flex-1 overflow-y-auto space-y-4">
              {sendSummary.sent.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5 text-green-700">
                    <CheckCircle2 className="h-4 w-4" />
                    נשלחו ({sendSummary.sent.length})
                  </h4>
                  <div className="rounded-lg bg-green-50 dark:bg-green-950/30 p-2 space-y-1">
                    {sendSummary.sent.map((s, i) => (
                      <p key={i} className="text-xs text-foreground">
                        {s.name} — <span className="font-mono text-muted-foreground">{s.phone}</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
              {sendSummary.failed.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-sm font-semibold flex items-center gap-1.5 text-destructive">
                    <XCircle className="h-4 w-4" />
                    לא נשלחו ({sendSummary.failed.length})
                  </h4>
                  <div className="rounded-lg bg-destructive/10 p-2 space-y-1">
                    {sendSummary.failed.map((f, i) => (
                      <p key={i} className="text-xs text-foreground">
                        {f.name} — <span className="text-muted-foreground">{f.reason}</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="pt-2 border-t">
            <Button variant="outline" className="w-full rounded-xl" onClick={() => setSendSummary(null)}>
              סגור
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
};

export default WhatsAppLinkDialog;
