import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";

const PAYMENT_METHODS = [
  { value: "credit_card", label: "אשראי" },
  { value: "cash", label: "מזומן" },
  { value: "check", label: "צ׳ק" },
];

interface AddPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  enrollments: any[];
}

const AddPaymentDialog = ({ open, onOpenChange, studentId, enrollments }: AddPaymentDialogProps) => {
  const queryClient = useQueryClient();
  const today = format(new Date(), "yyyy-MM-dd");

  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState("credit_card");
  const [installments, setInstallments] = useState("1");
  const [notes, setNotes] = useState("");

  // Get academic_year_id from the first active enrollment
  const activeEnrollment = enrollments.find((e: any) => e.is_active) || enrollments[0];
  const academicYearId = activeEnrollment?.academic_year_id;
  const enrollmentId = activeEnrollment?.id;

  const mutation = useMutation({
    mutationFn: async () => {
      if (!enrollmentId) throw new Error("אין רישום פעיל לתלמיד");
      const { error } = await supabase.from("student_payments").insert({
        student_id: studentId,
        enrollment_id: enrollmentId,
        academic_year_id: academicYearId,
        amount: parseFloat(amount),
        payment_date: paymentDate,
        payment_method: paymentMethod as any,
        installments: parseInt(installments),
        transaction_type: "payment" as const,
        notes: notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
      toast.success("התשלום נוסף בהצלחה");
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || "שגיאה בהוספת תשלום"),
  });

  const resetForm = () => {
    setAmount("");
    setPaymentDate(today);
    setPaymentMethod("credit_card");
    setInstallments("1");
    setNotes("");
  };

  const canSubmit = amount && parseFloat(amount) > 0 && paymentDate && enrollmentId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>הוסף תשלום</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label>סכום (₪)</Label>
            <Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          </div>
          <div>
            <Label>תאריך תשלום</Label>
            <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div>
            <Label>אופן תשלום</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>מספר תשלומים</Label>
            <Select value={installments} onValueChange={setInstallments}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>הערות</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות (אופציונלי)" rows={2} />
          </div>
          <Button className="w-full h-11 rounded-xl" onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? "שומר..." : "שמור תשלום"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AddPaymentDialog;
