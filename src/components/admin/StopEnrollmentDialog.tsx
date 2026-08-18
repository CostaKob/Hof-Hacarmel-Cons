import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, CalendarClock, Undo2, Ban } from "lucide-react";
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
  cleared: { label: "נפרע", className: "bg-green-500/10 text-green-700 border-green-500/30" },
  future: { label: "עתידי", className: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
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

  const rows = useMemo(() => buildPaymentSchedule(payments), [payments]);
  const totals = useMemo(() => scheduleTotals(rows), [rows]);

  useEffect(() => {
    if (!open) {
      setSelected({});
      setConfirm(null);
      setCreditRefundChoice(null);
    }
  }, [open]);

  const selectedRows = rows.filter((r) => selected[r.key]);
  const toCancel = selectedRows.filter((r) => r.cancellable);
  const toRefund = selectedRows.filter((r) => !r.cancellable && r.refundable && r.kind !== "credit_installment");
  const cancelSum = toCancel.reduce((s, r) => s + r.remaining, 0);
  const refundSum = creditRefundChoice?.amount ?? toRefund.reduce((s, r) => s + r.remaining, 0);

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

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto overscroll-contain">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" /> לוח תשלומים עתידיים
            </DialogTitle>
            <DialogDescription>
              כל הפירעונות — צ׳קים, תשלומי אשראי ומזומן. סמן מה לבטל ומה לזכות.
            </DialogDescription>
          </DialogHeader>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: "נפרע", value: totals.paid, className: "text-green-700" },
              { label: "עתידי", value: totals.future, className: "text-amber-700" },
              { label: "בוטל", value: totals.cancelled, className: "text-muted-foreground" },
              { label: "זוכה", value: totals.refunded, className: "text-destructive" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                <p className="text-xs text-muted-foreground">{c.label}</p>
                <p className={`font-bold ${c.className}`} dir="ltr">{fmt(c.value)}</p>
              </div>
            ))}
          </div>

          {/* Credit due, straight from the payment calculator */}
          {settlement && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
              <p className="text-sm font-semibold">זיכוי להורה לפי המחשבון · {fmt(settlement.credit)}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                הסכום מגיע מהמחשבון בכרטיס התלמיד (חיוב לאחר עדכון תאריכי הסיום, פחות מה שכבר נגבה).
                מתוכו {fmt(settlement.fromFuture)} מתשלומי אשראי שטרם נגבו
                {settlement.fromPaid > 0 ? ` · ${fmt(settlement.fromPaid)} החזר על מה שכבר נגבה` : ""}
                {settlement.uncovered >= 1
                  ? ` · ${fmt(settlement.uncovered)} אינם מכוסים בעסקאות אשראי (צ׳קים/מזומן — טפל בהם ברשימה למטה)`
                  : ""}
              </p>
              <Button
                className="h-11 rounded-xl w-full"
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
                <Undo2 className="h-4 w-4 ml-1" />
                החזר להורה באשראי {fmt(settlement.items.reduce((s, i) => s + i.amount, 0))}
              </Button>
            </div>
          )}

          {creditDeals.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-semibold">עסקאות אשראי בתשלומים</Label>
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
                          נגבה עד כה {fmt(deal.paid)} · יתרה עתידית {fmt(deal.future)}
                          {deal.refunded > 0 ? ` · זוכה ${fmt(deal.refunded)}` : ""}
                        </p>
                      </div>
                      <span className="font-bold whitespace-nowrap" dir="ltr">{fmt(deal.remaining)}</span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        variant="outline"
                        className="h-10 rounded-xl flex-1"
                        disabled={busy || deal.future < 1}
                        onClick={() => {
                          setCreditRefundChoice({ items: [{ paymentId: deal.paymentId, amount: deal.future }], amount: deal.future, label: "זיכוי היתרה העתידית" });
                          setConfirm("refund");
                        }}
                      >
                        <Ban className="h-4 w-4 ml-1" /> השאר את שנגבה וזכה יתרה {fmt(deal.future)}
                      </Button>
                      <Button
                        variant="destructive"
                        className="h-10 rounded-xl flex-1"
                        disabled={busy || deal.remaining < 1}
                        onClick={() => {
                          setCreditRefundChoice({ items: [{ paymentId: deal.paymentId, amount: deal.remaining }], amount: deal.remaining, label: "זיכוי מלא של יתרת העסקה" });
                          setConfirm("refund");
                        }}
                      >
                        <Undo2 className="h-4 w-4 ml-1" /> זכה את כל העסקה {fmt(deal.remaining)}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      בעסקת תשלומים לא עוצרים חיובים בודדים; הזיכוי מקזז את היתרה מול הכרטיס המקורי.
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Schedule */}
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">אין תשלומים להצגה</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map((r: ScheduleRow) => {
                const selectable = r.kind !== "credit_installment" && (r.cancellable || r.refundable);
                const ownerId =
                  enrollments.find((e: any) => e.id === r.enrollmentId)?.student_id ??
                  payments.find((p: any) => p.id === r.paymentId)?.student_id;
                const ownerName = ownerId ? studentNames?.get(ownerId) : undefined;
                const meta = STATUS_META[r.status];
                return (
                  <label
                    key={r.key}
                    className={`flex items-center gap-3 rounded-xl border p-3 text-sm ${
                      selected[r.key] ? "border-primary bg-primary/5" : "border-border"
                    } ${selectable ? "cursor-pointer" : "opacity-60"}`}
                  >
                    <Checkbox
                      checked={!!selected[r.key]}
                      disabled={!selectable || busy}
                      onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.key]: !!v }))}
                    />
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
                        {r.kind === "credit_installment"
                          ? " · הפעולה מתבצעת ברמת עסקת האשראי"
                          : r.cancellable ? " · ניתן לביטול" : r.refundable ? " · ניתן לזיכוי" : ""}
                      </p>
                    </div>
                    <span className="font-semibold whitespace-nowrap" dir="ltr">{fmt(r.amount)}</span>
                  </label>
                );
              })}
            </div>
          )}

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <div className="flex-1 text-sm text-muted-foreground text-right">
              נבחרו {selectedRows.length} שורות · לביטול {fmt(cancelSum)} · לזיכוי {fmt(refundSum)}
            </div>
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              disabled={busy || toCancel.length === 0}
              onClick={() => setConfirm("cancel")}
            >
              {cancelMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Ban className="h-4 w-4 ml-1" />}
              בטל צ׳קים ({toCancel.length})
            </Button>
            <Button
              className="h-11 rounded-xl"
              disabled={busy || toRefund.length === 0}
              onClick={() => setConfirm("refund")}
            >
              {refundMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Undo2 className="h-4 w-4 ml-1" />}
              זכה {fmt(refundSum)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirm} onOpenChange={(o) => { if (!o) setConfirm(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "cancel" ? "אישור ביטול צ׳קים" : "אישור זיכוי"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "cancel" ? (
                <>⚠️ יבוטלו {toCancel.length} צ׳קים בסך {fmt(cancelSum)} ותופק קבלת זיכוי מרוכזת ב-iCount. הפעולה סופית.</>
              ) : (
                <>⚠️ {creditRefundChoice ? `${creditRefundChoice.label}: ` : "יבוצע זיכוי בסך "}{fmt(refundSum)}. הכסף יוחזר לכרטיס המקורי ותופק קבלה במינוס. הפעולה סופית.</>
              )}
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
            <AlertDialogCancel onClick={() => setCreditRefundChoice(null)}>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StopEnrollmentDialog;
