import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Trash2 } from "lucide-react";
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
}

const AddPaymentDialog = ({ open, onOpenChange, studentId, enrollments, editPayment }: AddPaymentDialogProps) => {
  const queryClient = useQueryClient();
  const { activeYear } = useAcademicYear();
  const today = format(new Date(), "yyyy-MM-dd");

  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState("credit_card");
  const [installments, setInstallments] = useState("1");
  const [notes, setNotes] = useState("");
  const [selectedEnrollmentId, setSelectedEnrollmentId] = useState("");
  const [transactionType, setTransactionType] = useState<"payment" | "credit">("payment");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isEdit = !!editPayment;

  // Pre-fill form when editing or reset for new
  useEffect(() => {
    if (editPayment) {
      setAmount(String(editPayment.amount));
      setPaymentDate(editPayment.payment_date);
      setPaymentMethod(editPayment.payment_method || "credit_card");
      setInstallments(String((editPayment as any).installments ?? 1));
      setNotes(editPayment.notes || "");
      setSelectedEnrollmentId(editPayment.enrollment_id || enrollments[0]?.id || "");
      setTransactionType((editPayment as any).transaction_type || "payment");
    } else {
      resetForm();
    }
  }, [editPayment, open]);

  const academicYearId = activeYear?.id ?? enrollments.find((e: any) => e.is_active)?.academic_year_id;

  const getEnrollmentLabel = (e: any) =>
    `${e.instruments?.name ?? "—"} — ${e.schools?.name ?? "—"}`;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedEnrollmentId) throw new Error("יש לבחור שיוך");

      const paymentData = {
        amount: parseFloat(amount),
        payment_date: paymentDate,
        payment_method: paymentMethod as any,
        installments: parseInt(installments),
        notes: notes || null,
        enrollment_id: selectedEnrollmentId,
      };

      if (isEdit) {
        const { error } = await supabase.from("student_payments").update(paymentData).eq("id", editPayment!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("student_payments").insert({
          ...paymentData,
          student_id: studentId,
          academic_year_id: academicYearId,
          transaction_type: "payment" as const,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-year-payments"] });
      toast.success(isEdit ? "התשלום עודכן בהצלחה" : "התשלום נוסף בהצלחה");
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || "שגיאה בשמירת תשלום"),
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
      toast.success("התשלום נמחק בהצלחה");
      setShowDeleteConfirm(false);
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || "שגיאה במחיקת תשלום"),
  });

  const resetForm = () => {
    setAmount("");
    setPaymentDate(today);
    setPaymentMethod("credit_card");
    setInstallments("1");
    setNotes("");
    const defaultEnrollment = enrollments.find((e: any) => e.is_active) || enrollments[0];
    setSelectedEnrollmentId(defaultEnrollment?.id || "");
  };

  const canSubmit = amount && parseFloat(amount) > 0 && paymentDate && selectedEnrollmentId;

  const selectClass = "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{isEdit ? "עריכת תשלום" : "הוסף תשלום"}</DialogTitle>
            <DialogDescription>
              {isEdit ? "עדכון פרטי תשלום קיים עבור התלמיד." : "הוספת רישום תשלום פנימי לצורכי מעקב בלבד."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Enrollment selector */}
            <div>
              <Label htmlFor="enrollment-select">שיוך (כלי + בי״ס)</Label>
              <select
                id="enrollment-select"
                value={selectedEnrollmentId}
                onChange={(e) => setSelectedEnrollmentId(e.target.value)}
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
              <Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
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
            <div className="flex gap-2">
              <Button className="flex-1 h-11 rounded-xl" onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
                {mutation.isPending ? "שומר..." : isEdit ? "עדכן תשלום" : "שמור תשלום"}
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
