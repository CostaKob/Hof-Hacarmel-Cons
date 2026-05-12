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
import { Pencil, Plus, Trash2, Calculator, FileDown, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { calcYearsOfPlaying, STUDENT_STATUSES } from "@/lib/constants";
import { useEnrollmentReportLines } from "@/hooks/useEnrollmentReportLines";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import EnrollmentSummary from "@/components/teacher/EnrollmentSummary";
import EnrollmentHistory from "@/components/teacher/EnrollmentHistory";

import StudentInstrumentLoansSection from "@/components/admin/StudentInstrumentLoansSection";
import AddPaymentDialog from "@/components/admin/AddPaymentDialog";

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
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [paymentDialogType, setPaymentDialogType] = useState<"payment" | "credit">("payment");
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const { activeYear, selectedYearId } = useAcademicYear();

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

  const createInvoiceMutation = useMutation({
    mutationFn: async (params: { paymentId?: string; groupId?: string }) => {
      const { data, error } = await supabase.functions.invoke("icount-create-invoice", { body: params });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
      if (data?.url) {
        toast.success(`חשבונית ${data.doc_number ?? ""} נוצרה`);
        window.open(data.url, "_blank");
      } else {
        toast.success("חשבונית נוצרה");
      }
    },
    onError: (e: any) => toast.error(`שגיאה ביצירת חשבונית: ${e?.message ?? ""}`),
  });

  const refundMutation = useMutation({
    mutationFn: async ({ paymentId, amount }: { paymentId: string; amount: number }) => {
      const { data, error } = await supabase.functions.invoke("icount-create-refund", { body: { paymentId, amount } });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
      toast.success(`זיכוי ${data?.doc_number ?? ""} בוצע`);
      setRefundTarget(null);
      setRefundAmount("");
      if (data?.url) window.open(data.url, "_blank");
    },
    onError: (e: any) => toast.error(`שגיאה בביצוע זיכוי: ${e?.message ?? ""}`),
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
    queryKey: ["admin-student-enrollments", studentId, selectedYearId],
    queryFn: async () => {
      let q = supabase
        .from("enrollments")
        .select("*, schools(name), instruments(name), teachers(first_name, last_name), academic_years(name)")
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
            <h2 className="font-semibold text-foreground text-base">שיוכים ({enrollments.length})</h2>
            <Button className="h-10 rounded-xl text-sm" onClick={() => navigate(`/admin/enrollments/new?student_id=${studentId}`)}>
              <Plus className="h-4 w-4" /> שיוך חדש
            </Button>
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

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-foreground text-base">תשלומים ({payments.length})</h2>
            <div className="flex items-center gap-3">
              <div className="text-sm text-muted-foreground">
                סה״כ שולם: <span className="font-semibold text-foreground">₪{payments.reduce((s: number, p: any) => {
                  const amount = Number(p.amount || 0);
                  if (amount < 0) return s + amount;
                  return p.transaction_type === "payment" ? s + amount : s - amount;
                }, 0).toLocaleString()}</span>
              </div>
              <Button
                variant="outline"
                className="h-10 rounded-xl text-sm"
                onClick={() => navigate(`/admin/students/${studentId}/payment`)}
              >
                <Calculator className="h-4 w-4" /> חשב תשלום
              </Button>
              <Button className="h-10 rounded-xl text-sm" onClick={() => { setEditingPayment(null); setPaymentDialogType("payment"); setPaymentDialogOpen(true); }} disabled={enrollments.length === 0}>
                <Plus className="h-4 w-4" /> תשלום / זיכוי
              </Button>
            </div>
          </div>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">לא בוצעו תשלומים עדיין</p>
          ) : (
            <div className="space-y-2">
              {payments.map((p: any) => {
                const isCredit = p.transaction_type !== "payment";
                const hasInvoice = !!p.invoice_url;
                const hasDoc = !!p.icount_doc_id;
                const refundedSoFar = payments
                  .filter((x: any) => x.refund_of_payment_id === p.id)
                  .reduce((s: number, x: any) => s + Math.abs(Number(x.amount || 0)), 0);
                const remaining = Math.max(0, Number(p.amount || 0) - refundedSoFar);
                const canRefund = !isCredit && hasDoc && remaining > 0;
                return (
                  <div
                    key={p.id}
                    onClick={() => { setEditingPayment(p); setPaymentDialogOpen(true); }}
                    className="flex items-center justify-between rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/50 transition-colors gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground text-sm">
                        {format(new Date(p.payment_date), "dd/MM/yyyy")}
                        {p.academic_years?.name && <span className="text-muted-foreground font-normal"> · {p.academic_years.name}</span>}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isCredit ? "זיכוי" : "תשלום"}
                        {p.payment_method && ` · ${p.payment_method}`}
                        {p.installments > 1 && ` · ${p.installments} תשלומים`}
                        {p.reference_number && ` · אסמכתא ${p.reference_number}`}
                        {p.icount_doc_number && ` · חשבונית ${p.icount_doc_number}`}
                        {p.month_reference && ` · ${p.month_reference}`}
                      </p>
                      {p.notes && <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {!isCredit && hasInvoice && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          title="הורד חשבונית"
                          onClick={(e) => { e.stopPropagation(); window.open(p.invoice_url, "_blank"); }}
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                      )}
                      {!isCredit && !hasDoc && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-lg text-xs"
                          title="הפק חשבונית מס/קבלה ב-iCount"
                          disabled={createInvoiceMutation.isPending}
                          onClick={(e) => { e.stopPropagation(); createInvoiceMutation.mutate(p.id); }}
                        >
                          <FileDown className="h-3.5 w-3.5" />
                          {createInvoiceMutation.isPending ? "..." : "הפק חשבונית"}
                        </Button>
                      )}
                      {isCredit && hasInvoice && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg"
                          title="הורד חשבונית זיכוי"
                          onClick={(e) => { e.stopPropagation(); window.open(p.invoice_url, "_blank"); }}
                        >
                          <FileDown className="h-4 w-4" />
                        </Button>
                      )}
                      {canRefund && (
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                          title={`בצע זיכוי ב-iCount (נותר ₪${remaining.toLocaleString()})`}
                          disabled={refundMutation.isPending}
                          onClick={(e) => {
                            e.stopPropagation();
                            setRefundTarget({ ...p, _remaining: remaining });
                            setRefundAmount(String(remaining));
                          }}
                        >
                          <Undo2 className="h-4 w-4" />
                        </Button>
                      )}
                      <span className={`font-semibold text-sm whitespace-nowrap ${isCredit ? "text-destructive" : "text-primary"}`}>
                        {isCredit ? `−₪${Math.abs(Number(p.amount || 0)).toLocaleString()}` : `₪${Math.abs(Number(p.amount || 0)).toLocaleString()}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <AddPaymentDialog
          open={paymentDialogOpen}
          onOpenChange={setPaymentDialogOpen}
          studentId={studentId!}
          enrollments={enrollments}
          editPayment={editingPayment}
          defaultType={paymentDialogType}
        />

        <Dialog open={!!refundTarget} onOpenChange={(o) => { if (!o) { setRefundTarget(null); setRefundAmount(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>זיכוי לחשבונית {refundTarget?.icount_doc_number ?? ""}</DialogTitle>
              <DialogDescription>
                סכום מקורי: ₪{Number(refundTarget?.amount || 0).toLocaleString()}
                {refundTarget && refundTarget._remaining !== Number(refundTarget.amount) && (
                  <> · נותר לזיכוי: ₪{Number(refundTarget?._remaining || 0).toLocaleString()}</>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="refund-amount">סכום הזיכוי (₪)</Label>
              <Input
                id="refund-amount"
                type="number"
                inputMode="decimal"
                min="0"
                max={refundTarget?._remaining ?? undefined}
                step="0.01"
                className="h-12 rounded-xl"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">הסכום יוחזר ב-iCount ויירשם כשורת זיכוי בתשלומים.</p>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => { setRefundTarget(null); setRefundAmount(""); }}>
                ביטול
              </Button>
              <Button
                className="h-11 rounded-xl"
                disabled={refundMutation.isPending}
                onClick={() => {
                  const amt = Number(refundAmount);
                  const max = Number(refundTarget?._remaining || 0);
                  if (!amt || amt <= 0) { toast.error("נא להזין סכום חיובי"); return; }
                  if (amt > max + 0.001) { toast.error(`הסכום חורג מהנותר לזיכוי (₪${max.toLocaleString()})`); return; }
                  refundMutation.mutate({ paymentId: refundTarget.id, amount: amt });
                }}
              >
                {refundMutation.isPending ? "מבצע..." : "בצע זיכוי"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <StudentInstrumentLoansSection studentType="private" studentId={studentId!} />

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
