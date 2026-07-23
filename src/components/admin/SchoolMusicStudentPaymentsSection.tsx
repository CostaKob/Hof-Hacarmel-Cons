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
import { Plus, FileDown, CreditCard, Trash2, Undo2, Copy, ExternalLink, Link2, MessageCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import RefundSuccessDialog, { type RefundSuccessInfo } from "@/components/admin/RefundSuccessDialog";

interface Props {
  studentId: string;
  schoolMusicSchoolId: string;
  academicYearId: string;
  defaultAmount?: number;
}

type PaymentRow = {
  id: string;
  payment_link_url?: string | null;
  icount_payment_page_id?: string | null;
};

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
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const [pendingInvoiceId, setPendingInvoiceId] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [pendingRefund, setPendingRefund] = useState<{ paymentId: string; amount: number } | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkAmount, setLinkAmount] = useState<string>(String(defaultAmount ?? ""));
  const [linkTargetPaymentId, setLinkTargetPaymentId] = useState<string | undefined>(undefined);

  const { data: payments = [] } = useQuery({
    queryKey: ["sm-student-payments", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_payments" as any)
        .select("*")
        .eq("school_music_student_id", studentId)
        .order("created_at", { ascending: true });
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
        .select("parent_name, parent_phone, student_first_name, student_last_name, icount_payment_url")
        .eq("id", studentId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const hasPending = payments.some((p) => p.payment_status === "pending");

  const studentName = student ? `${student.student_first_name ?? ""} ${student.student_last_name ?? ""}`.trim() : "";
  const waPhone = (student?.parent_phone || "").replace(/\D/g, "").replace(/^0/, "972");
  const buildWaUrl = (link: string) => {
    const msg = encodeURIComponent(
      `שלום${student?.parent_name ? " " + student.parent_name : ""},\n` +
      `קישור לתשלום שכר לימוד עבור ${studentName || "התלמיד"} – ${school?.school_name ?? ""}:\n${link}`
    );
    return `https://wa.me/${waPhone}?text=${msg}`;
  };

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["sm-student-payments", studentId] });
    qc.invalidateQueries({ queryKey: ["school-music-payments"] });
  };

  const generateLinkMutation = useMutation({
    mutationFn: async (args: { paymentId?: string; amount?: number }) => {
      const body: any = { studentId };
      if (args.paymentId) body.paymentId = args.paymentId;
      if (args.amount && args.amount > 0) body.amount = args.amount;
      const { data, error } = await supabase.functions.invoke("icount-generate-paylink", { body });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: () => { invalidate(); toast.success("הקישור נוצר"); setLinkDialogOpen(false); },
    onError: (e: any) => toast.error(e?.message || "שגיאה ביצירת קישור"),
  });


  // Computes current net paid (paid - refunds)
  const computeNetPaid = (rows: any[]) =>
    rows.reduce((s, p) => {
      const isRefund = !!p.refund_of_payment_id || Number(p.amount) < 0;
      const amt = Math.abs(Number(p.amount || 0));
      if (isRefund) return s - amt;
      if (p.payment_status === "paid" || p.payment_status === "refunded") return s + amt;
      return s;
    }, 0);

  // Adds a manual payment as a NEW row. After insert, reconciles pending
  // payment links: deletes them if tuition is fully covered, or updates the
  // amount to the remaining balance otherwise. Caps the entry so total paid
  // never exceeds the annual tuition.
  const addMutation = useMutation({
    mutationFn: async () => {
      let amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("נא להזין סכום חיובי");

      const tuition = Number(defaultAmount ?? 0);
      const currentNet = computeNetPaid(payments);
      if (tuition > 0) {
        const room = Math.max(0, tuition - currentNet);
        if (room <= 0) throw new Error("שכר הלימוד שולם במלואו, לא ניתן להוסיף תשלום נוסף");
        if (amt > room + 0.001) {
          amt = room;
          toast.info(`הסכום הוגבל ל-₪${room.toLocaleString()} (השארית עד שכר הלימוד)`);
        }
      }

      const { error } = await supabase.from("school_music_payments" as any).insert({
        school_music_student_id: studentId,
        school_music_school_id: schoolMusicSchoolId,
        academic_year_id: academicYearId,
        amount: amt,
        payment_status: "paid",
        payment_method: method,
        transaction_reference: reference || null,
        paid_at: new Date().toISOString(),
        notes: notes || null,
      });
      if (error) throw error;

      // Reconcile pending payment links with the new remaining balance
      if (tuition > 0) {
        const newNet = currentNet + amt;
        const remaining = Math.max(0, tuition - newNet);
        const pendingRows = payments.filter((p) => p.payment_status === "pending" && !p.refund_of_payment_id);

        if (remaining <= 0.001 && pendingRows.length > 0) {
          // Fully paid → delete all pending links
          for (const pr of pendingRows) {
            if (pr.payment_link_url || pr.icount_payment_page_id) {
              await supabase.functions.invoke("icount-delete-paypage", {
                body: { paymentId: pr.id, strict: false },
              });
            }
            await supabase.from("school_music_payments" as any).delete().eq("id", pr.id);
          }
        } else if (remaining > 0 && pendingRows.length > 0) {
          // Partial → keep first pending, regenerate link for remaining; delete extras
          const [keep, ...extras] = pendingRows;
          for (const pr of extras) {
            if (pr.payment_link_url || pr.icount_payment_page_id) {
              await supabase.functions.invoke("icount-delete-paypage", {
                body: { paymentId: pr.id, strict: false },
              });
            }
            await supabase.from("school_music_payments" as any).delete().eq("id", pr.id);
          }
          // If a paypage already exists, delete the OLD paypage in iCount first
          // so it can't be used to charge the original (larger) amount.
          const hadLink = !!(keep.payment_link_url || keep.icount_payment_page_id);
          if (hadLink) {
            await supabase.functions.invoke("icount-delete-paypage", {
              body: { paymentId: keep.id, strict: false },
            });
          }
          // Update amount on kept row
          await supabase
            .from("school_music_payments" as any)
            .update({ amount: remaining })
            .eq("id", keep.id);
          // Generate a fresh paypage with the new (remaining) amount
          if (hadLink) {
            await supabase.functions.invoke("icount-generate-paylink", {
              body: { studentId, paymentId: keep.id, amount: remaining },
            });
          }
        }
      }
    },
    onSuccess: () => {
      invalidate();
      setAddOpen(false);
      setAmount(String(defaultAmount ?? ""));
      setMethod("cash");
      setReference("");
      setNotes("");
      toast.success("התשלום נרשם");
    },
    onError: (e: any) => toast.error(e.message || "שגיאה בהוספת תשלום"),
  });



  const deleteMutation = useMutation({
    mutationFn: async (payment: PaymentRow) => {
      if (payment.payment_link_url || payment.icount_payment_page_id) {
        const { data, error } = await supabase.functions.invoke("icount-delete-paypage", {
          body: { paymentId: payment.id, strict: true },
        });
        if (error) throw error;
        if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "שגיאה במחיקת דף הסליקה");
      }

      const { error } = await supabase.from("school_music_payments" as any).delete().eq("id", payment.id);
      if (error) throw error;

      // After deletion, reconcile the pending paylink to reflect the new (larger) remaining balance.
      const tuition = Number(defaultAmount ?? 0);
      if (tuition > 0) {
        const remainingRows = payments.filter((p) => p.id !== payment.id);
        const newNet = computeNetPaid(remainingRows);
        const remaining = Math.max(0, tuition - newNet);
        if (remaining > 0.001) {
          const pendingRows = remainingRows.filter(
            (p) => p.payment_status === "pending" && !p.refund_of_payment_id,
          );
          if (pendingRows.length > 0) {
            const [keep, ...extras] = pendingRows;
            for (const pr of extras) {
              if (pr.payment_link_url || pr.icount_payment_page_id) {
                await supabase.functions.invoke("icount-delete-paypage", {
                  body: { paymentId: pr.id, strict: false },
                });
              }
              await supabase.from("school_music_payments" as any).delete().eq("id", pr.id);
            }
            // Delete old paypage (wrong amount) then regenerate with the new remaining
            if (keep.payment_link_url || keep.icount_payment_page_id) {
              await supabase.functions.invoke("icount-delete-paypage", {
                body: { paymentId: keep.id, strict: false },
              });
            }
            await supabase
              .from("school_music_payments" as any)
              .update({ amount: remaining })
              .eq("id", keep.id);
            await supabase.functions.invoke("icount-generate-paylink", {
              body: { studentId, paymentId: keep.id, amount: remaining },
            });
          } else {
            // No pending row exists — create one with a fresh paylink for the remaining
            const { data: newRow } = await supabase
              .from("school_music_payments" as any)
              .insert({
                school_music_student_id: studentId,
                school_music_school_id: schoolMusicSchoolId,
                academic_year_id: academicYearId,
                amount: remaining,
                payment_status: "pending",
                notes: "נוצר אוטומטית לאחר מחיקת תשלום",
              })
              .select("id")
              .single() as { data: { id: string } | null };
            if (newRow?.id) {
              await supabase.functions.invoke("icount-generate-paylink", {
                body: { studentId, paymentId: newRow.id, amount: remaining },
              });
            }
          }
        }
      }
    },
    onSuccess: () => { invalidate(); toast.success("התשלום נמחק"); },
    onError: (e: any) => toast.error(e?.message || "שגיאה במחיקה"),
  });

  const cleanupStaleLinkMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("icount-delete-paypage", {
        body: { studentId, strict: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "שגיאה במחיקת דף הסליקה");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sm-student-contact", studentId] });
      invalidate();
      toast.success("דף הסליקה הישן נמחק");
    },
    onError: (e: any) => toast.error(e?.message || "שגיאה במחיקת דף הסליקה"),
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

  const totalPaid = computeNetPaid(payments);
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
            סה״כ שולם: <span className="font-semibold text-foreground">₪{totalPaid.toLocaleString()}</span>
            {totalPending > 0 && <> · ממתין לתשלום: <span className="font-semibold text-amber-600">₪{totalPending.toLocaleString()}</span></>}
          </div>
          {!hasPending && (
            <Button
              size="sm"
              variant="outline"
              className="h-10 rounded-xl gap-1"
              onClick={() => {
                setLinkTargetPaymentId(undefined);
                setLinkAmount(String(defaultAmount ?? ""));
                setLinkDialogOpen(true);
              }}
            >
              <Link2 className="h-4 w-4" />
              צור קישור תשלום
            </Button>
          )}
          <Button size="sm" className="h-10 rounded-xl" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" /> הוסף תשלום ידני
          </Button>
        </div>
      </div>


      {payments.length === 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-border p-3 flex-wrap">
          <p className="text-sm text-muted-foreground">לא נרשמו תשלומים</p>
          {student?.icount_payment_url && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 rounded-lg text-xs text-destructive hover:bg-destructive/10"
              disabled={cleanupStaleLinkMutation.isPending}
              onClick={() => cleanupStaleLinkMutation.mutate()}
            >
              <Trash2 className="h-3.5 w-3.5" />
              {cleanupStaleLinkMutation.isPending ? "מוחק..." : "מחק דף סליקה ישן"}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {[...payments].sort((a: any, b: any) =>
            new Date(b.created_at || b.paid_at || b.payment_date).getTime() - new Date(a.created_at || a.paid_at || a.payment_date).getTime()
          ).map((p) => {
            const isRefund = !!p.refund_of_payment_id || Number(p.amount) < 0;
            const hasDoc = !!(p.icount_doc_id || p.icount_doc_number);
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
                <div className="flex items-center gap-1 shrink-0 flex-wrap">
                  {p.payment_status === "pending" && !isRefund && !p.payment_link_url && (
                    <Button size="sm" variant="outline" className="h-8 gap-1 rounded-lg text-xs"
                      title="צור קישור תשלום"
                      onClick={() => {
                        setLinkTargetPaymentId(p.id);
                        setLinkAmount(String(Number(p.amount) || defaultAmount || ""));
                        setLinkDialogOpen(true);
                      }}>
                      <Link2 className="h-3.5 w-3.5" /> צור קישור
                    </Button>
                  )}
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
                      {waPhone && (
                        <Button size="icon" variant="outline" className="h-8 w-8 rounded-lg text-green-600 hover:bg-green-50"
                          title="שלח קישור בוואטסאפ"
                          onClick={() => window.open(buildWaUrl(p.payment_link_url), "_blank")}>
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      )}
                    </>
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
                  {canRefund && (() => {
                    const isCc = p.payment_method === "credit_card";
                    return (
                      <Button size="sm" variant="outline"
                        className={`h-8 gap-1 rounded-lg text-xs text-destructive hover:bg-destructive/10 ${isCc ? "border-destructive/40" : ""}`}
                        title={isCc
                          ? `החזר אשראי דרך iCount (נותר ₪${remaining.toLocaleString()})`
                          : `בצע זיכוי (קבלה במינוס) — נותר ₪${remaining.toLocaleString()}`}
                        disabled={refundMutation.isPending || ccRefundMutation.isPending}
                        onClick={() => { setRefundTarget({ ...p, _remaining: remaining, _cc: isCc }); setRefundAmount(String(remaining)); }}>
                        {isCc ? <CreditCard className="h-3.5 w-3.5" /> : <Undo2 className="h-3.5 w-3.5" />}
                        {isCc ? "זיכוי אשראי" : "זיכוי"}
                      </Button>
                    );
                  })()}
                  {!hasDoc && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        const hasPaypage = !!p.payment_link_url || !!p.icount_payment_page_id;
                        const msg = hasPaypage
                          ? "למחוק את התשלום? דף הסליקה המשויך יימחק קודם מ-iCount."
                          : "למחוק את התשלום?";
                        if (confirm(msg)) deleteMutation.mutate(p);
                      }}>
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

      {/* Generate payment link with custom amount */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>יצירת קישור תשלום</DialogTitle>
            <DialogDescription>
              ניתן לשנות את הסכום לצורך בדיקה (למשל ₪1). ברירת המחדל היא שכר הלימוד של בית הספר.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-sm">סכום לחיוב (₪)</Label>
            <Input type="number" inputMode="decimal" min="1" step="0.01"
              value={linkAmount} onChange={(e) => setLinkAmount(e.target.value)}
              className="h-12 rounded-xl" autoFocus />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => setLinkDialogOpen(false)}>ביטול</Button>
            <Button className="h-11 rounded-xl" disabled={generateLinkMutation.isPending}
              onClick={() => {
                const amt = Number(linkAmount);
                if (!amt || amt <= 0) { toast.error("נא להזין סכום חיובי"); return; }
                generateLinkMutation.mutate({ paymentId: linkTargetPaymentId, amount: amt });
              }}>
              {generateLinkMutation.isPending ? "יוצר..." : "צור קישור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Refund dialog */}
      <Dialog open={!!refundTarget} onOpenChange={(o) => {
        if (!o && !refundMutation.isPending && !ccRefundMutation.isPending) {
          setRefundTarget(null);
          setRefundAmount("");
        }
      }}>
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
              <Label htmlFor="sm-refund-amount">סכום הזיכוי (₪)</Label>
              <Input id="sm-refund-amount" type="number" inputMode="decimal" min="0"
                max={refundTarget?._remaining ?? undefined} step="0.01" className="h-12 rounded-xl"
                value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
              <p className="text-xs text-muted-foreground">
                {refundTarget?._cc
                  ? "⚡ יבוצע החזר אמיתי לכרטיס המקורי דרך iCount בסכום שתבחר, ותופק קבלה במינוס מקושרת לקבלה המקורית. ניתן להחזיר חלקי או מלא."
                  : "תופק קבלה במינוס ב-iCount, מקושרת לקבלה המקורית."}
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
            <Button className="h-11 rounded-xl" disabled={refundMutation.isPending || ccRefundMutation.isPending}
              onClick={() => {
                const amt = Number(refundAmount);
                const max = Number(refundTarget?._remaining || 0);
                if (!amt || amt <= 0) { toast.error("נא להזין סכום חיובי"); return; }
                if (amt > max + 0.001) { toast.error(`הסכום חורג מהנותר (₪${max.toLocaleString()})`); return; }
                setPendingRefund({ paymentId: refundTarget.id, amount: amt });
              }}>
              {(refundMutation.isPending || ccRefundMutation.isPending)
                ? <><Loader2 className="h-4 w-4 animate-spin ml-2" />מבצע...</>
                : refundTarget?._cc ? "בצע החזר אשראי" : "בצע זיכוי"}
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
