import { useState, useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Link as LinkIcon, Loader2, Plus, Copy, ExternalLink, Split } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const PAYMENT_METHODS = [
  { value: "credit_card", label: "אשראי" },
  { value: "cash", label: "מזומן" },
  { value: "check", label: "צ׳ק" },
];

interface PaymentData {
  id: string;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  installments?: number;
  notes: string | null;
  academic_year_id: string | null;
  enrollment_id?: string;
}

interface AddPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  enrollments: any[];
  editPayment?: PaymentData | null;
  defaultType?: "payment" | "credit";
}

const AddPaymentDialog = ({ open, onOpenChange, studentId, enrollments, editPayment, defaultType }: AddPaymentDialogProps) => {
  const queryClient = useQueryClient();
  const { activeYear } = useAcademicYear();
  const today = format(new Date(), "yyyy-MM-dd");

  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState("credit_card");
  const [installments, setInstallments] = useState("1");
  const [notes, setNotes] = useState("");
  // Multi-select map: enrollmentId -> amount string
  const [selectedAmounts, setSelectedAmounts] = useState<Record<string, string>>({});
  // Edit-mode single enrollment + amount
  const [editEnrollmentId, setEditEnrollmentId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [transactionType, setTransactionType] = useState<"payment" | "credit">("payment");
  const [invoiceMode, setInvoiceMode] = useState<"combined" | "separate">("combined");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitParts, setSplitParts] = useState<Array<{ label: string; amount: string }>>([
    { label: "חלק 1", amount: "" },
    { label: "חלק 2", amount: "" },
  ]);
  const [splitResults, setSplitResults] = useState<Array<{ label: string; url: string }>>([]);

  const isEdit = !!editPayment;

  const suggestedFor = (e: any) => {
    const ppl = Number(e?.price_per_lesson || 0);
    const total = Number(e?.total_lessons_allocated || 0);
    const v = Math.round(ppl * total);
    return v > 0 ? String(v) : "";
  };

  // Pre-fill form when editing or reset for new
  useEffect(() => {
    if (editPayment) {
      setEditAmount(String(editPayment.amount));
      setPaymentDate(editPayment.payment_date);
      setPaymentMethod(editPayment.payment_method || "credit_card");
      setInstallments(String((editPayment as any).installments ?? 1));
      setNotes(editPayment.notes || "");
      setEditEnrollmentId(editPayment.enrollment_id || enrollments[0]?.id || "");
      setTransactionType((editPayment as any).transaction_type || "payment");
    } else {
      resetForm();
      if (defaultType) setTransactionType(defaultType);
    }
  }, [editPayment, open, defaultType]);

  const academicYearId = activeYear?.id ?? enrollments.find((e: any) => e.is_active)?.academic_year_id;

  const getEnrollmentLabel = (e: any) =>
    `${e.instruments?.name ?? "—"} — ${e.schools?.name ?? "—"}`;

  const activeEnrollments = useMemo(() => enrollments.filter((e: any) => e.is_active), [enrollments]);

  const totalSelected = useMemo(() => {
    return Object.values(selectedAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  }, [selectedAmounts]);

  const toggleEnrollment = (e: any, checked: boolean) => {
    setSelectedAmounts((prev) => {
      const next = { ...prev };
      if (checked) {
        next[e.id] = prev[e.id] ?? suggestedFor(e);
      } else {
        delete next[e.id];
      }
      return next;
    });
  };

  const selectAll = () => {
    const next: Record<string, string> = {};
    for (const e of activeEnrollments) next[e.id] = selectedAmounts[e.id] ?? suggestedFor(e);
    setSelectedAmounts(next);
  };
  const clearAll = () => setSelectedAmounts({});

  const mutation = useMutation({
    mutationFn: async () => {
      if (isEdit) {
        if (!editEnrollmentId) throw new Error("יש לבחור שיוך");
        const amt = parseFloat(editAmount);
        if (!amt || amt <= 0) throw new Error("יש להזין סכום");
        const { error } = await supabase
          .from("student_payments")
          .update({
            amount: amt,
            payment_date: paymentDate,
            payment_method: paymentMethod as any,
            installments: parseInt(installments),
            notes: notes || null,
            enrollment_id: editEnrollmentId,
            transaction_type: transactionType,
          })
          .eq("id", editPayment!.id);
        if (error) throw error;
        return;
      }

      const entries = Object.entries(selectedAmounts)
        .map(([eid, amt]) => ({ eid, amt: parseFloat(amt) }))
        .filter((x) => x.eid && x.amt > 0);
      if (entries.length === 0) throw new Error("יש לבחור לפחות שיוך אחד עם סכום");

      const baseFields = {
        payment_date: paymentDate,
        payment_method: paymentMethod as any,
        installments: parseInt(installments),
        notes: notes || null,
        transaction_type: transactionType,
        student_id: studentId,
        academic_year_id: academicYearId,
      };

      let rows: any[];
      if (entries.length > 1 && invoiceMode === "combined") {
        // Single payment row covering multiple enrollments → single combined invoice
        const total = entries.reduce((s, x) => s + x.amt, 0);
        rows = [{
          ...baseFields,
          amount: total,
          enrollment_id: entries[0].eid,
          enrollment_breakdown: entries.map(({ eid, amt }) => ({ enrollment_id: eid, amount: amt })),
        }];
      } else {
        // Separate row per enrollment → separate invoice per row
        rows = entries.map(({ eid, amt }) => ({
          ...baseFields,
          amount: amt,
          enrollment_id: eid,
        }));
      }

      const { error } = await supabase.from("student_payments").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-year-payments"] });
      queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] });
      toast.success(isEdit ? "הרישום עודכן בהצלחה" : "הרישום נוסף בהצלחה");
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || "שגיאה בשמירת הרישום"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!editPayment) return;
      const { error } = await supabase.from("student_payments").delete().eq("id", editPayment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-year-payments"] });
      queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] });
      toast.success("התשלום נמחק בהצלחה");
      setShowDeleteConfirm(false);
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || "שגיאה במחיקת תשלום"),
  });

  const generateLinkMutation = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(selectedAmounts)
        .map(([eid, amt]) => ({ eid, amt: parseFloat(amt) }))
        .filter((x) => x.eid && x.amt > 0);
      if (entries.length === 0) throw new Error("יש לבחור לפחות שיוך אחד עם סכום");
      const total = Math.round(entries.reduce((s, x) => s + x.amt, 0) * 100) / 100;
      if (total <= 0) throw new Error("סכום חייב להיות גדול מ-0");

      const lines = entries.map(({ eid, amt }) => {
        const e = enrollments.find((x: any) => x.id === eid);
        const desc = e ? `${e.instruments?.name ?? "שכר לימוד"} — ${e.schools?.name ?? ""}`.trim() : "שכר לימוד";
        return { description: desc.replace(/ — $/, ""), amount: Math.round(amt * 100) / 100 };
      });

      const { data, error } = await supabase.functions.invoke("icount-generate-student-paylink", {
        body: {
          studentId,
          amount: total,
          academicYearId,
          academicYearName: activeYear?.name ?? null,
          lines,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      if (!data?.url) throw new Error("לא התקבל קישור");
      return data as { url: string };
    },
    onSuccess: async (data) => {
      try { await navigator.clipboard.writeText(data.url); } catch { /* noop */ }
      window.open(data.url, "_blank");
      queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-year-payments"] });
      queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["calc-pending-payments-all-years", studentId] });
      toast.success("קישור התשלום נוצר והועתק ללוח");
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || "שגיאה ביצירת קישור"),
  });

  const resetForm = () => {
    setPaymentDate(today);
    setPaymentMethod("credit_card");
    setInstallments("1");
    setNotes("");
    setTransactionType("payment");
    setSelectedAmounts({});
    setEditEnrollmentId("");
    setEditAmount("");
    setInvoiceMode("combined");
  };

  const canSubmit = isEdit
    ? !!editEnrollmentId && parseFloat(editAmount) > 0 && !!paymentDate
    : Object.entries(selectedAmounts).some(([, v]) => parseFloat(v) > 0) && !!paymentDate;

  const selectClass =
    "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overscroll-contain" dir="rtl">
          <DialogHeader>
            <DialogTitle>{isEdit ? "עריכת רישום" : "הוסף תשלום / זיכוי"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "עדכון פרטי רישום קיים."
                : "כל שיוך ייווצר כרישום נפרד עם הסכום שלו (וכפריט נפרד בקבלה)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Transaction type */}
            <div>
              <Label>סוג רישום</Label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  className={`flex-1 h-10 rounded-lg text-sm font-medium border transition-colors ${transactionType === "payment" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input hover:bg-muted"}`}
                  onClick={() => setTransactionType("payment")}
                >
                  תשלום
                </button>
                <button
                  type="button"
                  className={`flex-1 h-10 rounded-lg text-sm font-medium border transition-colors ${transactionType === "credit" ? "bg-destructive text-destructive-foreground border-destructive" : "bg-background text-muted-foreground border-input hover:bg-muted"}`}
                  onClick={() => setTransactionType("credit")}
                >
                  זיכוי
                </button>
              </div>
            </div>

            {/* Enrollment selector */}
            {isEdit ? (
              <>
                <div>
                  <Label htmlFor="enrollment-select">שיוך (כלי + בי״ס)</Label>
                  <select
                    id="enrollment-select"
                    value={editEnrollmentId}
                    onChange={(e) => setEditEnrollmentId(e.target.value)}
                    className={selectClass}
                  >
                    <option value="" disabled>בחר שיוך...</option>
                    {enrollments.map((e: any) => (
                      <option key={e.id} value={e.id}>
                        {getEnrollmentLabel(e)}{!e.is_active ? " (לא פעיל)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>סכום (₪)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <Label>שיוכים וסכומים</Label>
                  <div className="flex gap-2 text-xs">
                    <button type="button" className="text-primary hover:underline" onClick={selectAll}>בחר הכל</button>
                    <span className="text-muted-foreground">·</span>
                    <button type="button" className="text-muted-foreground hover:underline" onClick={clearAll}>נקה</button>
                  </div>
                </div>
                {activeEnrollments.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-2">אין שיוכים פעילים</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {activeEnrollments.map((e: any) => {
                      const checked = selectedAmounts[e.id] !== undefined;
                      return (
                        <div key={e.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => toggleEnrollment(e, !!v)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{getEnrollmentLabel(e)}</p>
                            {e.price_per_lesson ? (
                              <p className="text-xs text-muted-foreground">
                                ₪{Number(e.price_per_lesson).toLocaleString()} × {e.total_lessons_allocated || 0} שיעורים
                              </p>
                            ) : null}
                          </div>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!checked}
                            value={selectedAmounts[e.id] ?? ""}
                            onChange={(ev) =>
                              setSelectedAmounts((prev) => ({ ...prev, [e.id]: ev.target.value }))
                            }
                            placeholder={suggestedFor(e) || "0.00"}
                            className="w-28 h-9"
                          />
                        </div>
                      );
                    })}
                    {Object.keys(selectedAmounts).length > 1 && (
                      <>
                        <p className="text-xs text-muted-foreground text-end">
                          סה״כ: ₪{totalSelected.toLocaleString()}
                        </p>
                        <div className="rounded-lg border border-border p-2 space-y-2 bg-muted/30">
                          <Label className="text-xs">מצב קבלה</Label>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className={`flex-1 h-9 rounded-md text-xs font-medium border transition-colors ${invoiceMode === "combined" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input hover:bg-muted"}`}
                              onClick={() => setInvoiceMode("combined")}
                            >
                              קבלה מאוחדת אחת
                            </button>
                            <button
                              type="button"
                              className={`flex-1 h-9 rounded-md text-xs font-medium border transition-colors ${invoiceMode === "separate" ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-input hover:bg-muted"}`}
                              onClick={() => setInvoiceMode("separate")}
                            >
                              קבלה נפרדת לכל שיוך
                            </button>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            {invoiceMode === "combined"
                              ? "ייווצר רישום תשלום אחד מאוחד וקבלה אחת עם פירוט פר שיוך."
                              : "ייווצר רישום נפרד לכל שיוך וקבלה נפרדת לכל אחד."}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>תאריך תשלום</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="payment-method">אופן תשלום</Label>
              <select id="payment-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={selectClass}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="installments">מספר תשלומים</Label>
              <select id="installments" value={installments} onChange={(e) => setInstallments(e.target.value)} className={selectClass}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={String(n)}>{n}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>הערות</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות (אופציונלי)" rows={2} />
            </div>
            {!isEdit && transactionType === "payment" && paymentMethod === "credit_card" && (
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl"
                onClick={() => generateLinkMutation.mutate()}
                disabled={totalSelected <= 0 || generateLinkMutation.isPending}
              >
                {generateLinkMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 animate-spin ml-2" /> יוצר קישור...</>
                ) : (
                  <><LinkIcon className="h-4 w-4 ml-2" /> צור קישור לתשלום באשראי {totalSelected > 0 ? `(₪${totalSelected.toLocaleString()})` : ""}</>
                )}
              </Button>
            )}
            <div className="flex gap-2">
              <Button className="flex-1 h-11 rounded-xl" onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
                {mutation.isPending ? "שומר..." : isEdit ? "עדכן" : transactionType === "credit" ? "שמור זיכוי" : "שמור תשלום"}
              </Button>
              {isEdit && (
                <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteConfirm(true)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת תשלום</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את התשלום על סך ₪{editPayment?.amount?.toLocaleString()}? פעולה זו אינה ניתנת לביטול.
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
    </>
  );
};

export default AddPaymentDialog;
