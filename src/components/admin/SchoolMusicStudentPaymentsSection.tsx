import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CheckCircle2, ExternalLink, CreditCard, Trash2 } from "lucide-react";
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
  const [status, setStatus] = useState<string>("pending");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [mpMethod, setMpMethod] = useState("cash");
  const [mpRef, setMpRef] = useState("");

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
      setStatus("pending");
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

  const refundMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("school_music_payments" as any)
        .update({ payment_status: "refunded" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("סומן כהוחזר"); },
    onError: () => toast.error("שגיאה"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("school_music_payments" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("התשלום נמחק"); },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  const totalPaid = payments.filter((p) => p.payment_status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
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
            שולם: <span className="font-semibold text-foreground">₪{totalPaid.toLocaleString()}</span>
            {totalPending > 0 && <> · ממתין: <span className="font-semibold text-amber-600">₪{totalPending.toLocaleString()}</span></>}
          </div>
          <Button size="sm" className="h-10 rounded-xl" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> הוסף תשלום
          </Button>
        </div>
      </div>

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">לא נרשמו תשלומים</p>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between rounded-xl border border-border p-3 gap-2 flex-wrap">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-foreground">₪{Number(p.amount).toLocaleString()}</span>
                  <Badge variant={STATUS_VARIANT[p.payment_status] || "secondary"}>
                    {STATUS_LABELS[p.payment_status] || p.payment_status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  נוצר: {new Date(p.created_at).toLocaleDateString("he-IL")}
                  {p.paid_at && ` · שולם: ${new Date(p.paid_at).toLocaleDateString("he-IL")}`}
                  {p.payment_method && ` · ${p.payment_method}`}
                  {p.transaction_reference && ` · אסמכתא ${p.transaction_reference}`}
                  {p.icount_doc_number && ` · קבלה ${p.icount_doc_number}`}
                </p>
                {p.notes && <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {p.payment_status === "pending" && (
                  <Button size="sm" variant="default" className="h-8 gap-1 rounded-lg" onClick={() => setMarkPaidId(p.id)}>
                    <CheckCircle2 className="h-3.5 w-3.5" /> סמן כשולם
                  </Button>
                )}
                {p.payment_status === "paid" && (
                  <Button size="sm" variant="outline" className="h-8 rounded-lg" onClick={() => {
                    if (confirm("לסמן את התשלום כהוחזר?")) refundMutation.mutate(p.id);
                  }}>
                    זיכוי
                  </Button>
                )}
                {p.invoice_url && (
                  <a href={p.invoice_url} target="_blank" rel="noreferrer">
                    <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg">
                      <ExternalLink className="h-3.5 w-3.5" /> קבלה
                    </Button>
                  </a>
                )}
                <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                  onClick={() => { if (confirm("למחוק את התשלום?")) deleteMutation.mutate(p.id); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add payment */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>הוספת תשלום</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">סכום (₪)</Label>
              <Input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">סטטוס</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">ממתין</SelectItem>
                  <SelectItem value="paid">שולם</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {status === "paid" && (
              <>
                <div className="space-y-1.5">
                  <Label className="text-sm">אמצעי תשלום</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">מזומן</SelectItem>
                      <SelectItem value="credit">כרטיס אשראי</SelectItem>
                      <SelectItem value="transfer">העברה בנקאית</SelectItem>
                      <SelectItem value="check">המחאה</SelectItem>
                      <SelectItem value="bit">ביט</SelectItem>
                      <SelectItem value="other">אחר</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">אסמכתא (אופציונלי)</Label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-11 rounded-xl" />
                </div>
              </>
            )}
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
          <DialogHeader>
            <DialogTitle>סימון תשלום כשולם</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">אמצעי תשלום</Label>
              <Select value={mpMethod} onValueChange={setMpMethod}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">מזומן</SelectItem>
                  <SelectItem value="credit">כרטיס אשראי</SelectItem>
                  <SelectItem value="transfer">העברה בנקאית</SelectItem>
                  <SelectItem value="check">המחאה</SelectItem>
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
    </div>
  );
};

export default SchoolMusicStudentPaymentsSection;
