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
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { calcYearsOfPlaying, STUDENT_STATUSES } from "@/lib/constants";
import { useEnrollmentReportLines } from "@/hooks/useEnrollmentReportLines";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import EnrollmentSummary from "@/components/teacher/EnrollmentSummary";
import EnrollmentHistory from "@/components/teacher/EnrollmentHistory";
import AddPaymentDialog from "@/components/admin/AddPaymentDialog";

const STATUS_MAP: Record<string, string> = {
  present: "נוכח/ת",
  double_lesson: "שיעור כפול",
  justified_absence: "היעדרות מוצדקת",
  unjustified_absence: "היעדרות בלתי מוצדקת",
  vacation: "חופש",
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: "מזומן",
  check: "צ׳ק",
  transfer: "העברה",
  credit_card: "כרטיס אשראי",
  other: "אחר",
};

const AdminStudentCard = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const { activeYear } = useAcademicYear();

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

  const deleteMutation = useMutation({
    mutationFn: async () => {
      // Get enrollment IDs for this student
      const { data: enrollments } = await supabase
        .from("enrollments")
        .select("id")
        .eq("student_id", studentId!);
      const enrollmentIds = (enrollments || []).map((e) => e.id);

      if (enrollmentIds.length > 0) {
        // Delete report_lines via reports that reference these enrollments
        await supabase.from("report_lines").delete().in("enrollment_id", enrollmentIds);
        // Delete payments
        await supabase.from("student_payments").delete().in("enrollment_id", enrollmentIds);
        // Delete enrollments
        await supabase.from("enrollments").delete().eq("student_id", studentId!);
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
    queryKey: ["admin-student-enrollments", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("*, schools(name), instruments(name), teachers(first_name, last_name), academic_years(name)")
        .eq("student_id", studentId!);
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
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
        .order("payment_date", { ascending: false });

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
          <DetailRow label="נייד תלמיד/ה" value={(student as any).phone} />
          <DetailRow label="תאריך לידה" value={student.date_of_birth} />
          <DetailRow label="כתובת" value={student.address} />
          <DetailRow label="עיר" value={student.city} />
          <DetailRow label="כיתה" value={(student as any).grade} />
          <DetailRow label="רמת נגינה" value={(student as any).playing_level} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-1">
          <h2 className="font-semibold text-foreground text-base mb-2">פרטי הורים</h2>
          <DetailRow label="שם הורה 1" value={student.parent_name} />
          <DetailRow label="טלפון הורה 1" value={student.parent_phone} />
          <DetailRow label="אימייל הורה 1" value={student.parent_email} />
          <DetailRow label="שם הורה 2" value={student.parent_name_2} />
          <DetailRow label="טלפון הורה 2" value={student.parent_phone_2} />
          <DetailRow label="אימייל הורה 2" value={student.parent_email_2} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-base">רישומים ({enrollments.length})</h2>
            <Button className="h-10 rounded-xl text-sm" onClick={() => navigate(`/admin/enrollments/new?student_id=${studentId}`)}>
              <Plus className="h-4 w-4" /> שיוך חדש
            </Button>
          </div>
          {enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין רישומים</p>
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

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-foreground text-base">הערות ({notes.length})</h2>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין הערות</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n: any) => (
                <div key={n.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm text-foreground">{n.content}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.profiles?.full_name ?? "—"} · {format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-base">תשלומים ({payments.length})</h2>
            <Button className="h-10 rounded-xl text-sm" onClick={() => { setEditingPayment(null); setShowPaymentDialog(true); }}>
              <Plus className="h-4 w-4" /> הוסף תשלום
            </Button>
          </div>

          {/* Yearly summary */}
          {(() => {
            const yearPayments = payments.filter((p: any) => activeYear && p.academic_year_id === activeYear.id);
            const totalPaid = yearPayments
              .filter((p: any) => p.transaction_type === "payment")
              .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
            const totalCredit = yearPayments
              .filter((p: any) => p.transaction_type === "credit")
              .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
            const net = totalPaid - totalCredit;
            return (
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-center space-y-1">
                <div>
                  <span className="text-sm text-muted-foreground">שולם השנה: </span>
                  <span className="font-bold text-primary text-lg">₪{net.toLocaleString()}</span>
                </div>
                {totalCredit > 0 && (
                  <p className="text-xs text-muted-foreground">
                    (תשלומים: ₪{totalPaid.toLocaleString()} | זיכויים: ₪{totalCredit.toLocaleString()})
                  </p>
                )}
              </div>
            );
          })()}

           {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין תשלומים</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">סוג</TableHead>
                    <TableHead className="text-right">שיוך</TableHead>
                    <TableHead className="text-right">שנת לימודים</TableHead>
                    <TableHead className="text-right">סכום</TableHead>
                    <TableHead className="text-right">תאריך</TableHead>
                    <TableHead className="text-right">אופן תשלום</TableHead>
                    <TableHead className="text-right">תשלומים</TableHead>
                    <TableHead className="text-right">הערות</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p: any) => {
                    const enrollment = enrollments.find((e: any) => e.id === p.enrollment_id);
                    const isCredit = p.transaction_type === "credit";
                    return (
                      <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { setEditingPayment(p); setShowPaymentDialog(true); }}>
                        <TableCell className="text-sm">
                          <Badge variant={isCredit ? "destructive" : "default"} className="text-xs">
                            {isCredit ? "זיכוי" : "תשלום"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{enrollment ? `${enrollment.instruments?.name} — ${enrollment.schools?.name}` : "—"}</TableCell>
                        <TableCell className="text-sm">{p.academic_years?.name ?? "—"}</TableCell>
                        <TableCell className={`text-sm font-medium ${isCredit ? "text-destructive" : ""}`}>
                          {isCredit ? "-" : ""}₪{Number(p.amount).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">{p.payment_date ? format(new Date(p.payment_date), "dd/MM/yyyy") : "—"}</TableCell>
                        <TableCell className="text-sm">{PAYMENT_METHOD_MAP[p.payment_method] ?? p.payment_method ?? "—"}</TableCell>
                        <TableCell className="text-sm">{(p as any).installments ?? 1}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{p.notes ?? "—"}</TableCell>
                        <TableCell className="text-sm">
                          <Button variant="ghost" size="sm" className="rounded-xl" onClick={(e) => { e.stopPropagation(); setEditingPayment(p); setShowPaymentDialog(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <AddPaymentDialog
          open={showPaymentDialog}
          onOpenChange={(v) => { setShowPaymentDialog(v); if (!v) setEditingPayment(null); }}
          studentId={studentId!}
          enrollments={enrollments}
          editPayment={editingPayment}
        />
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
