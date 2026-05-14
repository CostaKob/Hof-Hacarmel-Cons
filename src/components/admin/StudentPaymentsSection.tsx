import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, FileDown, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import AddPaymentDialog from "@/components/admin/AddPaymentDialog";

interface StudentPaymentsSectionProps {
  studentId: string;
  payments: any[];
  enrollments: any[];
  /** Optional extra buttons to render in the header (e.g. "חשב/צור תשלום") */
  extraHeaderActions?: ReactNode;
  /** Invalidation keys to refresh after mutations (in addition to defaults). */
  extraInvalidateKeys?: (string | undefined)[][];
  /** Show academic year next to date (used in student card). */
  showYear?: boolean;
  /** Read-only mode: only show existing payments/credits + download receipt. No add/edit/refund/create-invoice. */
  readOnly?: boolean;
}

const StudentPaymentsSection = ({
  studentId,
  payments,
  enrollments,
  extraHeaderActions,
  extraInvalidateKeys = [],
  showYear = false,
  readOnly = false,
}: StudentPaymentsSectionProps) => {
  const queryClient = useQueryClient();

  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [paymentDialogType, setPaymentDialogType] = useState<"payment" | "credit">("payment");
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [pendingInvoiceParams, setPendingInvoiceParams] = useState<{ paymentId?: string; groupId?: string } | null>(null);
  const [pendingRefund, setPendingRefund] = useState<{ paymentId: string; amount: number } | null>(null);

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
    queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] });
    queryClient.invalidateQueries({ queryKey: ["admin-year-payments"] });
    for (const key of extraInvalidateKeys) queryClient.invalidateQueries({ queryKey: key });
  };

  const createInvoiceMutation = useMutation({
    mutationFn: async (params: { paymentId?: string; groupId?: string }) => {
      const { data, error } = await supabase.functions.invoke("icount-create-invoice", { body: params });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any) => {
      invalidateAll();
      if (data?.url) {
        toast.success(`קבלה ${data.doc_number ?? ""} נוצרה`);
        window.open(data.url, "_blank");
      } else {
        toast.success("קבלה נוצרה");
      }
    },
    onError: (e: any) => toast.error(`שגיאה ביצירת קבלה: ${e?.message ?? ""}`),
  });

  const refundMutation = useMutation({
    mutationFn: async ({ paymentId, amount }: { paymentId: string; amount: number }) => {
      const { data, error } = await supabase.functions.invoke("icount-create-refund", { body: { paymentId, amount } });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any) => {
      invalidateAll();
      toast.success(`זיכוי ${data?.doc_number ?? ""} בוצע`);
      setRefundTarget(null);
      setRefundAmount("");
      if (data?.url) window.open(data.url, "_blank");
    },
    onError: (e: any) => toast.error(`שגיאה בביצוע זיכוי: ${e?.message ?? ""}`),
  });

  const totalPaid = payments.reduce((s: number, p: any) => {
    const amount = Number(p.amount || 0);
    if (amount < 0) return s + amount;
    return p.transaction_type === "payment" ? s + amount : s - amount;
  }, 0);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-foreground text-base">תשלומים ({payments.length})</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            סה״כ שולם: <span className="font-semibold text-foreground">₪{totalPaid.toLocaleString()}</span>
          </div>
          {extraHeaderActions}
          {!readOnly && (
            <Button
              className="h-10 rounded-xl text-sm"
              onClick={() => { setEditingPayment(null); setPaymentDialogType("payment"); setPaymentDialogOpen(true); }}
              disabled={enrollments.length === 0}
            >
              <Plus className="h-4 w-4" /> תשלום / זיכוי
            </Button>
          )}
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
            const isCombined = Array.isArray(p.enrollment_breakdown) && p.enrollment_breakdown.length > 1;
            return (
              <div
                key={p.id}
                onClick={readOnly ? undefined : () => { setEditingPayment(p); setPaymentDialogOpen(true); }}
                className={`flex items-center justify-between rounded-xl border border-border p-3 gap-2 transition-colors ${readOnly ? "" : "cursor-pointer hover:bg-muted/50"}`}
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground text-sm">
                    {format(new Date(p.payment_date), "dd/MM/yyyy")}
                    {showYear && p.academic_years?.name && (
                      <span className="text-muted-foreground font-normal"> · {p.academic_years.name}</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isCredit ? "זיכוי" : "תשלום"}
                    {p.payment_method && ` · ${p.payment_method}`}
                    {p.installments > 1 && ` · ${p.installments} תשלומים`}
                    {p.reference_number && ` · אסמכתא ${p.reference_number}`}
                    {p.icount_doc_number && ` · קבלה ${p.icount_doc_number}`}
                    {p.month_reference && ` · ${p.month_reference}`}
                  </p>
                  {p.notes && <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {!isCredit && hasInvoice && (
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="הורד קבלה"
                      onClick={(e) => { e.stopPropagation(); window.open(p.invoice_url, "_blank"); }}>
                      <FileDown className="h-4 w-4" />
                    </Button>
                  )}
                  {!readOnly && !isCredit && !hasDoc && (
                    <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs"
                      title={isCombined ? "הפק קבלה מאוחדת לכל השיוכים" : "הפק קבלה ב-iCount"}
                      disabled={createInvoiceMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingInvoiceParams(p.payment_group_id ? { groupId: p.payment_group_id } : { paymentId: p.id });
                      }}>
                      <FileDown className="h-3.5 w-3.5" />
                      {createInvoiceMutation.isPending ? "..." : (isCombined ? "הפק קבלה מאוחדת" : "הפק קבלה")}
                    </Button>
                  )}
                  {isCredit && hasInvoice && (
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="הורד קבלת זיכוי"
                      onClick={(e) => { e.stopPropagation(); window.open(p.invoice_url, "_blank"); }}>
                      <FileDown className="h-4 w-4" />
                    </Button>
                  )}
                  {!readOnly && canRefund && (
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                      title={`בצע זיכוי (קבלה במינוס) ב-iCount (נותר ₪${remaining.toLocaleString()})`}
                      disabled={refundMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        setRefundTarget({ ...p, _remaining: remaining });
                        setRefundAmount(String(remaining));
                      }}>
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

      <AddPaymentDialog
        open={paymentDialogOpen}
        onOpenChange={setPaymentDialogOpen}
        studentId={studentId}
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
                setPendingRefund({ paymentId: refundTarget.id, amount: amt });
              }}
            >
              {refundMutation.isPending ? "מבצע..." : "בצע זיכוי"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingInvoiceParams} onOpenChange={(o) => { if (!o) setPendingInvoiceParams(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור הפקת חשבונית</AlertDialogTitle>
            <AlertDialogDescription>
              ⚠️ הפקת חשבונית מס/קבלה ב-iCount היא פעולה <strong>סופית ובלתי הפיכה</strong>.
              החשבונית תישלח באופן מיידי. האם להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={() => {
                if (pendingInvoiceParams) createInvoiceMutation.mutate(pendingInvoiceParams);
                setPendingInvoiceParams(null);
              }}
            >
              כן, הפק חשבונית
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingRefund} onOpenChange={(o) => { if (!o) setPendingRefund(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור הפקת זיכוי</AlertDialogTitle>
            <AlertDialogDescription>
              ⚠️ הפקת חשבונית זיכוי ב-iCount על סך ₪{pendingRefund?.amount.toLocaleString()} היא פעולה <strong>סופית ובלתי הפיכה</strong>.
              האם להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingRefund) refundMutation.mutate(pendingRefund);
                setPendingRefund(null);
              }}
            >
              כן, בצע זיכוי
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default StudentPaymentsSection;
