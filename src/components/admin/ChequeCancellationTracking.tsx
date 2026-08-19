// Tracking board for the multi-stage cheque cancellation process:
// withdrawal request → cheques returned → bank transfer request → transfer confirmed
// (only at the last stage is the credit receipt issued in iCount).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, FileText, ClipboardCheck, Banknote, Receipt, X, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CHEQUE_REQUEST_STATUS_META, buildChequeWithdrawalLetterHtml, openLetter,
  type ChequeRequestStatus,
} from "@/lib/chequeCancellation";
import { useAppLogo } from "@/hooks/useAppLogo";

const fmt = (n: number) => `₪${Math.round(Number(n || 0)).toLocaleString()}`;
const fmtDate = (d?: string | null) => (d ? format(new Date(d), "dd/MM/yyyy") : "");

interface Props {
  parentNationalId?: string | null;
  studentIds?: string[];
  /** Opens the existing bank-transfer refund letter flow for the remaining difference. */
  onRequestTransfer?: (args: { amount: number; parentName: string }) => void;
  invalidate: () => void;
}

const ChequeCancellationTracking = ({ parentNationalId, studentIds = [], onRequestTransfer, invalidate }: Props) => {
  const queryClient = useQueryClient();
  const { logoUrl } = useAppLogo();
  const [confirmTarget, setConfirmTarget] = useState<any>(null);
  const [reference, setReference] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["cheque-cancellation-requests", parentNationalId, studentIds.join(",")],
    enabled: !!parentNationalId || studentIds.length > 0,
    queryFn: async () => {
      let q = supabase
        .from("cheque_cancellation_requests")
        .select("*, cheque_cancellation_request_items(*)")
        .order("created_at", { ascending: false });
      q = parentNationalId
        ? q.eq("family_parent_national_id", parentNationalId)
        : q.in("student_id", studentIds);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["cheque-cancellation-requests"] });
    invalidate();
  };

  const paymentIdsOf = (r: any) =>
    (r.cheque_cancellation_request_items ?? []).map((i: any) => i.payment_id).filter(Boolean);

  // Stage 2 — the cheques physically came back from the bank.
  const receivedMutation = useMutation({
    mutationFn: async (r: any) => {
      const today = new Date().toISOString().slice(0, 10);
      const ids = paymentIdsOf(r);
      if (ids.length) {
        const { error } = await supabase
          .from("student_payments")
          .update({ cheque_status: "cancelled", cheque_cancelled_at: today } as any)
          .in("id", ids);
        if (error) throw error;
      }
      const { error: uErr } = await supabase
        .from("cheque_cancellation_requests")
        .update({ status: "awaiting_transfer", cheques_received_at: today })
        .eq("id", r.id);
      if (uErr) throw uErr;
    },
    onSuccess: () => { refresh(); toast.success("סומן שהצ׳קים התקבלו"); },
    onError: (e: any) => toast.error(`שגיאה: ${e?.message ?? ""}`),
  });

  // Stage 3 — the bank transfer letter went out to the bookkeeping office.
  const transferRequestedMutation = useMutation({
    mutationFn: async (r: any) => {
      const { error } = await supabase
        .from("cheque_cancellation_requests")
        .update({ status: "transfer_requested", transfer_requested_at: new Date().toISOString().slice(0, 10) })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("סומן שנשלחה בקשת העברה"); },
    onError: (e: any) => toast.error(`שגיאה: ${e?.message ?? ""}`),
  });

  // Stage 4 — the transfer was confirmed → issue the consolidated credit receipt.
  const completeMutation = useMutation({
    mutationFn: async (r: any) => {
      const ids = paymentIdsOf(r);
      const { data, error } = await supabase.functions.invoke("icount-cancel-cheques", {
        body: { paymentIds: ids, reason: "ביטול צ׳קים לאחר החזר בהעברה בנקאית", allowCancelled: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      const { error: uErr } = await supabase
        .from("cheque_cancellation_requests")
        .update({
          status: "completed",
          transfer_confirmed_at: transferDate,
          transfer_reference: reference || null,
          credit_payment_id: data?.credit_payment_id ?? null,
        })
        .eq("id", r.id);
      if (uErr) throw uErr;
      return data;
    },
    onSuccess: (data: any) => {
      refresh();
      setConfirmTarget(null);
      setReference("");
      toast.success("קבלת הזיכוי הופקה והתהליך הושלם");
      if (data?.url) window.open(data.url, "_blank");
    },
    onError: (e: any) => toast.error(`שגיאה בהפקת הזיכוי: ${e?.message ?? ""}`),
  });

  // Step back one stage — the process is fully reversible until it is completed.
  const stepBackMutation = useMutation({
    mutationFn: async (r: any) => {
      const status = r.status as ChequeRequestStatus;
      if (status === "transfer_requested") {
        const { error } = await supabase
          .from("cheque_cancellation_requests")
          .update({ status: "awaiting_transfer", transfer_requested_at: null })
          .eq("id", r.id);
        if (error) throw error;
        return;
      }
      if (status === "awaiting_transfer") {
        const ids = paymentIdsOf(r);
        if (ids.length) {
          await supabase
            .from("student_payments")
            .update({ cheque_status: "pending_cancellation", cheque_cancelled_at: null } as any)
            .in("id", ids);
        }
        const { error } = await supabase
          .from("cheque_cancellation_requests")
          .update({ status: "awaiting_cheques", cheques_received_at: null })
          .eq("id", r.id);
        if (error) throw error;
        return;
      }
      if (status === "cancelled") {
        const ids = paymentIdsOf(r);
        if (ids.length) {
          await supabase
            .from("student_payments")
            .update({ cheque_status: "pending_cancellation", cheque_cancelled_at: null } as any)
            .in("id", ids);
        }
        const { error } = await supabase
          .from("cheque_cancellation_requests")
          .update({ status: "awaiting_cheques", cheques_received_at: null, transfer_requested_at: null })
          .eq("id", r.id);
        if (error) throw error;
      }
    },
    onSuccess: () => { refresh(); toast.success("חזרנו שלב אחורה"); },
    onError: (e: any) => toast.error(`שגיאה: ${e?.message ?? ""}`),
  });

  // Remove a single cheque from an open request (e.g. it was cleared meanwhile).
  const removeItemMutation = useMutation({
    mutationFn: async ({ r, item, cleared }: { r: any; item: any; cleared: boolean }) => {
      const { error: dErr } = await supabase
        .from("cheque_cancellation_request_items")
        .delete()
        .eq("id", item.id);
      if (dErr) throw dErr;

      if (item.payment_id) {
        await supabase
          .from("student_payments")
          .update({
            cheque_status: cleared ? "cleared" : "pending",
            cheque_cleared_at: cleared ? new Date().toISOString().slice(0, 10) : null,
            cheque_cancelled_at: null,
          } as any)
          .eq("id", item.payment_id);
      }

      const rest = (r.cheque_cancellation_request_items ?? []).filter((i: any) => i.id !== item.id);
      if (!rest.length) {
        const { error } = await supabase
          .from("cheque_cancellation_requests")
          .update({ status: "cancelled", cheques_total: 0, refund_amount: 0 })
          .eq("id", r.id);
        if (error) throw error;
        return;
      }
      const total = rest.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
      const { error } = await supabase
        .from("cheque_cancellation_requests")
        .update({
          cheques_total: total,
          refund_amount: Math.max(0, Math.round((Number(r.credit_due || 0) - total) * 100) / 100),
        })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("הצ׳ק הוסר מהבקשה"); },
    onError: (e: any) => toast.error(`שגיאה: ${e?.message ?? ""}`),
  });

  // Abort — cheques go back to normal at any stage before completion.
  const abortMutation = useMutation({
    mutationFn: async (r: any) => {
      const ids = paymentIdsOf(r);
      if (ids.length) {
        await supabase
          .from("student_payments")
          .update({ cheque_status: "pending", cheque_cancelled_at: null } as any)
          .in("id", ids);
      }
      const { error } = await supabase
        .from("cheque_cancellation_requests")
        .update({ status: "cancelled" })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => { refresh(); toast.success("התהליך בוטל והצ׳קים הוחזרו למצב רגיל"); },
    onError: (e: any) => toast.error(`שגיאה: ${e?.message ?? ""}`),
  });


  const reprintLetter = (r: any) => {
    const items = (r.cheque_cancellation_request_items ?? []).map((i: any) => ({
      paymentId: i.payment_id,
      chequeNumber: i.cheque_number ?? "",
      bank: i.bank ?? "",
      branch: i.branch ?? "",
      account: i.account ?? "",
      dueDate: i.due_date ?? "",
      amount: Number(i.amount || 0),
    }));
    openLetter(buildChequeWithdrawalLetterHtml({
      logoUrl,
      parentName: r.parent_name ?? "",
      parentNationalId: r.family_parent_national_id ?? "",
      items,
      reason: r.reason ?? undefined,
    }));
  };

  if (isLoading || requests.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3" dir="rtl">
      <h3 className="font-semibold text-foreground flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-primary" /> תהליכי ביטול צ׳קים
      </h3>

      {requests.map((r: any) => {
        const status = (r.status ?? "awaiting_cheques") as ChequeRequestStatus;
        const meta = CHEQUE_REQUEST_STATUS_META[status] ?? CHEQUE_REQUEST_STATUS_META.awaiting_cheques;
        const items = r.cheque_cancellation_request_items ?? [];
        const busy =
          receivedMutation.isPending || transferRequestedMutation.isPending ||
          completeMutation.isPending || abortMutation.isPending ||
          stepBackMutation.isPending || removeItemMutation.isPending;
        const canStepBack = status === "awaiting_transfer" || status === "transfer_requested" || status === "cancelled";
        const canEditItems = status === "awaiting_cheques" || status === "awaiting_transfer";
        return (
          <div key={r.id} className="rounded-xl border border-border p-3 space-y-2">
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${meta.className}`}>
                    {meta.label}
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {items.length} צ׳קים · {fmt(r.cheques_total)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  נפתח {fmtDate(r.requested_at)}
                  {r.cheques_received_at && ` · צ׳קים התקבלו ${fmtDate(r.cheques_received_at)}`}
                  {r.transfer_requested_at && ` · בקשת העברה ${fmtDate(r.transfer_requested_at)}`}
                  {r.transfer_confirmed_at && ` · הועבר ${fmtDate(r.transfer_confirmed_at)}${r.transfer_reference ? ` (${r.transfer_reference})` : ""}`}
                </p>
                {Number(r.refund_amount) > 0 && status !== "completed" && (
                  <p className="text-xs text-muted-foreground">
                    יתרה להחזר בהעברה בנקאית: <b className="text-foreground">{fmt(r.refund_amount)}</b>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs" onClick={() => reprintLetter(r)}>
                  <FileText className="h-3.5 w-3.5 ms-1" /> מכתב משיכה
                </Button>

                {status === "awaiting_cheques" && (
                  <Button size="sm" className="h-8 rounded-lg text-xs" disabled={busy}
                    onClick={() => receivedMutation.mutate(r)}>
                    {receivedMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin ms-1" /> : <ClipboardCheck className="h-3.5 w-3.5 ms-1" />}
                    הצ׳קים התקבלו
                  </Button>
                )}

                {status === "awaiting_transfer" && (
                  <Button size="sm" className="h-8 rounded-lg text-xs" disabled={busy}
                    onClick={() => {
                      onRequestTransfer?.({ amount: Number(r.refund_amount || 0), parentName: r.parent_name ?? "" });
                      transferRequestedMutation.mutate(r);
                    }}>
                    <Banknote className="h-3.5 w-3.5 ms-1" /> בקשת העברה בנקאית
                  </Button>
                )}

                {status === "transfer_requested" && (
                  <Button size="sm" className="h-8 rounded-lg text-xs" disabled={busy}
                    onClick={() => { setConfirmTarget(r); setReference(""); }}>
                    <Receipt className="h-3.5 w-3.5 ms-1" /> ההעברה אושרה — הפק זיכוי
                  </Button>
                )}

                {canStepBack && (
                  <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" disabled={busy}
                    title="חזרה לשלב הקודם"
                    onClick={() => stepBackMutation.mutate(r)}>
                    <Undo2 className="h-3.5 w-3.5 ms-1" />
                    {status === "cancelled" ? "החזר את התהליך" : "שלב אחורה"}
                  </Button>
                )}

                {status !== "completed" && status !== "cancelled" && (
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive"
                    title="בטל את התהליך והחזר את הצ׳קים למצב רגיל" disabled={busy}
                    onClick={() => { if (confirm("לבטל את תהליך ביטול הצ׳קים? הצ׳קים יחזרו למצב רגיל.")) abortMutation.mutate(r); }}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-1">
              {items.map((i: any) => (
                <div key={i.id} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground rounded-lg px-2 py-1 bg-muted/40">
                  <span>צ׳ק {i.cheque_number ?? ""} · {fmtDate(i.due_date)} · {fmt(i.amount)}</span>
                  {canEditItems && (
                    <span className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-7 rounded-lg text-[11px] text-green-700 hover:bg-green-500/10"
                        title="הצ׳ק נפרע בינתיים — הוצא אותו מהבקשה" disabled={busy}
                        onClick={() => removeItemMutation.mutate({ r, item: i, cleared: true })}>
                        נפרע בינתיים
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 rounded-lg text-[11px]"
                        title="הסר מהבקשה והחזר למצב רגיל" disabled={busy}
                        onClick={() => removeItemMutation.mutate({ r, item: i, cleared: false })}>
                        הסר
                      </Button>
                    </span>
                  )}
                </div>
              ))}
            </div>

          </div>
        );
      })}

      <Dialog open={!!confirmTarget} onOpenChange={(o) => { if (!o && !completeMutation.isPending) setConfirmTarget(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader className="text-right">
            <DialogTitle>אישור ההעברה והפקת קבלת זיכוי</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">תאריך ההעברה</Label>
              <Input type="date" className="h-12 rounded-xl mt-1" value={transferDate}
                onChange={(e) => setTransferDate(e.target.value)} />
            </div>
            <div>
              <Label className="text-sm">אסמכתת העברה</Label>
              <Input className="h-12 rounded-xl mt-1" value={reference} placeholder="מספר אסמכתא מהבנק"
                onChange={(e) => setReference(e.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">
              עם האישור תופק ב-iCount קבלת זיכוי מרוכזת עם פירוט הצ׳קים שבוטלו.
            </p>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button disabled={completeMutation.isPending}
              onClick={() => completeMutation.mutate(confirmTarget)}>
              {completeMutation.isPending && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
              הפק קבלת זיכוי
            </Button>
            <Button variant="ghost" disabled={completeMutation.isPending} onClick={() => setConfirmTarget(null)}>
              חזרה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChequeCancellationTracking;
