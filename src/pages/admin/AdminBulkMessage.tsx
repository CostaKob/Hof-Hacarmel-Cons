import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Send, Users, Mail, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Source = "registrations" | "enrollments" | "school_music";

interface Recipient {
  email: string;
  parentName: string;
  studentName: string;
}

const AdminBulkMessage = () => {
  const { selectedYearId, years } = useAcademicYear();
  const [source, setSource] = useState<Source>("registrations");
  const [regStatus, setRegStatus] = useState<string>("all");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendingTest, setSendingTest] = useState(false);

  const handleSendTest = async () => {
    const email = testEmail.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("יש להזין כתובת מייל תקינה");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error("יש למלא נושא ותוכן לפני שליחת בדיקה");
      return;
    }
    setSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "broadcast-message",
          recipientEmail: email,
          replyTo: "musichof@gmail.com",
          idempotencyKey: `broadcast-test-${Date.now()}-${email}`,
          templateData: {
            subject: `[בדיקה] ${subject.trim()}`,
            body,
            parentName: "בדיקה",
          },
        },
      });
      if (error) throw error;
      toast.success(`מייל בדיקה נשלח אל ${email}`);
    } catch (e: any) {
      console.error("test send failed", e);
      toast.error(`שליחת הבדיקה נכשלה: ${e?.message ?? e}`);
    } finally {
      setSendingTest(false);
    }
  };

  const yearName = years?.find((y) => y.id === selectedYearId)?.name;

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["bulk-recipients", source, selectedYearId, regStatus],
    enabled: !!selectedYearId,
    queryFn: async (): Promise<Recipient[]> => {
      if (source === "registrations") {
        let q = supabase
          .from("registrations")
          .select("parent_email, parent_name, student_first_name, student_last_name, status")
          .eq("academic_year_id", selectedYearId!);
        if (regStatus !== "all") q = q.eq("status", regStatus as any);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? [])
          .filter((r: any) => r.parent_email)
          .map((r: any) => ({
            email: String(r.parent_email).trim().toLowerCase(),
            parentName: r.parent_name ?? "",
            studentName: `${r.student_first_name ?? ""} ${r.student_last_name ?? ""}`.trim(),
          }));
      }
      if (source === "enrollments") {
        const { data, error } = await supabase
          .from("enrollments")
          .select("student_id, students!inner(parent_email, parent_name, parent_email_2, parent_name_2, first_name, last_name)")
          .eq("academic_year_id", selectedYearId!)
          .eq("is_active", true);
        if (error) throw error;
        const rows: Recipient[] = [];
        for (const e of (data as any[]) ?? []) {
          const s = e.students;
          const name = `${s?.first_name ?? ""} ${s?.last_name ?? ""}`.trim();
          if (s?.parent_email) rows.push({ email: String(s.parent_email).trim().toLowerCase(), parentName: s.parent_name ?? "", studentName: name });
          if (s?.parent_email_2) rows.push({ email: String(s.parent_email_2).trim().toLowerCase(), parentName: s.parent_name_2 ?? "", studentName: name });
        }
        return rows;
      }
      // school_music
      const { data, error } = await supabase
        .from("school_music_students")
        .select("parent_email, parent_name, student_first_name, student_last_name")
        .eq("academic_year_id", selectedYearId!);
      if (error) throw error;
      return (data ?? [])
        .filter((r: any) => r.parent_email)
        .map((r: any) => ({
          email: String(r.parent_email).trim().toLowerCase(),
          parentName: r.parent_name ?? "",
          studentName: `${r.student_first_name ?? ""} ${r.student_last_name ?? ""}`.trim(),
        }));
    },
  });

  const uniqueRecipients = useMemo(() => {
    const map = new Map<string, Recipient>();
    for (const r of recipients) {
      if (!r.email) continue;
      if (!map.has(r.email)) map.set(r.email, r);
    }
    return Array.from(map.values()).sort((a, b) => a.parentName.localeCompare(b.parentName, "he"));
  }, [recipients]);

  // Default: all selected
  const allSelectedInitial = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const r of uniqueRecipients) map[r.email] = true;
    return map;
  }, [uniqueRecipients]);

  const effectiveSelected = Object.keys(selected).length === 0 ? allSelectedInitial : selected;
  const selectedEmails = uniqueRecipients.filter((r) => effectiveSelected[r.email]);
  const allChecked = selectedEmails.length === uniqueRecipients.length && uniqueRecipients.length > 0;

  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    if (allChecked) {
      for (const r of uniqueRecipients) next[r.email] = false;
    } else {
      for (const r of uniqueRecipients) next[r.email] = true;
    }
    setSelected(next);
  };

  const toggleOne = (email: string) => {
    setSelected((prev) => {
      const base = Object.keys(prev).length === 0 ? allSelectedInitial : prev;
      return { ...base, [email]: !base[email] };
    });
  };

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && selectedEmails.length > 0;

  const handleSend = async () => {
    setSending(true);
    setProgress({ done: 0, total: selectedEmails.length, failed: 0 });
    const stamp = Date.now();
    let done = 0;
    let failed = 0;
    const CONCURRENCY = 4;
    const queue = [...selectedEmails];

    const worker = async () => {
      while (queue.length > 0) {
        const r = queue.shift();
        if (!r) break;
        try {
          const { error } = await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "broadcast-message",
              recipientEmail: r.email,
              replyTo: "musichof@gmail.com",
              idempotencyKey: `broadcast-${stamp}-${r.email}`,
              templateData: {
                subject: subject.trim(),
                body,
                parentName: r.parentName || "",
              },
            },
          });
          if (error) throw error;
        } catch (e) {
          console.error("broadcast send failed", r.email, e);
          failed += 1;
        }
        done += 1;
        setProgress({ done, total: selectedEmails.length, failed });
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, selectedEmails.length) }, worker));
    setSending(false);
    if (failed === 0) {
      toast.success(`נשלחו ${done} הודעות בהצלחה`);
    } else {
      toast.warning(`נשלחו ${done - failed} הודעות. ${failed} נכשלו — ראה קונסול.`);
    }
  };

  return (
    <AdminLayout title="שליחת הודעות להורים" backPath="/admin">
      <PageTitle title="שליחת הודעות להורים" />
      <div className="max-w-4xl space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">הודעת מייל להורים</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">קהל יעד</Label>
              <Select value={source} onValueChange={(v) => { setSource(v as Source); setSelected({}); }}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="registrations">הורים שנרשמו (טופס הרשמה)</SelectItem>
                  <SelectItem value="enrollments">הורים של תלמידים עם שיוך פעיל</SelectItem>
                  <SelectItem value="school_music">הורים בבית ספר מנגן</SelectItem>
                </SelectContent>
              </Select>
              {yearName && <p className="text-xs text-muted-foreground">שנה נבחרת: {yearName}</p>}
            </div>
            {source === "registrations" && (
              <div className="space-y-1">
                <Label className="text-xs">סטטוס הרשמה</Label>
                <Select value={regStatus} onValueChange={setRegStatus}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכול</SelectItem>
                    <SelectItem value="new">חדש</SelectItem>
                    <SelectItem value="in_review">בטיפול</SelectItem>
                    <SelectItem value="waiting_for_call">ממתין לשיחה</SelectItem>
                    <SelectItem value="waiting_for_payment">ממתין לתשלום</SelectItem>
                    <SelectItem value="ready_to_assign">מוכן לשיבוץ</SelectItem>
                    <SelectItem value="partially_converted">שובץ חלקית</SelectItem>
                    <SelectItem value="converted">שובץ</SelectItem>
                    <SelectItem value="rejected">נדחה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">נושא</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="לדוגמה: עדכון לגבי שיבוץ מורים"
              className="h-11 rounded-xl"
              dir="rtl"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">תוכן ההודעה</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="כתבו כאן את תוכן ההודעה. כל שורה חדשה תופיע כפסקה במייל."
              className="rounded-xl"
              dir="rtl"
            />
            <p className="text-xs text-muted-foreground">
              המייל יישלח עם כותרת האולפן, פרטי הקשר וחתימה — בעיצוב מותג.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">נמענים</h2>
              <Badge variant="outline">{selectedEmails.length} / {uniqueRecipients.length}</Badge>
            </div>
            <Button variant="outline" size="sm" onClick={toggleAll} disabled={uniqueRecipients.length === 0}>
              {allChecked ? "בטל בחירה" : "בחר הכול"}
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">טוען נמענים...</p>
          ) : uniqueRecipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">לא נמצאו נמענים לפי הפילטרים שנבחרו.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {uniqueRecipients.map((r) => (
                    <tr key={r.email} className="border-b last:border-b-0 border-border/50">
                      <td className="p-2 w-8">
                        <Checkbox checked={!!effectiveSelected[r.email]} onCheckedChange={() => toggleOne(r.email)} />
                      </td>
                      <td className="p-2">
                        <div className="font-medium text-foreground">{r.parentName || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.studentName && <span>{r.studentName} · </span>}
                          <span dir="ltr">{r.email}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          {progress && (
            <p className="text-sm text-muted-foreground">
              נשלחו {progress.done} מתוך {progress.total}
              {progress.failed > 0 ? ` · נכשלו ${progress.failed}` : ""}
            </p>
          )}
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!canSend || sending}
            className="h-11 rounded-xl gap-2 ms-auto"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "שולח..." : `שלח ל־${selectedEmails.length} נמענים`}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לשלוח את ההודעה?</AlertDialogTitle>
            <AlertDialogDescription>
              ההודעה תישלח ל־{selectedEmails.length} נמענים במייל. פעולה זו אינה ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); setConfirmOpen(false); handleSend(); }}>
              שלח
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminBulkMessage;
