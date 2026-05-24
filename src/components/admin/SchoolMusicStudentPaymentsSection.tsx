import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CheckCircle2, FileDown, CreditCard, Trash2, Undo2, Link2, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Props {
  studentId: string;
  schoolMusicSchoolId: string;
  academicYearId: string;
  defaultAmount?: number;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "ממתין",
  paid: "שולם",
  refunded: "הוחזר",
  failed: "נכשל",
  cancelled: "בוטל",
};
const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  paid: "default",
  refunded: "outline",
  failed: "destructive",
  cancelled: "outline",
};

const SchoolMusicStudentPaymentsSection = ({ studentId, schoolMusicSchoolId, academicYearId, defaultAmount }: Props) => {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [amount, setAmount] = useState<string>(String(defaultAmount ?? ""));
  const [status, setStatus] = useState<string>("paid");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [mpMethod, setMpMethod] = useState("cash");
  const [mpRef, setMpRef] = useState("");

  const [pendingInvoiceId, setPendingInvoiceId] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [pendingRefund, setPendingRefund] = useState<{ paymentId: string; amount: number } | null>(null);

  const { data: payments = [] } = useQuery({
    queryKey: ["sm-student-payments", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_payments" as any)
        .select("*")
        .eq("school_music_student_id", studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: school } = useQuery({
    queryKey: ["sm-school-payment-link", schoolMusicSchoolId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_schools" as any)
        .select("icount_payment_page_url, school_name")
        .eq("id", schoolMusicSchoolId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: student } = useQuery({
    queryKey: ["sm-student-contact", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_students" as any)
        .select("parent_name, parent_phone, student_first_name, student_last_name")
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // Prefer the personalized prefilled link generated for this student (saved on the pending payment row).
  // Fall back to the school's generic Paypage URL.
  const pendingWithLink = payments.find((p) => p.payment_status === "pending" && p.payment_link_url);
  const paymentLink = (pendingWithLink?.payment_link_url as string | undefined) || (school?.icount_payment_page_url as string | undefined);
  const hasPending = payments.some((p) => p.payment_status === "pending");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sm-student-payments", studentId] });
    qc.invalidateQueries({ queryKey: ["school-music-payments"] });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("נא להזין סכום חיובי");
      const payload: any = {
        school_music_student_id: studentId,
        school_music_school_id: schoolMusicSchoolId,
        academic_year_id: academicYearId,
        amount: amt,
        payment_status: status,
        notes: notes || null,
      };
      if (status === "paid") {
        payload.payment_method = method;
        payload.transaction_reference = reference || null;
        payload.paid_at = new Date().toISOString();
      }
      const { error } = await supabase.from("school_music_payments" as any).insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setAmount(String(defaultAmount ?? ""));
      setStatus("paid");
      setMethod("cash");
      setReference("");
      setNotes("");
      toast.success("התשלום נוסף");
    },
    onError: (e: any) => toast.error(e.message || "שגיאה בהוספת תשלום"),
  });

  const markPaidMutation = useMutation({
    mutationFn: async () => {
      if (!markPaidId) return;
      const { error } = await supabase
        .from("school_music_payments" as any)
        .update({
          payment_status: "paid",
          payment_method: mpMethod,
          transaction_reference: mpRef || null,
          paid_at: new Date().toISOString(),
        })
        .eq("id", markPaidId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setMarkPaidId(null);
      setMpRef("");
      toast.success("התשלום סומן כשולם");
    },
    onError: () => toast.error("שגיאה בעדכון"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("school_music_payments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("התשלום נמחק"); },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  const createReceiptMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { data, error } = await supabase.functions.invoke("icount-create-sm-receipt", { body: { paymentId } });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any) => {
      invalidate();
      toast.success(`קבלה ${data?.doc_number ?? ""} נוצרה`);
      if (data?.url) window.open(data.url, "_blank");
    },
    onError: (e: any) => toast.error(`שגיאה ביצירת קבלה: ${e?.message ?? ""}`),
  });

  const refundMutation = useMutation({
    mutationFn: async ({ paymentId, amount }: { paymentId: string; amount: number }) => {
      const { data, error } = await supabase.functions.invoke("icount-create-sm-refund", { body: { paymentId, amount } });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any) => {
      invalidate();
      toast.success(`זיכוי ${data?.doc_number ?? ""} בוצע`);
      setRefundTarget(null);
      setRefundAmount("");
      if (data?.url) window.open(data.url, "_blank");
    },
    onError: (e: any) => toast.error(`שגיאה בביצוע זיכוי: ${e?.message ?? ""}`),
  });

  const ccRefundMutation = useMutation({
    mutationFn: async ({ paymentId, amount }: { paymentId: string; amount: number }) => {
      const { data, error } = await supabase.functions.invoke("icount-refund-api", {
        body: { paymentId, refundAmount: amount },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any) => {
      invalidate();
      toast.success(`החזר אשראי בוצע${data?.doc_number ? ` · קבלה ${data.doc_number}` : ""}`);
      setRefundTarget(null);
      setRefundAmount("");
      if (data?.url) window.open(data.url, "_blank");
    },
    onError: (e: any) => toast.error(`שגיאה בהחזר אשראי: ${e?.message ?? ""}`),
  });

  const totalPaid = payments
    .filter((p) => p.payment_status === "paid" || p.payment_status === "refunded")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalPending = payments.filter((p) => p.payment_status === "pending").reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-foreground text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" />
          תשלומים ({payments.length})
        </h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            סה״כ: <span className="font-semibold text-foreground">₪{totalPaid.toLocaleString()}</span>
            {totalPending > 0 && <> · ממתין: <span className="font-semibold text-amber-600">₪{totalPending.toLocaleString()}</span></>}
          </div>
          <Button size="sm" className="h-10 rounded-xl" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> הוסף תשלום
          </Button>
        </div>
      </div>

      {paymentLink && hasPending && (() => {
        const studentName = student ? `${student.student_first_name ?? ""} ${student.student_last_name ?? ""}`.trim() : "";
        const waPhone = (student?.parent_phone || "").replace(/\D/g, "").replace(/^0/, "972");
        const msg = encodeURIComponent(
          `שלום${student?.parent_name ? " " + student.parent_name : ""},\n` +
          `קישור לתשלום שכר לימוד עבור ${studentName || "התלמיד"} – ${school?.school_name ?? ""}:\n${paymentLink}`
        );
        return (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Link2 className="h-4 w-4 text-primary" />
              קישור תשלום של {school?.school_name ?? "בית הספר"}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <code className="flex-1 min-w-0 truncate text-xs bg-background border border-border rounded-lg px-2 py-1.5" dir="ltr">
                {paymentLink}
              </code>
              <Button size="sm" variant="outline" className="h-9 rounded-lg gap-1"
                onClick={() => { navigator.clipboard.writeText(paymentLink); toast.success("הקישור הועתק"); }}>
                <Copy className="h-3.5 w-3.5" /> העתק
              </Button>
              <Button size="sm" variant="outline" className="h-9 rounded-lg gap-1"
                onClick={() => window.open(paymentLink, "_blank")}>
                <ExternalLink className="h-3.5 w-3.5" /> פתח
              </Button>
              {waPhone && (
                <Button size="sm" variant="outline" className="h-9 rounded-lg gap-1"
                  onClick={() => window.open(`https://wa.me/${waPhone}?text=${msg}`, "_blank")}>
                  שלח בוואטסאפ
                </Button>
              )}
            </div>
          </div>
        );
      })()}

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">לא נרשמו תשלומים</p>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => {
            const isRefund = !!p.refund_of_payment_id || Number(p.amount) < 0;
            const hasDoc = !!p.icount_doc_id;
            const hasUrl = !!p.invoice_url;
            const refundedSoFar = payments
              .filter((x: any) => x.refund_of_payment_id === p.id)
              .reduce((s: number, x: any) => s + Math.abs(Number(x.amount || 0)), 0);
            const remaining = Math.max(0, Number(p.amount || 0) - refundedSoFar);
            const canIssueReceipt = !isRefund && p.payment_status === "paid" && !hasDoc;
            const canRefund = !isRefund && hasDoc && remaining > 0;
            return (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-border p-3 gap-2 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-semibold ${isRefund ? "text-destructive" : "text-foreground"}`}>
                      {isRefund ? `−₪${Math.abs(Number(p.amount)).toLocaleString()}` : `₪${Number(p.amount).toLocaleString()}`}
                    </span>
                    <Badge variant={STATUS_VARIANT[p.payment_status] || "secondary"}>
                      {isRefund ? "זיכוי" : (STATUS_LABELS[p.payment_status] || p.payment_status)}
                    </Badge>
                    {p.icount_doc_number && <Badge variant="outline">קבלה {p.icount_doc_number}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    נוצר: {new Date(p.created_at).toLocaleDateString("he-IL")}
                    {p.paid_at && ` · שולם: ${new Date(p.paid_at).toLocaleDateString("he-IL")}`}
                    {p.payment_method && ` · ${p.payment_method}`}
                    {p.transaction_reference && ` · אסמכתא ${p.transaction_reference}`}
                  </p>
                  {p.notes && <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.payment_status === "pending" && !isRefund && p.payment_link_url && (
                    <>
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" title="העתק קישור תשלום"
                        onClick={() => { navigator.clipboard.writeText(p.payment_link_url); toast.success("הקישור הועתק"); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" title="פתח קישור תשלום"
                        onClick={() => window.open(p.payment_link_url, "_blank")}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" title="צור קישור תשלום מחדש"
                        onClick={async () => {
                          try {
                            const { data, error } = await supabase.functions.invoke("icount-generate-paylink", {
                              body: { studentId, paymentId: p.id },
                            });
                            if (error) throw error;
                            toast.success("הקישור נוצר מחדש");
                            qc.invalidateQueries({ queryKey: ["school-music-student-payments", studentId] });
                          } catch (e: any) {
                            toast.error(e?.message || "שגיאה ביצירת הקישור");
                          }
                        }}>
                        <RefreshCw className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  {p.payment_status === "pending" && !isRefund && (
                    <Button size="sm" variant="default" className="h-8 gap-1 rounded-lg" onClick={() => setMarkPaidId(p.id)}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> סמן כשולם
                    </Button>
                  )}
                  {canIssueReceipt && (
                    <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg text-xs"
                      disabled={createReceiptMutation.isPending}
                      onClick={() => setPendingInvoiceId(p.id)}>
                      <FileDown className="h-3.5 w-3.5" /> הפק קבלה
                    </Button>
                  )}
                  {hasUrl && (
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg" title="הורד קבלה"
                      onClick={() => window.open(p.invoice_url, "_blank")}>
                      <FileDown className="h-4 w-4" />
                    </Button>
                  )}
                  {canRefund && p.payment_method === "credit_card" && p.icount_transaction_id && (
                    <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg text-xs text-destructive hover:bg-destructive/10 border-destructive/40"
                      title={`החזר אשראי לעסקה ${p.icount_transaction_id} (נותר ₪${remaining.toLocaleString()})`}
                      disabled={ccRefundMutation.isPending}
                      onClick={() => { setRefundTarget({ ...p, _remaining: remaining, _cc: true }); setRefundAmount(String(remaining)); }}>
                      <CreditCard className="h-3.5 w-3.5" /> זיכוי אשראי
                    </Button>
                  )}
                  {canRefund && (
                    <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                      title={`בצע זיכוי (נותר ₪${remaining.toLocaleString()})`}
                      disabled={refundMutation.isPending}
                      onClick={() => { setRefundTarget({ ...p, _remaining: remaining }); setRefundAmount(String(remaining)); }}>
                      <Undo2 className="h-4 w-4" />
                    </Button>
                  )}
                  {!hasDoc && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                      onClick={() => { if (confirm("למחוק את התשלום?")) deleteMutation.mutate(p.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add payment */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>הוספת תשלום</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">סכום (₪)</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">אמצעי תשלום</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">מזומן</SelectItem>
                  <SelectItem value="credit_card">כרטיס אשראי</SelectItem>
                  <SelectItem value="bank_transfer">העברה בנקאית</SelectItem>
                  <SelectItem value="cheque">המחאה</SelectItem>
                  <SelectItem value="bit">ביט</SelectItem>
                  <SelectItem value="other">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">אסמכתא (אופציונלי)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-11 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">הערות</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11 rounded-xl" />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setAddOpen(false)}>ביטול</Button>
            <Button className="h-11 rounded-xl" disabled={addMutation.isPending} onClick={() => addMutation.mutate()}>
              {addMutation.isPending ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark paid */}
      <Dialog open={!!markPaidId} onOpenChange={(o) => !o && setMarkPaidId(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader><DialogTitle>סימון תשלום כשולם</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">אמצעי תשלום</Label>
              <Select value={mpMethod} onValueChange={setMpMethod}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">מזומן</SelectItem>
                  <SelectItem value="credit_card">כרטיס אשראי</SelectItem>
                  <SelectItem value="bank_transfer">העברה בנקאית</SelectItem>
                  <SelectItem value="cheque">המחאה</SelectItem>
                  <SelectItem value="bit">ביט</SelectItem>
                  <SelectItem value="other">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">אסמכתא (אופציונלי)</Label>
              <Input value={mpRef} onChange={(e) => setMpRef(e.target.value)} className="h-11 rounded-xl" />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setMarkPaidId(null)}>ביטול</Button>
            <Button className="h-11 rounded-xl" disabled={markPaidMutation.isPending} onClick={() => markPaidMutation.mutate()}>
              אישור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund dialog */}
      <Dialog open={!!refundTarget} onOpenChange={(o) => { if (!o) { setRefundTarget(null); setRefundAmount(""); } }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>זיכוי לקבלה {refundTarget?.icount_doc_number ?? ""}</DialogTitle>
            <DialogDescription>
              סכום מקורי: ₪{Number(refundTarget?.amount || 0).toLocaleString()}
              {refundTarget && refundTarget._remaining !== Number(refundTarget.amount) && (
                <> · נותר לזיכוי: ₪{Number(refundTarget?._remaining || 0).toLocaleString()}</>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="sm-refund-amount">סכום הזיכוי (₪)</Label>
            <Input id="sm-refund-amount" type="number" inputMode="decimal" min="0"
              max={refundTarget?._remaining ?? undefined} step="0.01" className="h-12 rounded-xl"
              value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
            <p className="text-xs text-muted-foreground">תופק קבלה במינוס ב-iCount, מקושרת לקבלה המקורית.</p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => { setRefundTarget(null); setRefundAmount(""); }}>
              ביטול
            </Button>
            <Button className="h-11 rounded-xl" disabled={refundMutation.isPending || ccRefundMutation.isPending}
              onClick={() => {
                const amt = Number(refundAmount);
                const max = Number(refundTarget?._remaining || 0);
                if (!amt || amt <= 0) { toast.error("נא להזין סכום חיובי"); return; }
                if (amt > max + 0.001) { toast.error(`הסכום חורג מהנותר (₪${max.toLocaleString()})`); return; }
                setPendingRefund({ paymentId: refundTarget.id, amount: amt });
              }}>
              {(refundMutation.isPending || ccRefundMutation.isPending) ? "מבצע..." : refundTarget?._cc ? "בצע החזר אשראי" : "בצע זיכוי"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm receipt */}
      <AlertDialog open={!!pendingInvoiceId} onOpenChange={(o) => { if (!o) setPendingInvoiceId(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור הפקת קבלה</AlertDialogTitle>
            <AlertDialogDescription>
              ⚠️ הפקת קבלה ב-iCount היא פעולה <strong>סופית ובלתי הפיכה</strong>. האם להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={() => {
              if (pendingInvoiceId) createReceiptMutation.mutate(pendingInvoiceId);
              setPendingInvoiceId(null);
            }}>
              כן, הפק קבלה
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm refund */}
      <AlertDialog open={!!pendingRefund} onOpenChange={(o) => { if (!o) setPendingRefund(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור הפקת זיכוי</AlertDialogTitle>
            <AlertDialogDescription>
              ⚠️ הפקת קבלה במינוס על ₪{pendingRefund?.amount.toLocaleString()} ב-iCount היא פעולה <strong>סופית ובלתי הפיכה</strong>. האם להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingRefund) {
                  if (refundTarget?._cc) ccRefundMutation.mutate(pendingRefund);
                  else refundMutation.mutate(pendingRefund);
                }
                setPendingRefund(null);
              }}>
              כן, בצע זיכוי
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SchoolMusicStudentPaymentsSection;
