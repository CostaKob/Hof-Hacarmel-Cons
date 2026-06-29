import { useState } from "react";
import { useLocation, useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Plus, Trash2, Calculator, FileDown, Undo2, Send } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { format } from "date-fns";
import { calcYearsOfPlaying, STUDENT_STATUSES } from "@/lib/constants";
import { useEnrollmentReportLines } from "@/hooks/useEnrollmentReportLines";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import EnrollmentSummary from "@/components/teacher/EnrollmentSummary";
import EnrollmentHistory from "@/components/teacher/EnrollmentHistory";

import StudentInstrumentLoansSection from "@/components/admin/StudentInstrumentLoansSection";
import AddPaymentDialog from "@/components/admin/AddPaymentDialog";
import StudentPaymentsSection from "@/components/admin/StudentPaymentsSection";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import StudentNotesSection from "@/components/StudentNotesSection";
import RegistrationApprovalSection from "@/components/admin/RegistrationApprovalSection";
import SendTeacherAssignmentMessage from "@/components/admin/SendTeacherAssignmentMessage";


const STATUS_MAP: Record<string, string> = {
  present: "נוכח/ת",
  double_lesson: "שיעור כפול",
  justified_absence: "היעדרות מוצדקת",
  unjustified_absence: "היעדרות בלתי מוצדקת",
  vacation: "חופש",
};


