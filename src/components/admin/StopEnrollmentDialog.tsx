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
import { Loader2, CalendarClock, FileText, ChevronDown, Info } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { buildPaymentSchedule, type ScheduleRow } from "@/lib/paymentSchedule";
import {
  createChequeWithdrawalRequest, openLetter, parseChequeMeta,
} from "@/lib/chequeCancellation";
import { useAppLogo } from "@/hooks/useAppLogo";

const STATUS_META: Record<string, { label: string; className: string }> = {
  cleared: { label: "נפרע", className: "bg-green-500/10 text-green-700 border-green-500/30" },
  future: { label: "טרם נפרע", className: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  cancelled: { label: "בוטל", className: "bg-muted text-muted-foreground border-border" },
  refunded: { label: "זוכה", className: "bg-destructive/10 text-destructive border-destructive/30" },
  pending_cancellation: {
    label: "בבקשת ביטול",
    className: "bg-purple-500/10 text-purple-700 border-purple-500/30",
  },
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
  /** Credit owed to the parent, taken from the payment calculator. */
  creditDue?: number;
  parentName?: string;
  parentNationalId?: string;
  academicYearId?: string | null;
  invalidate: () => void;
}

const StopEnrollmentDialog = ({
  open, onOpenChange, studentId, payments, enrollments, studentNames, creditDue = 0,
  parentName = "", parentNationalId = "", academicYearId = null, invalidate,
}: Props) => {
  const { logoUrl } = useAppLogo();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const allRows = useMemo(() => buildPaymentSchedule(payments), [payments]);
  const rows = useMemo(() => allRows.filter((r) => r.kind === "cheque"), [allRows]);

  useEffect(() => {
    if (!open) {
      setSelected({});
      setConfirm(false);
      setShowHistory(false);
    }
  }, [open]);

  const futureRows = rows.filter((r) => r.status === "future");
  const paidRows = rows.filter((r) => r.status === "cleared");
  const pendingRows = rows.filter((r) => r.status === "pending_cancellation");
  const historyRows = rows.filter((r) => r.status === "cancelled" || r.status === "refunded");

  const sum = (list: ScheduleRow[]) => list.reduce((s, r) => s + r.remaining, 0);
  const clearedSum = sum(paidRows);
  const futureSum = sum(futureRows);
  const cancelledSum = historyRows.filter((r) => r.status === "cancelled").reduce((s, r) => s + r.amount, 0);

  const toCancel = futureRows.filter((r) => selected[r.key] && r.cancellable);
  const cancelSum = sum(toCancel);

  const ownerNameOf = (r: ScheduleRow) => {
    const ownerId =
      enrollments.find((e: any) => e.id === r.enrollmentId)?.student_id ??
      payments.find((p: any) => p.id === r.paymentId)?.student_id;
    return ownerId ? studentNames?.get(ownerId) : undefined;
  };

  // Stage 1 of the process: ask the bookkeeping office to pull the cheques from the bank.
  // No accounting document is issued at this point.
  const cancelMutation = useMutation({
    mutationFn: async () => {
      const items = toCancel.map((r) => {
        const p = payments.find((x: any) => x.id === r.paymentId);
        const meta = parseChequeMeta(p?.notes);
        const ownerId = p?.student_id;
        return {
          paymentId: r.paymentId,
          chequeNumber: String(r.reference ?? ""),
          bank: meta.bank,
          branch: meta.branch,
          account: meta.account,
          dueDate: r.dueDate,
          amount: r.amount,
          studentName: ownerId ? studentNames?.get(ownerId) : undefined,
          docNumber: r.docNumber,
        };
      });
      return await createChequeWithdrawalRequest({
        items,
        parentName,
        parentNationalId,
        studentId: studentId || null,
        academicYearId,
        creditDue,
        logoUrl,
      });
    },
    onSuccess: (res) => {
      invalidate();
      setSelected({});
      toast.success(`נפתחה בקשה למשיכת ${toCancel.length} צ׳קים · ${fmt(res.total)}`);
      openLetter(res.html);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(`שגיאה ביצירת הבקשה: ${e?.message ?? ""}`),
  });

  const busy = cancelMutation.isPending;

  /** Money the parent should still get back by bank transfer, after cancelling the selected cheques. */
  const refundAfterCancel = Math.max(0, Math.round(((creditDue ?? 0) - cancelSum) * 100) / 100);

  const renderRow = (r: ScheduleRow, opts: { selectable: boolean }) => {
    const selectable = opts.selectable && r.cancellable;
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
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {ownerName && <span className="font-medium text-foreground">{ownerName} · </span>}
            צ׳ק
            {r.reference && ` מס׳ ${r.reference}`}
            {r.docNumber && ` · קבלה ${r.docNumber}`}
          </p>
        </div>
        <span className="font-semibold whitespace-nowrap" dir="ltr">{fmt(r.amount)}</span>
      </Wrapper>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-y-auto overscroll-contain">
          <DialogHeader className="text-right">
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5 text-primary" /> בקשה למשיכת צ׳קים וביטולם
            </DialogTitle>
            <DialogDescription>
              שלב 1 בתהליך: מסמנים צ׳קים שטרם נפרעו ומפיקים מכתב להנהלת החשבונות למשיכתם מהבנק.
              לא מופק כאן מסמך חשבונאי — קבלת הזיכוי תופק רק לאחר אישור ההעברה הבנקאית.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-border bg-muted/30 p-4 text-right">
              <p className="text-xs text-muted-foreground">נפרע בצ׳קים</p>
              <p className="mt-1 text-lg font-bold text-green-700 tabular-nums" dir="ltr">{fmt(clearedSum)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-4 text-right">
              <p className="text-xs text-muted-foreground">צ׳קים שטרם נפרעו</p>
              <p className="mt-1 text-lg font-bold text-amber-700 tabular-nums" dir="ltr">{fmt(futureSum)}</p>
            </div>
            <div className="rounded-2xl border border-border bg-muted/30 p-4 text-right">
              <p className="text-xs text-muted-foreground">צ׳קים שבוטלו</p>
              <p className="mt-1 text-lg font-bold text-muted-foreground tabular-nums" dir="ltr">{fmt(cancelledSum)}</p>
            </div>
          </div>

          {(creditDue ?? 0) >= 1 && (
            <div className="rounded-2xl border border-border bg-muted/20 p-4 text-sm flex gap-2">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <p className="leading-relaxed">
                לפי המחשבון מגיע להורה החזר של <strong>{fmt(creditDue)}</strong>.
                {cancelSum > 0 && <> אחרי ביטול הצ׳קים שנבחרו ({fmt(cancelSum)}) יישאר להחזיר <strong>{fmt(refundAfterCancel)}</strong>.</>}
                {" "}את יתרת ההחזר מבצעים בהעברה בנקאית דרך חלון התשלום/זיכוי המשפחתי.
              </p>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">אין צ׳קים להצגה במשפחה זו.</p>
          ) : (
            <div className="space-y-3">
              {futureRows.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-amber-700">טרם נפרעו · סמנו כדי לבטל</p>
                  {futureRows.map((r) => renderRow(r, { selectable: true }))}
                </div>
              )}

              {paidRows.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-green-700">כבר נפרעו · לא ניתן לבטל</p>
                  {paidRows.map((r) => renderRow(r, { selectable: false }))}
                </div>
              )}

              {pendingRows.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-purple-700">בבקשת ביטול · ממתינים למשיכה מהבנק</p>
                  {pendingRows.map((r) => renderRow(r, { selectable: false }))}
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
          )}

          {futureRows.length > 0 && (
            <div className="sticky bottom-0 -mx-6 -mb-6 mt-2 border-t border-border bg-background/95 backdrop-blur p-4 space-y-3">
              <p className="text-sm">
                {toCancel.length > 0
                  ? <>נבחרו {toCancel.length} צ׳קים בסך <strong>{fmt(cancelSum)}</strong> לבקשת משיכה מהבנק.</>
                  : <span className="text-muted-foreground">סמנו צ׳קים שטרם הופקדו כדי לבקש את משיכתם.</span>}
              </p>
              <Button
                className="h-11 rounded-xl w-full"
                disabled={busy || toCancel.length === 0}
                onClick={() => setConfirm(true)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <FileText className="h-4 w-4 ml-1" />}
                הפק מכתב בקשה למשיכת {toCancel.length || ""} צ׳קים
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirm} onOpenChange={(o) => { if (!o) setConfirm(false); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לבטל את הצ׳קים?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-right">
                <p>יבוטלו {toCancel.length} צ׳קים עתידיים בסך <strong>{fmt(cancelSum)}</strong>.</p>
                <p>תופק קבלת זיכוי מרוכזת. הכסף לא ייגבה מההורה.</p>
                <p className="text-destructive font-medium">הפעולה סופית ולא ניתנת לביטול.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { cancelMutation.mutate(); setConfirm(false); }}
            >
              כן, בטל
            </AlertDialogAction>
            <AlertDialogCancel>חזרה</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default StopEnrollmentDialog;
