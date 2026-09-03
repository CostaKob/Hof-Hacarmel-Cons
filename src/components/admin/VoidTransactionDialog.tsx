import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Ban } from "lucide-react";

export type VoidTarget = {
  paymentId: string;
  studentId: string | null;
  academicYearId: string | null;
  paymentMethod: string | null;
  docNumber: string | null;
  /** Amount still open for crediting (full transaction minus existing credits). */
  amount: number;
  studentName?: string | null;
};

export const VOID_REASONS = [
  "טעות בהקלדת פרטי תשלום",
  "טעות בסכום",
  "כפילות בחיוב",
  "ביטול רישום",
  "אחר",
] as const;

const fmt = (n: number) => `₪${Math.abs(n).toLocaleString()}`;

export default function VoidTransactionDialog({
  target,
  onClose,
}: {
  target: VoidTarget | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [reason, setReason] = useState<string>("");
  const [otherReason, setOtherReason] = useState("");
  const [manualDoc, setManualDoc] = useState("");

  const reset = () => {
    setMode("auto");
    setReason("");
    setOtherReason("");
    setManualDoc("");
  };

  const finalReason = reason === "אחר" ? otherReason.trim() : reason;

  const voidMutation = useMutation({
    mutationFn: async () => {
      if (!target) return null;
      const note = `ביטול עסקה — ${finalReason}${target.docNumber ? ` · קבלה מקור ${target.docNumber}` : ""}`;

      if (mode === "auto") {
        const { data, error } = await supabase.functions.invoke("icount-create-refund", {
          body: {
            paymentId: target.paymentId,
            amount: target.amount,
            reason: `ביטול עסקה — ${finalReason}`,
            refundMethod: "void",
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
        return data;
      }

      // The credit note was already issued manually in iCount — record it only.
      const { error } = await supabase.from("student_payments").insert({
        student_id: target.studentId,
        academic_year_id: target.academicYearId,
        amount: -Math.abs(target.amount),
        transaction_type: "credit",
        payment_method: (target.paymentMethod ?? "other") as any,
        payment_date: new Date().toISOString().slice(0, 10),
        payment_status: "paid",
        icount_doc_number: manualDoc.trim() || null,
        icount_doc_type: manualDoc.trim() ? "receipt" : null,
        refund_of_payment_id: target.paymentId,
        installments: 1,
        notes: `${note} — הזיכוי הופק ידנית באייקאונט`,
      } as any);
      if (error) throw error;
      return null;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["family-payments"] });
      queryClient.invalidateQueries({ queryKey: ["student-payments"] });
      queryClient.invalidateQueries({ queryKey: ["private-payments"] });
      toast.success("העסקה בוטלה ונרשם זיכוי מלא");
      if (data?.url) window.open(data.url, "_blank");
      reset();
      onClose();
    },
    onError: (e: any) => toast.error(`שגיאה בביטול העסקה: ${e?.message ?? ""}`),
  });

  const canSubmit = !!finalReason && (mode === "auto" || manualDoc.trim().length > 0);

  return (
    <Dialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o && !voidMutation.isPending) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-md rounded-2xl max-h-[85vh] overflow-y-auto overscroll-contain" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-destructive" />
            ביטול עסקה{target?.docNumber ? ` · קבלה ${target.docNumber}` : ""}
          </DialogTitle>
          <DialogDescription className="text-right">
            העסקה תזוכה במלואה ({target ? fmt(target.amount) : ""}) ותיעלם מדוחות התשלומים והתזרים.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">סיבת הביטול (חובה)</Label>
            <Select value={reason || undefined} onValueChange={setReason}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="בחר סיבה" />
              </SelectTrigger>
              <SelectContent>
                {VOID_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reason === "אחר" && (
              <Textarea
                value={otherReason}
                onChange={(e) => setOtherReason(e.target.value)}
                placeholder="פרט את סיבת הביטול"
                className="rounded-xl"
              />
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">אופן הביטול</Label>
            {([
              { key: "auto" as const, title: "הפק קבלת זיכוי אוטומטית", desc: "המערכת תפיק קבלה במינוס באייקאונט ותרשום את הזיכוי" },
              { key: "manual" as const, title: "הביטול כבר בוצע באייקאונט", desc: "רק רישום הזיכוי במערכת לפי מספר קבלת הזיכוי" },
            ]).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setMode(opt.key)}
                className={`w-full text-right rounded-xl border p-3 transition ${
                  mode === opt.key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
              >
                <p className="text-sm font-medium text-foreground">{opt.title}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
              </button>
            ))}
          </div>

          {mode === "manual" && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">מספר קבלת הזיכוי באייקאונט</Label>
              <Input
                value={manualDoc}
                onChange={(e) => setManualDoc(e.target.value)}
                placeholder="לדוגמה 1165"
                className="h-11 rounded-xl"
                dir="ltr"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="rounded-xl" disabled={voidMutation.isPending} onClick={() => { reset(); onClose(); }}>
            סגור
          </Button>
          <Button
            variant="destructive"
            className="rounded-xl"
            disabled={!canSubmit || voidMutation.isPending}
            onClick={() => voidMutation.mutate()}
          >
            {voidMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin ms-1" />מבטל...</>
              : `בטל עסקה ${target ? fmt(target.amount) : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