const AdminStudentCard = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [paymentsYearFilter, setPaymentsYearFilter] = useState<string | "all" | null>(null);
  const [showSendMessageDialog, setShowSendMessageDialog] = useState(false);

  const { activeYear, selectedYearId, years } = useAcademicYear();

  const statusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase.from("students").update({ student_status: newStatus } as any).eq("id", studentId!);
      if (error) throw error;
      // If student stopped, deactivate all enrollments
      if (newStatus === "הפסיק") {
        await supabase.from("enrollments").update({ is_active: false }).eq("student_id", studentId!);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-student-enrollments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      toast.success("סטטוס עודכן");
    },
    onError: () => toast.error("שגיאה בעדכון סטטוס"),
  });

  const enrollmentStatusMutation = useMutation({
    mutationFn: async ({ enrollmentId, isActive }: { enrollmentId: string; isActive: boolean }) => {
      const { error } = await supabase.from("enrollments").update({ is_active: isActive }).eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-student-enrollments", studentId] });
      toast.success("סטטוס רישום עודכן");
    },
    onError: () => toast.error("שגיאה בעדכון סטטוס רישום"),
  });

  const flagMutation = useMutation({
    mutationFn: async ({ field, value }: { field: "has_music_production_course" | "has_recital_track" | "is_junior_track" | "is_major_student"; value: boolean }) => {
      const { error } = await supabase.from("students").update({ [field]: value } as any).eq("id", studentId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-students-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-all-students-raw"] });
      toast.success("עודכן");
    },
    onError: () => toast.error("שגיאה בעדכון"),
  });



  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Get enrollment IDs for this student
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", studentId!);
      const enrollmentIds = (enrollments || []).map((e) => e.id);

      if (enrollmentIds.length > 0) {
        // CRITICAL: Don't delete report_lines — they belong to teacher reports.
        // Deleting them would corrupt other teachers' work-day reports and salary calculations.
        const { count: reportLinesCount, error: rlErr } = await supabase
          .from("report_lines")
          .select("id", { count: "exact", head: true })
          .in("enrollment_id", enrollmentIds);
        if (rlErr) throw rlErr;
        if ((reportLinesCount ?? 0) > 0) {
          throw new Error(
            `לא ניתן למחוק את התלמיד — קיימים ${reportLinesCount} דיווחי שיעור של מורים הקשורים לרישומים שלו. ` +
            `מחיקה תפגע בדוחות ובחישוב המשכורת של המורים. סמן/י את התלמיד כלא פעיל במקום למחוק.`
          );
        }

        // Don't delete payments either — financial records should be preserved.
        const { count: paymentsCount, error: pErr } = await supabase
          .from("student_payments")
          .select("id", { count: "exact", head: true })
          .or(`student_id.eq.${studentId},enrollment_id.in.(${enrollmentIds.join(",")})`);
        if (pErr) throw pErr;
        if ((paymentsCount ?? 0) > 0) {
          throw new Error(
            `לא ניתן למחוק את התלמיד — קיימים ${paymentsCount} רשומות תשלום. ` +
            `סמן/י את התלמיד כלא פעיל במקום למחוק.`
          );
        }

        // Safe to delete enrollments (no reports, no payments)
        const { error: eErr } = await supabase.from("enrollments").delete().eq("student_id", studentId!);
        if (eErr) throw eErr;
      }

      // Delete student notes
      await supabase.from("student_notes").delete().eq("student_id", studentId!);

      // Clear registration references to this student
      await supabase
        .from("registrations" as any)
        .update({ existing_student_id: null, match_type: null })
        .eq("existing_student_id", studentId!);

      // Delete the student
      const { error } = await supabase.from("students").delete().eq("id", studentId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      toast.success("התלמיד נמחק בהצלחה");
      navigate("/admin/students");
    },
    onError: (err: any) => {
      toast.error(err.message || "שגיאה במחיקת התלמיד");
    },
  });

  const { data: student, isLoading } = useQuery({
    queryKey: ["admin-student", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", studentId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["admin-student-enrollments", studentId, selectedYearId],
    queryFn: async () => {
      let q = supabase
        .from("enrollments")
        .select("*, schools(name), instruments(name), teachers(first_name, last_name, phone), academic_years(name)")
        .eq("student_id", studentId!);
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: !!studentId && !!selectedYearId,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["admin-student-notes", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_notes")
        .select("*, profiles:author_user_id(full_name)")
        .eq("student_id", studentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["admin-student-payments", studentId],
    queryFn: async () => {
      const { data: enrs } = await supabase.from("enrollments").select("id").eq("student_id", studentId!);
      const ids = (enrs ?? []).map((e) => e.id);

      const query = supabase
        .from("student_payments")
        .select("*, academic_years:academic_year_id(name)")
        .or("payment_status.is.null,payment_status.neq.pending")
        .order("payment_date", { ascending: true })
        .order("created_at", { ascending: true });

      const { data, error } = ids.length > 0
        ? await query.or(`student_id.eq.${studentId},enrollment_id.in.(${ids.join(",")})`)
        : await query.eq("student_id", studentId!);

      if (error) throw error;
      return data ?? [];
    },
    enabled: !!studentId,
  });

  if (isLoading) return <AdminLayout title="כרטיס תלמיד" backPath="/admin/students"><p className="text-center text-muted-foreground py-8">טוען...</p></AdminLayout>;
  if (!student) return <AdminLayout title="כרטיס תלמיד" backPath="/admin/students"><p className="text-center text-muted-foreground py-8">תלמיד לא נמצא</p></AdminLayout>;

  const DetailRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex justify-between border-b border-border py-2.5 last:border-0">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="font-medium text-foreground text-sm">{value}</span>
      </div>
    ) : null;

  const PhoneRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex justify-between items-center border-b border-border py-2.5 last:border-0">
        <span className="text-muted-foreground text-sm">{label}</span>
        <PhoneDisplay phone={value} textClassName="text-sm font-medium" />
      </div>
    ) : null;

  return (
    <AdminLayout title={`${(student as any).gender === "female" ? "👧" : (student as any).gender === "male" ? "👦" : ""} ${student.first_name} ${student.last_name}`} backPath="/admin/students" onBack={() => navigate(-1)}>
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={(student as any).student_status ?? "פעיל"} onValueChange={(v) => statusMutation.mutate(v)}>
              <SelectTrigger className={`h-9 w-28 rounded-lg text-sm font-medium ${(student as any).student_status === "הפסיק" ? "border-destructive text-destructive bg-destructive/10" : "border-primary text-primary bg-primary/10"}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STUDENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(student as any).has_music_production_course && (
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200">
                🎚️ הפקה מוסיקלית
              </span>
            )}
            {(student as any).has_recital_track && (
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                🎼 רסיטל י״ב
              </span>
            )}
            {(student as any).is_major_student && (
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                🎓 מגמת המוסיקה
              </span>
            )}
            {(student as any).is_junior_track && (
              <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-sky-100 text-sky-700 border border-sky-200">
                📘 מסלול חטיבה
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => navigate(`/admin/students/${studentId}/edit`, { state: location.state })}
            >
              <Pencil className="h-4 w-4" /> עריכה
            </Button>
          </div>
        </div>

        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>מחיקת תלמיד</AlertDialogTitle>
              <AlertDialogDescription>
                האם למחוק את {student.first_name} {student.last_name} כולל כל השיוכים, הדוחות והתשלומים? פעולה זו אינה ניתנת לביטול.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "מוחק..." : "מחק"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-1">
          <h2 className="font-semibold text-foreground text-base mb-2">פרטים אישיים</h2>
          <DetailRow label="תעודת זהות" value={student.national_id} />
          <DetailRow label="מין" value={(student as any).gender === "male" ? "זכר" : (student as any).gender === "female" ? "נקבה" : null} />
          <PhoneRow label="נייד תלמיד/ה" value={(student as any).phone} />
          <DetailRow label="תאריך לידה" value={student.date_of_birth} />
          <DetailRow label="כתובת" value={student.address} />
          <DetailRow label="עיר" value={student.city} />
          <DetailRow label="כיתה" value={(student as any).grade} />
          <DetailRow label="רמת נגינה" value={(student as any).playing_level} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-foreground text-base">קורסים ומסלולים</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { field: "has_music_production_course", label: "🎚️ הפקה מוסיקלית" },
              { field: "has_recital_track", label: "🎼 מסלול רסיטל י״ב" },
              { field: "is_major_student", label: "🎓 מגמת המוסיקה" },
              { field: "is_junior_track", label: "📘 מסלול חטיבה" },
            ].map((opt) => (
              <label key={opt.field} className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 cursor-pointer hover:bg-accent/40 transition-colors">
                <Checkbox
                  checked={!!(student as any)[opt.field]}
                  onCheckedChange={(c) => flagMutation.mutate({ field: opt.field as any, value: c === true })}
                />
                <span className="text-sm font-medium text-foreground">{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-1">
          <h2 className="font-semibold text-foreground text-base mb-2">פרטי הורים</h2>
          <DetailRow label="שם הורה 1" value={student.parent_name} />
          <PhoneRow label="טלפון הורה 1" value={student.parent_phone} />
          <DetailRow label="אימייל הורה 1" value={student.parent_email} />
          <DetailRow label="שם הורה 2" value={student.parent_name_2} />
          <PhoneRow label="טלפון הורה 2" value={student.parent_phone_2} />
          <DetailRow label="אימייל הורה 2" value={student.parent_email_2} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-foreground text-base">שיוכים ({enrollments.length})</h2>
            <div className="flex items-center gap-2">
              <Button className="h-10 rounded-xl text-sm" onClick={() => navigate(`/admin/enrollments/new?student_id=${studentId}`)}>
                <Plus className="h-4 w-4" /> שיוך חדש
              </Button>
            </div>
          </div>
          {enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין שיוכים</p>
          ) : (
            <div className="space-y-2">
              {enrollments.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div>
                    <p className="font-medium text-foreground text-sm">{e.schools?.name} — {e.instruments?.name} <span className="text-muted-foreground font-normal">({e.academic_years?.name ?? "—"})</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {e.teachers?.first_name} {e.teachers?.last_name} · {e.lesson_duration_minutes} דק׳ · {e.lesson_type === "individual" ? "פרטני" : "קבוצתי"}
                      {(() => { const yrs = calcYearsOfPlaying((e as any).instrument_start_date); return yrs !== null ? ` · שנות נגינה: ${yrs}` : ""; })()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => enrollmentStatusMutation.mutate({ enrollmentId: e.id, isActive: !e.is_active })}
                      className={`rounded-lg px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer ${
                        e.is_active
                          ? "bg-primary/10 text-primary border border-primary/30"
                          : "bg-destructive/10 text-destructive border border-destructive/30"
                      }`}
                    >
                      {e.is_active ? "פעיל" : "הפסיק"}
                    </button>
                    <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => navigate(`/admin/enrollments/${e.id}/edit`)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attendance summary & lesson history per enrollment */}
        {enrollments.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
            <h2 className="font-semibold text-foreground text-base">סיכום נוכחות והיסטוריית שיעורים</h2>
            {enrollments.length === 1 ? (
              <EnrollmentReportSection enrollmentId={enrollments[0].id} label={`${(enrollments[0] as any).instruments?.name} — ${(enrollments[0] as any).schools?.name}`} startDate={(enrollments[0] as any).start_date} />
            ) : (
              <Tabs defaultValue={enrollments[0].id} dir="rtl">
                <TabsList className="w-full flex-wrap h-auto gap-1">
                  {enrollments.map((e: any) => (
                    <TabsTrigger key={e.id} value={e.id} className="text-xs">
                      {e.instruments?.name} — {e.schools?.name} ({e.academic_years?.name ?? "—"})
                    </TabsTrigger>
                  ))}
                </TabsList>
                {enrollments.map((e: any) => (
                  <TabsContent key={e.id} value={e.id}>
                    <EnrollmentReportSection enrollmentId={e.id} label={`${e.instruments?.name} — ${e.schools?.name}`} startDate={e.start_date} />
                  </TabsContent>
                ))}
              </Tabs>
            )}
          </div>
        )}

        {(() => {
          const effectiveYearFilter = paymentsYearFilter ?? selectedYearId ?? "all";
          const filteredPayments =
            effectiveYearFilter === "all"
              ? payments
              : payments.filter((p: any) => p.academic_year_id === effectiveYearFilter);
          return (
            <StudentPaymentsSection
              studentId={studentId!}
              payments={filteredPayments}
              enrollments={enrollments}
              showYear
              readOnly
              extraInvalidateKeys={[["admin-student-payments", studentId]]}
              extraHeaderActions={
                <div className="flex items-center gap-2">
                  <Select
                    value={effectiveYearFilter}
                    onValueChange={(v) => setPaymentsYearFilter(v)}
                  >
                    <SelectTrigger className="h-10 rounded-xl text-sm w-[160px]">
                      <SelectValue placeholder="סנן לפי שנה" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל השנים</SelectItem>
                      {years.map((y) => (
                        <SelectItem key={y.id} value={y.id}>
                          {y.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl text-sm"
                    onClick={() => navigate(`/admin/students/${studentId}/payment`)}
                  >
                    <Calculator className="h-4 w-4" /> חשב/צור תשלום
                  </Button>
                </div>
              }
            />
          );
        })()}




        <StudentInstrumentLoansSection studentType="private" studentId={studentId!} />

        <StudentNotesSection studentId={studentId!} />

        <RegistrationApprovalSection studentId={studentId!} />





      </div>
    </AdminLayout>
  );
};

function EnrollmentReportSection({ enrollmentId, label, startDate }: { enrollmentId: string; label: string; startDate?: string | null }) {
  const { data: reportLines, isLoading } = useEnrollmentReportLines(enrollmentId);
  return (
    <div className="space-y-4 mt-2">
      <EnrollmentSummary lines={reportLines ?? []} startDate={startDate} />
      <EnrollmentHistory lines={(reportLines ?? []) as any} isLoading={isLoading} />
    </div>
  );
}

export default AdminStudentCard;
