import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, CalendarClock, Undo2, Ban, Sparkles, ChevronDown, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { buildPaymentSchedule, scheduleTotals, type ScheduleRow } from "@/lib/paymentSchedule";

const METHOD_LABELS: Record<string, string> = {
  cash: "מזומן",
  credit_card: "אשראי",
  bank_transfer: "העברה בנקאית",
  cheque: "צ׳ק",
  check: "צ׳ק",
  other: "אחר",
};

const STATUS_META: Record<string, { label: string; className: string }> = {
  cleared: { label: "נגבה", className: "bg-green-500/10 text-green-700 border-green-500/30" },
  future: { label: "טרם נגבה", className: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  cancelled: { label: "בוטל", className: "bg-muted text-muted-foreground border-border" },
  refunded: { label: "זוכה", className: "bg-destructive/10 text-destructive border-destructive/30" },
};

const fmt = (n: number) => `₪${Math.round(n).toLocaleString()}`;
const fmtDate = (d: string) => format(new Date(d), "dd/MM/yyyy");

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  payments: any[];
  enrollments: any[];
  /** Optional map of studentId -> full name, used in family (multi-child) context. */
  studentNames?: Map<string, string>;
  /**
   * Credit owed to the parent, taken from the payment calculator
   * (charge after the updated end dates, minus what was already collected).
   */
  creditDue?: number;
  invalidate: () => void;
}

interface CreditRefundChoice {
  items: { paymentId: string; amount: number }[];
  amount: number;
  label: string;
}

