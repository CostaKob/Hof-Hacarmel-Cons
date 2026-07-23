import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, FileDown, Undo2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import AddPaymentDialog from "@/components/admin/AddPaymentDialog";
import RefundSuccessDialog, { type RefundSuccessInfo } from "@/components/admin/RefundSuccessDialog";

interface StudentPaymentsSectionProps {
  studentId: string;
  payments: any[];
  enrollments: any[];
  /** Optional calculated tuition total for the selected year/screen. */
  totalDue?: number;
  /** Optional calculated balance. Positive = still owes, zero/negative = fully paid. */
  balanceDue?: number;
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
  totalDue,
  balanceDue,
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
  const [refundSuccess, setRefundSuccess] = useState<RefundSuccessInfo | null>(null);

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
    onSuccess: (data: any, vars) => {
      invalidateAll();
      setRefundTarget(null);
      setRefundAmount("");
      setRefundSuccess({
        amount: Number(data?.refund_amount ?? vars.amount ?? 0),
        docNumber: data?.doc_number,
        sentToEmail: data?.sent_to_email,
        url: data?.url,
        ccRefund: false,
      });
    },
    onError: (e: any) => toast.error(`שגיאה בביצוע זיכוי: ${e?.message ?? ""}`),
  });

  const ccRefundMutation = useMutation({
    mutationFn: async ({ paymentId, amount }: { paymentId: string; amount: number }) => {
      const { data, error } = await supabase.functions.invoke("icount-student-refund-api", {
        body: { paymentId, refundAmount: amount },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any, vars) => {
      invalidateAll();
      setRefundTarget(null);
      setRefundAmount("");
      setRefundSuccess({
        amount: Number(data?.refund_amount ?? vars.amount ?? 0),
        docNumber: data?.doc_number,
        sentToEmail: data?.sent_to_email,
        url: data?.url,
        ccRefund: !!data?.cc_refund,
      });
    },
    onError: (e: any) => toast.error(`שגיאה בהחזר אשראי: ${e?.message ?? ""}`),
  });


  const totalPaid = payments.reduce((s: number, p: any) => {
    const amount = Number(p.amount || 0);
    if (amount < 0) return s + amount;
    return p.transaction_type === "payment" ? s + amount : s - amount;
  }, 0);

  const hasCalculatedBalance = typeof balanceDue === "number" && Number.isFinite(balanceDue);
  const calculatedTotal = typeof totalDue === "number" && Number.isFinite(totalDue) ? totalDue : null;
  const preciseBalance = hasCalculatedBalance ? Math.round(balanceDue * 100) / 100 : 0;
  const formatMoney = (n: number) => {
    const abs = Math.abs(n);
    const hasDecimals = Math.round(abs * 100) % 100 !== 0;
    return abs.toLocaleString(undefined, {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    });
  };
  const overallStatus = !hasCalculatedBalance
    ? null
    : calculatedTotal !== null && calculatedTotal <= 0
      ? { label: "לא נקבע חיוב", className: "bg-muted text-muted-foreground border-border" }
      : preciseBalance < -0.005
        ? { label: `קיים זיכוי · ₪${formatMoney(preciseBalance)}`, className: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700" }
        : Math.abs(preciseBalance) < 0.005
          ? { label: "שולם במלואו", className: "bg-primary/15 text-primary border-primary/40" }
          : totalPaid > 0.005
            ? { label: `שולם חלקית · יתרה ₪${formatMoney(preciseBalance)}`, className: "bg-destructive/10 text-destructive border-destructive/30" }
            : { label: `ממתין לתשלום · יתרה ₪${formatMoney(preciseBalance)}`, className: "bg-destructive/10 text-destructive border-destructive/30" };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-foreground text-base">תשלומים ({payments.length})</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            סה״כ שולם: <span className="font-semibold text-foreground">₪{totalPaid.toLocaleString()}</span>
          </div>
          {overallStatus && (
            <span className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${overallStatus.className}`}>
              {overallStatus.label}
            </span>
          )}
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
          {[...payments].sort((a: any, b: any) =>
            new Date(b.created_at || b.payment_date).getTime() - new Date(a.created_at || a.payment_date).getTime()
          ).map((p: any) => {
            const isCredit = p.transaction_type !== "payment";
            const hasInvoice = !!p.invoice_url;
            const hasDoc = !!p.icount_doc_id;
            const refundedSoFar = payments
              .filter((x: any) => x.refund_of_payment_id === p.id)
              .reduce((s: number, x: any) => s + Math.abs(Number(x.amount || 0)), 0);
            const remaining = Math.max(0, Number(p.amount || 0) - refundedSoFar);
            const canRefund = !isCredit && hasDoc && remaining > 0;
            const isCombined = Array.isArray(p.enrollment_breakdown) && p.enrollment_breakdown.length > 1;

            // Status pill: derived from payment_status / refunds / transaction type
            let statusLabel = "";
            let statusClass = "";
            if (isCredit) {
              statusLabel = "זיכוי";
              statusClass = "bg-destructive/10 text-destructive border-destructive/30";
            } else if (p.payment_status === "failed") {
              statusLabel = "נכשל";
              statusClass = "bg-destructive/10 text-destructive border-destructive/30";
            } else if (p.payment_status === "pending") {
              statusLabel = "ממתין לתשלום";
              statusClass = "bg-amber-500/10 text-amber-700 border-amber-500/30";
            } else if (refundedSoFar >= Number(p.amount || 0) - 0.005 && refundedSoFar > 0) {
              statusLabel = "זוכה במלואו";
              statusClass = "bg-muted text-muted-foreground border-border";
            } else if (refundedSoFar > 0) {
              statusLabel = "זוכה חלקית";
              statusClass = "bg-amber-500/10 text-amber-700 border-amber-500/30";
            } else {
              statusLabel = hasCalculatedBalance ? "תשלום התקבל" : "שולם";
              statusClass = "bg-green-500/10 text-green-700 border-green-500/30";
            }

            return (
              <div
                key={p.id}
                onClick={readOnly ? undefined : () => { setEditingPayment(p); setPaymentDialogOpen(true); }}
                className={`flex items-center justify-between rounded-xl border border-border p-3 gap-2 transition-colors ${readOnly ? "" : "cursor-pointer hover:bg-muted/50"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-foreground text-sm">
                      {format(new Date(p.payment_date), "dd/MM/yyyy")}
                      {showYear && p.academic_years?.name && (
                        <span className="text-muted-foreground font-normal"> · {p.academic_years.name}</span>
                      )}
                    </p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${statusClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isCredit ? "זיכוי" : "תשלום"}
                    {p.payment_method && ` · ${p.payment_method}`}
                    {p.installments > 1 && ` · ${p.installments} תשלומים`}
                    {p.reference_number && ` · אסמכתא ${p.reference_number}`}
                    {p.icount_doc_number && ` · קבלה ${p.icount_doc_number}`}
                    {p.month_reference && ` · ${p.month_reference}`}
                  </p>
                  {(() => {
                    const bd = p.enrollment_breakdown;
                    const pd = bd && !Array.isArray(bd) ? (bd as any).payerDetails : null;
                    const pl = bd && !Array.isArray(bd) ? (bd as any).payerLabel : null;
                    if (!pd && !pl) return null;
                    const fullName = pd ? [pd.firstName, pd.lastName].filter(Boolean).join(" ").trim() : "";
                    const contact = pd ? [pd.phone, pd.email].filter(Boolean).join(" · ") : "";
                    return (
                      <p className="text-xs text-foreground mt-0.5">
                        <span className="text-muted-foreground">שולם ע״י: </span>
                        {pl}
                        {pl && fullName ? " · " : ""}
                        {fullName && <span className="font-medium">{fullName}</span>}
                        {contact && <span className="text-muted-foreground"> · {contact}</span>}
                      </p>
                    );
                  })()}
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
                  {!readOnly && isCredit && !hasDoc && (
                    <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs"
                      title="הפק קבלת זיכוי (קבלה במינוס) ב-iCount"
                      disabled={createInvoiceMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingInvoiceParams({ paymentId: p.id });
                      }}>
                      <FileDown className="h-3.5 w-3.5" />
                      {createInvoiceMutation.isPending ? "..." : "הפק קבלת זיכוי"}
                    </Button>
                  )}
                  {!readOnly && canRefund && (
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                      title={p.payment_method === "credit_card"
                        ? `החזר אשראי דרך iCount (נותר ₪${remaining.toLocaleString()})`
                        : `בצע זיכוי (קבלה במינוס) ב-iCount (נותר ₪${remaining.toLocaleString()})`}
                      disabled={refundMutation.isPending || ccRefundMutation.isPending}
                      onClick={(e) => {
                        e.stopPropagation();
                        const isCc = p.payment_method === "credit_card";
                        setRefundTarget({ ...p, _remaining: remaining, _cc: isCc });
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

      <Dialog open={!!refundTarget} onOpenChange={(o) => {
        if (!o && !refundMutation.isPending && !ccRefundMutation.isPending) {
          setRefundTarget(null);
          setRefundAmount("");
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>זיכוי לקבלה {refundTarget?.icount_doc_number ?? ""}</DialogTitle>
            <DialogDescription>
              סכום מקורי: ₪{Number(refundTarget?.amount || 0).toLocaleString()}
              {refundTarget && refundTarget._remaining !== Number(refundTarget.amount) && (
                <> · נותר לזיכוי: ₪{Number(refundTarget?._remaining || 0).toLocaleString()}</>
              )}
            </DialogDescription>
          </DialogHeader>

          {(refundMutation.isPending || ccRefundMutation.isPending) ? (
            <div className="flex flex-col items-center justify-center gap-3 py-6">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">
                {refundTarget?._cc ? "מבצע החזר לכרטיס אשראי..." : "מבצע זיכוי..."}
              </p>
              <p className="text-xs text-muted-foreground text-center">
                אנא המתן, הפעולה עשויה לקחת מספר שניות
              </p>
            </div>
          ) : (
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
              <p className="text-xs text-muted-foreground">
                {refundTarget?._cc
                  ? "⚡ יבוצע החזר אמיתי לכרטיס המקורי דרך iCount בסכום שתבחר, ותופק קבלה במינוס מקושרת לקבלה המקורית. ניתן להחזיר חלקי או מלא."
                  : "תופק קבלה במינוס ב-iCount, מקושרת לקבלה המקורית, ותירשם כשורת זיכוי בתשלומים."}
              </p>
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              disabled={refundMutation.isPending || ccRefundMutation.isPending}
              onClick={() => { setRefundTarget(null); setRefundAmount(""); }}
            >
              ביטול
            </Button>
            <Button
              className="h-11 rounded-xl"
              disabled={refundMutation.isPending || ccRefundMutation.isPending}
              onClick={() => {
                const amt = Number(refundAmount);
                const max = Number(refundTarget?._remaining || 0);
                if (!amt || amt <= 0) { toast.error("נא להזין סכום חיובי"); return; }
                if (amt > max + 0.001) { toast.error(`הסכום חורג מהנותר לזיכוי (₪${max.toLocaleString()})`); return; }
                if (refundTarget?._cc && amt < 1) { toast.error("iCount לא מאפשר החזר אשראי מתחת ל-₪1"); return; }
                setPendingRefund({ paymentId: refundTarget.id, amount: amt });
              }}
            >
              {(refundMutation.isPending || ccRefundMutation.isPending)
                ? <><Loader2 className="h-4 w-4 animate-spin ml-2" />מבצע...</>
                : refundTarget?._cc ? "בצע החזר אשראי" : "בצע זיכוי"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pendingInvoiceParams} onOpenChange={(o) => { if (!o) setPendingInvoiceParams(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור הפקת קבלה</AlertDialogTitle>
            <AlertDialogDescription>
              ⚠️ הפקת קבלה ב-iCount היא פעולה <strong>סופית ובלתי הפיכה</strong>.
              הקבלה תישלח באופן מיידי. האם להמשיך?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              onClick={() => {
                if (pendingInvoiceParams) createInvoiceMutation.mutate(pendingInvoiceParams);
                setPendingInvoiceParams(null);
              }}
            >
              כן, הפק קבלה
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingRefund} onOpenChange={(o) => { if (!o) setPendingRefund(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>{refundTarget?._cc ? "אישור החזר אשראי" : "אישור הפקת זיכוי"}</AlertDialogTitle>
            <AlertDialogDescription>
              {refundTarget?._cc ? (
                <>⚠️ ביצוע החזר אשראי דרך iCount על סך ₪{pendingRefund?.amount.toLocaleString()} הוא פעולה <strong>סופית ובלתי הפיכה</strong>. הכסף יוחזר לכרטיס המקורי. האם להמשיך?</>
              ) : (
                <>⚠️ הפקת קבלה במינוס (זיכוי) ב-iCount על סך ₪{pendingRefund?.amount.toLocaleString()} היא פעולה <strong>סופית ובלתי הפיכה</strong>. האם להמשיך?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (pendingRefund) {
                  if (refundTarget?._cc) ccRefundMutation.mutate(pendingRefund);
                  else refundMutation.mutate(pendingRefund);
                }
                setPendingRefund(null);
              }}
            >
              {refundTarget?._cc ? "כן, בצע החזר אשראי" : "כן, בצע זיכוי"}
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <RefundSuccessDialog info={refundSuccess} onClose={() => setRefundSuccess(null)} />

    </div>
  );
};

export default StudentPaymentsSection;