const StopEnrollmentDialog = ({ open, onOpenChange, payments, enrollments, studentNames, creditDue = 0, invalidate }: Props) => {
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<null | "cancel" | "refund">(null);
  const [creditRefundChoice, setCreditRefundChoice] = useState<CreditRefundChoice | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const rows = useMemo(() => buildPaymentSchedule(payments), [payments]);
  const totals = useMemo(() => scheduleTotals(rows), [rows]);

  useEffect(() => {
    if (!open) {
      setSelected({});
      setConfirm(null);
      setCreditRefundChoice(null);
      setShowHistory(false);
      setManualMode(false);
    }
  }, [open]);

  const selectedRows = rows.filter((r) => selected[r.key]);
  const toCancel = selectedRows.filter((r) => r.cancellable);
  const toRefund = selectedRows.filter((r) => !r.cancellable && r.refundable && r.kind !== "credit_installment");
  const cancelSum = toCancel.reduce((s, r) => s + r.remaining, 0);
  const refundSum = creditRefundChoice?.amount ?? toRefund.reduce((s, r) => s + r.remaining, 0);

  const ownerNameOf = (r: ScheduleRow) => {
    const ownerId =
      enrollments.find((e: any) => e.id === r.enrollmentId)?.student_id ??
      payments.find((p: any) => p.id === r.paymentId)?.student_id;
    return ownerId ? studentNames?.get(ownerId) : undefined;
  };

  const creditDeals = useMemo(() => {
    const grouped = new Map<string, ScheduleRow[]>();
    for (const row of rows) {
      if (row.kind !== "credit_installment") continue;
      grouped.set(row.paymentId, [...(grouped.get(row.paymentId) ?? []), row]);
    }
    return [...grouped.entries()].map(([paymentId, dealRows]) => ({
      paymentId,
      rows: dealRows,
      paid: dealRows.filter((row) => row.status === "cleared").reduce((sum, row) => sum + row.remaining, 0),
      future: dealRows.filter((row) => row.status === "future").reduce((sum, row) => sum + row.remaining, 0),
      remaining: dealRows.reduce((sum, row) => sum + row.remaining, 0),
      refunded: dealRows.filter((row) => row.status === "refunded").reduce((sum, row) => sum + row.amount, 0),
    }));
  }, [rows]);

  // ── Settlement taken straight from the payment calculator ──────────────
  const settlement = useMemo(() => {
    const credit = Math.round((creditDue ?? 0) * 100) / 100;
    if (credit < 1) return null;
    const futureCredit = creditDeals.reduce((s, d) => s + d.future, 0);
    const fromFuture = Math.min(credit, futureCredit);
    const fromPaid = Math.max(0, Math.round((credit - fromFuture) * 100) / 100);

    let left = credit;
    const items: { paymentId: string; amount: number }[] = [];
    for (const d of [...creditDeals].sort((a, b) => b.future - a.future)) {
      if (left < 1) break;
      const amt = Math.min(left, d.remaining);
      if (amt < 1) continue;
      items.push({ paymentId: d.paymentId, amount: Math.round(amt * 100) / 100 });
      left = Math.round((left - amt) * 100) / 100;
    }
    return { credit, futureCredit, fromFuture: Math.round(fromFuture * 100) / 100, fromPaid, items, uncovered: Math.round(left * 100) / 100 };
  }, [creditDue, creditDeals]);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      const paymentIds = [...new Set(toCancel.map((r) => r.paymentId))];
      const { data, error } = await supabase.functions.invoke("icount-cancel-cheques", {
        body: { paymentIds },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any) => {
      invalidate();
      setSelected({});
      toast.success(`בוטלו ${data?.cancelled_count ?? toCancel.length} צ׳קים · זיכוי ${fmt(Number(data?.cancelled_amount ?? cancelSum))}`);
      if (data?.url) window.open(data.url, "_blank");
    },
    onError: (e: any) => toast.error(`שגיאה בביטול הצ׳קים: ${e?.message ?? ""}`),
  });

  const refundMutation = useMutation({
    mutationFn: async () => {
      const byPayment = new Map<string, { amount: number; method: string | null }>();
      if (creditRefundChoice) {
        for (const it of creditRefundChoice.items) {
          byPayment.set(it.paymentId, { amount: it.amount, method: "credit_card" });
        }
      } else {
        for (const r of toRefund) {
          const cur = byPayment.get(r.paymentId) ?? { amount: 0, method: r.method };
          cur.amount += r.remaining;
          byPayment.set(r.paymentId, cur);
        }
      }
      const results: any[] = [];
      for (const [paymentId, { amount, method }] of byPayment) {
        const rounded = Math.round(amount * 100) / 100;
        if (rounded < 1) continue;
        const isCc = method === "credit_card";
        const { data, error } = isCc
          ? await supabase.functions.invoke("icount-student-refund-api", { body: { paymentId, refundAmount: rounded } })
          : await supabase.functions.invoke("icount-create-refund", { body: { paymentId, amount: rounded } });
        if (error) throw error;
        if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
        results.push(data);
      }
      return results;
    },
    onSuccess: (results: any[]) => {
      invalidate();
      setSelected({});
      setCreditRefundChoice(null);
      toast.success(`בוצעו ${results.length} זיכויים בסך ${fmt(refundSum)}`);
      for (const r of results) if (r?.url) window.open(r.url, "_blank");
    },
    onError: (e: any) => toast.error(`שגיאה בביצוע הזיכוי: ${e?.message ?? ""}`),
  });

  const busy = cancelMutation.isPending || refundMutation.isPending;

  const futureRows = rows.filter((r) => r.status === "future");
  const paidRows = rows.filter((r) => r.status === "cleared");
  const historyRows = rows.filter((r) => r.status === "cancelled" || r.status === "refunded");

  const renderRow = (r: ScheduleRow, opts: { selectable: boolean }) => {
    const selectable = opts.selectable && r.kind !== "credit_installment" && (r.cancellable || r.refundable);
    const ownerName = ownerNameOf(r);
    const meta = STATUS_META[r.status];
    const Wrapper: any = selectable ? "label" : "div";
    return (
      <Wrapper
        key={r.key}
        className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${
          selected[r.key] ? "border-primary bg-primary/5" : "border-border bg-card"
        } ${selectable ? "cursor-pointer" : ""}`}
      >
        {opts.selectable && (
          <Checkbox
            checked={!!selected[r.key]}
            disabled={!selectable || busy}
            onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.key]: !!v }))}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-foreground">{fmtDate(r.dueDate)}</span>
            <span className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${meta.className}`}>
              {meta.label}
            </span>
            {r.kind === "credit_installment" && (
              <span className="text-[11px] px-2 py-0.5 rounded-md border border-border bg-muted text-muted-foreground">
                תשלום {r.installmentIndex}/{r.installmentCount}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ownerName && <span className="font-medium text-foreground">{ownerName} · </span>}
            {METHOD_LABELS[r.method ?? ""] ?? r.method ?? ""}
            {r.reference && ` · ${r.kind === "cheque" ? "צ׳ק מס׳" : "אסמכתא"} ${r.reference}`}
            {r.docNumber && ` · קבלה ${r.docNumber}`}
            {r.kind === "credit_installment" ? " · מטופל למעלה, ברמת עסקת האשראי" : ""}
          </p>
        </div>
        <span className="font-semibold whitespace-nowrap" dir="ltr">{fmt(r.amount)}</span>
      </Wrapper>
    );
  };

  const hasSelection = toCancel.length > 0 || toRefund.length > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto overscroll-contain">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" /> תשלומים עתידיים והחזרים
            </DialogTitle>
            <DialogDescription>
              כאן רואים מה כבר נגבה מההורה, מה עוד עתיד לרדת, וכמה צריך להחזיר לו.
            </DialogDescription>
          </DialogHeader>

          {/* Plain-language summary */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-border bg-muted/30 p-4 text-right">
              <p className="text-xs text-muted-foreground leading-5 min-h-[20px]">סכום העסקה המלא</p>
              <p className="mt-1 text-lg font-bold text-foreground tabular-nums" dir="ltr">
                {fmt(totals.paid + totals.future + totals.cancelled + totals.refunded)}
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-4 text-right">
              <p className="text-xs text-muted-foreground leading-5 min-h-[20px]">כבר נפרע</p>
              <p className="mt-1 text-lg font-bold text-green-700 tabular-nums" dir="ltr">{fmt(totals.paid)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-4 text-right">
              <p className="text-xs text-muted-foreground leading-5 min-h-[20px]">עתיד לרדת</p>
              <p className="mt-1 text-lg font-bold text-amber-700 tabular-nums" dir="ltr">{fmt(totals.future)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-4 text-right">
              <p className="text-xs text-muted-foreground leading-5 min-h-[20px]">
                {totals.cancelled > 0 ? "זוכה / בוטל" : "כבר זוכה"}
              </p>
              <p className="mt-1 text-lg font-bold text-muted-foreground tabular-nums" dir="ltr">
                {fmt(totals.refunded + totals.cancelled)}
              </p>
              {totals.cancelled > 0 && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  כולל צ׳קים שבוטלו בסך {fmt(totals.cancelled)}
                </p>
              )}
            </div>
          </div>


          {/* Recommended action: credit from the calculator */}
          {settlement ? (
            <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">הפעולה המומלצת</p>
              </div>
              <p className="text-sm leading-relaxed">
                לפי המחשבון בכרטיס התלמיד ההורה שילם <strong>{fmt(settlement.credit)}</strong> יותר מדי.
                {settlement.fromFuture > 0 && <> {fmt(settlement.fromFuture)} מתוכם עוד לא ירדו בפועל,</>}
                {settlement.fromPaid > 0 && <> {fmt(settlement.fromPaid)} כבר נגבו,</>}
                {" "}והמערכת תחזיר את הכל בפעולה אחת לכרטיס האשראי המקורי.
              </p>
              {settlement.uncovered >= 1 && (
                <p className="text-xs text-muted-foreground">
                  {fmt(settlement.uncovered)} אינם מכוסים בעסקאות אשראי (צ׳קים/מזומן) — טפלו בהם ברשימה למטה.
                </p>
              )}
              <Button
                className="h-12 rounded-xl w-full text-base"
                disabled={busy || settlement.items.length === 0}
                onClick={() => {
                  const amount = settlement.items.reduce((s, i) => s + i.amount, 0);
                  setCreditRefundChoice({
                    items: settlement.items,
                    amount: Math.round(amount * 100) / 100,
                    label: "זיכוי הפרש לפי המחשבון",
                  });
                  setConfirm("refund");
                }}
              >
                <Undo2 className="h-4 w-4 ml-2" />
                החזר להורה {fmt(settlement.items.reduce((s, i) => s + i.amount, 0))} לאשראי
              </Button>
            </div>
          ) : (
            <div className="rounded-2xl border border-border p-4 flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              אין כרגע יתרת זכות להורה לפי המחשבון. אפשר עדיין לעצור תשלומים עתידיים למטה.
            </div>
          )}

          {/* Credit-card deals */}
          {creditDeals.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-semibold">עסקאות אשראי בתשלומים</p>
              <p className="text-xs text-muted-foreground">
                בעסקת תשלומים אי אפשר לעצור חיוב בודד — אפשר רק להחזיר כסף לכרטיס. בחרו מה להחזיר:
              </p>
              {creditDeals.map((deal) => {
                const firstRow = deal.rows[0];
                const payment = payments.find((item: any) => item.id === deal.paymentId);
                const ownerId = payment?.student_id;
                const ownerName = ownerId ? studentNames?.get(ownerId) : undefined;
                return (
                  <div key={deal.paymentId} className="rounded-xl border border-border p-3 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium text-foreground">
                          {ownerName ? `${ownerName} · ` : ""}אשראי ב־{firstRow.installmentCount} תשלומים
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {firstRow.docNumber ? `קבלה ${firstRow.docNumber} · ` : ""}
                          נגבה עד כה {fmt(deal.paid)} · עתיד לרדת {fmt(deal.future)}
                          {deal.refunded > 0 ? ` · זוכה ${fmt(deal.refunded)}` : ""}
                        </p>
                      </div>
                      <span className="font-bold whitespace-nowrap" dir="ltr">{fmt(deal.remaining)}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        variant="outline"
                        className="h-11 rounded-xl flex-1 whitespace-normal"
                        disabled={busy || deal.future < 1}
                        onClick={() => {
                          setCreditRefundChoice({ items: [{ paymentId: deal.paymentId, amount: deal.future }], amount: deal.future, label: "זיכוי היתרה שטרם נגבתה" });
                          setConfirm("refund");
                        }}
                      >
                        <Ban className="h-4 w-4 ml-1" /> החזר רק את מה שטרם ירד · {fmt(deal.future)}
                      </Button>
                      <Button
                        variant="destructive"
                        className="h-11 rounded-xl flex-1 whitespace-normal"
                        disabled={busy || deal.remaining < 1}
                        onClick={() => {
                          setCreditRefundChoice({ items: [{ paymentId: deal.paymentId, amount: deal.remaining }], amount: deal.remaining, label: "זיכוי מלא של יתרת העסקה" });
                          setConfirm("refund");
                        }}
                      >
                        <Undo2 className="h-4 w-4 ml-1" /> החזר את כל העסקה · {fmt(deal.remaining)}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Schedule */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold">לוח הפירעונות</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-lg text-xs"
                onClick={() => { setManualMode((m) => !m); setSelected({}); }}
              >
                {manualMode ? "סיום בחירה ידנית" : "בחירה ידנית של שורות"}
              </Button>
            </div>

            {rows.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">אין תשלומים להצגה</p>
            )}

            {futureRows.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-amber-700">טרם נגבו · אפשר לבטל צ׳קים</p>
                {futureRows.map((r) => renderRow(r, { selectable: manualMode }))}
              </div>
            )}

            {paidRows.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-green-700">כבר נגבו · אפשר לזכות</p>
                {paidRows.map((r) => renderRow(r, { selectable: manualMode }))}
              </div>
            )}

            {historyRows.length > 0 && (
              <div className="space-y-1.5">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs text-muted-foreground"
                  onClick={() => setShowHistory((s) => !s)}
                >
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${showHistory ? "rotate-180" : ""}`} />
                  היסטוריה — בוטלו/זוכו ({historyRows.length})
                </button>
                {showHistory && historyRows.map((r) => renderRow(r, { selectable: false }))}
              </div>
            )}
          </div>

          {/* Sticky action bar — appears only in manual mode with a selection */}
          {manualMode && (
            <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 border-t border-border bg-background/95 backdrop-blur p-4 space-y-3">
              {hasSelection ? (
                <p className="text-sm">
                  נבחרו {selectedRows.length} שורות:
                  {toCancel.length > 0 && <> ביטול {toCancel.length} צ׳קים בסך <strong>{fmt(cancelSum)}</strong>.</>}
                  {toRefund.length > 0 && <> החזר כספי בסך <strong>{fmt(refundSum)}</strong> להורה.</>}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">סמנו שורות כדי לבטל צ׳קים עתידיים או לזכות תשלומים שכבר נגבו.</p>
              )}
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  variant="outline"
                  className="h-11 rounded-xl flex-1"
                  disabled={busy || toCancel.length === 0}
                  onClick={() => setConfirm("cancel")}
                >
                  {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Ban className="h-4 w-4 ml-1" />}
                  בטל {toCancel.length} צ׳קים
                </Button>
                <Button
                  className="h-11 rounded-xl flex-1"
                  disabled={busy || toRefund.length === 0}
                  onClick={() => setConfirm("refund")}
                >
                  {refundMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Undo2 className="h-4 w-4 ml-1" />}
                  זכה {fmt(refundSum)}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "cancel" ? "לבטל את הצ׳קים?" : "לבצע החזר להורה?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-right">
                {confirm === "cancel" ? (
                  <>
                    <p>יבוטלו {toCancel.length} צ׳קים עתידיים בסך <strong>{fmt(cancelSum)}</strong>.</p>
                    <p>תופק קבלת זיכוי מרוכזת ב-iCount. הכסף לא ירד מההורה.</p>
                  </>
                ) : (
                  <>
                    <p>{creditRefundChoice?.label ?? "זיכוי לפי השורות שנבחרו"} · סכום <strong>{fmt(refundSum)}</strong>.</p>
                    <p>הכסף יוחזר לאמצעי התשלום המקורי ותופק קבלת זיכוי.</p>
                  </>
                )}
                <p className="text-destructive font-medium">הפעולה סופית ולא ניתנת לביטול.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirm === "cancel") cancelMutation.mutate();
                else refundMutation.mutate();
                setConfirm(null);
              }}
            >
              כן, בצע
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => setCreditRefundChoice(null)}>חזרה</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StopEnrollmentDialog;
