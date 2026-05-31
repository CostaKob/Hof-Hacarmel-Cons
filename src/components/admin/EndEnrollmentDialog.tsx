import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { calcEnrollment, LESSONS_PER_YEAR } from "@/lib/paymentCalc";

interface EndEnrollmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enrollment: any; // full enrollment row with academic_years(name,start_date,end_date), instruments, schools
  /** Sum of payments already made for THIS enrollment (positive = paid, negative = credit). */
  paidSoFar: number;
  /** Default end_date suggestion (today, clamped). */
  defaultDate?: string;
}

const fmt = (n: number) => `₪${Math.round(n).toLocaleString()}`;

const EndEnrollmentDialog = ({
  open,
  onOpenChange,
  enrollment,
  paidSoFar,
  defaultDate,
}: EndEnrollmentDialogProps) => {
  const qc = useQueryClient();
  const [endDate, setEndDate] = useState<string>("");

  // Fetch academic year (for start/end) and payment settings (for global prices)
  const { data: year } = useQuery({
    queryKey: ["academic-year", enrollment?.academic_year_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, name, start_date, end_date")
        .eq("id", enrollment.academic_year_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: open && !!enrollment?.academic_year_id,
  });

  const { data: settings } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_settings")
        .select("lesson_prices")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  // Initialize end date to today (or defaultDate), once dialog opens
  useEffect(() => {
    if (!open) return;
    const today = new Date().toISOString().slice(0, 10);
    setEndDate(defaultDate || today);
  }, [open, defaultDate]);

  const globalPrices = useMemo<Record<string, number>>(() => {
    const lp = (settings?.lesson_prices ?? {}) as Record<string, number>;
    return {
      "30": Number(lp["30"] ?? 0),
      "45": Number(lp["45"] ?? 0),
      "60": Number(lp["60"] ?? 0),
    };
  }, [settings]);

  const calc = useMemo(() => {
    if (!year || !enrollment) return null;
    const e = {
      id: enrollment.id,
      duration: Number(enrollment.lesson_duration_minutes),
      startDate: enrollment.start_date,
      pricePerLessonOverride: enrollment.price_per_lesson,
    } as const;

    // Original: as if running to year end (or current end_date if already set in DB)
    const originalEnd = enrollment.end_date ?? year.end_date;
    const original = calcEnrollment(
      { ...e, endDate: originalEnd },
      globalPrices,
      year.start_date,
      year.end_date
    );
    const proposed = calcEnrollment(
      { ...e, endDate: endDate || year.end_date },
      globalPrices,
      year.start_date,
      year.end_date
    );

    const recommendedCredit = Math.max(0, original.prorated - proposed.prorated);
    const newBalance = proposed.prorated - paidSoFar; // positive = still owes, negative = needs refund
    return { original, proposed, recommendedCredit, newBalance };
  }, [year, enrollment, endDate, globalPrices, paidSoFar]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("enrollments")
        .update({ end_date: endDate, is_active: false })
        .eq("id", enrollment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-student-enrollments"] });
      qc.invalidateQueries({ queryKey: ["admin-students"] });
      qc.invalidateQueries({ queryKey: ["admin-student-payments"] });
      qc.invalidateQueries({ queryKey: ["calc-payments"] });
      const credit = calc?.recommendedCredit ?? 0;
      toast.success(
        credit > 0
          ? `סיום לימודים נשמר. סכום מומלץ לזיכוי: ${fmt(credit)}`
          : "סיום לימודים נשמר."
      );
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "שגיאה בשמירה"),
  });

  const minDate = enrollment?.start_date;
  const maxDate = year?.end_date;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>סיום לימודים</DialogTitle>
          <DialogDescription>
            {enrollment?.instruments?.name} — {enrollment?.schools?.name}
            {year?.name ? ` · ${year.name}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">תאריך סיום *</Label>
            <DateInput
              value={endDate}
              onChange={setEndDate}
              placeholder="בחר תאריך"
            />
            {minDate && endDate && endDate < minDate && (
              <p className="text-xs text-destructive">תאריך הסיום לפני תאריך התחלת הנגינה</p>
            )}
            {maxDate && endDate && endDate > maxDate && (
              <p className="text-xs text-destructive">תאריך הסיום אחרי סוף שנת הלימודים</p>
            )}
          </div>

          {calc && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">חיוב מקורי (עד {enrollment?.end_date ? "תאריך סיום קודם" : "סוף השנה"})</span>
                <span className="font-semibold">{fmt(calc.original.prorated)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  חיוב חדש ({calc.proposed.lessonsRemaining}/{LESSONS_PER_YEAR} שיעורים)
                </span>
                <span className="font-semibold">{fmt(calc.proposed.prorated)}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-semibold">סכום מומלץ לזיכוי</span>
                <span className="font-bold text-destructive">
                  {calc.recommendedCredit > 0 ? fmt(calc.recommendedCredit) : "—"}
                </span>
              </div>
              <div className="border-t border-border pt-2 space-y-1 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>שולם עד כה (נטו)</span>
                  <span>{fmt(paidSoFar)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{calc.newBalance >= 0 ? "יתרה לתשלום אחרי החיוב החדש" : "החזר נדרש (שולם יותר מהחיוב החדש)"}</span>
                  <span className={calc.newBalance < 0 ? "text-destructive font-semibold" : ""}>
                    {fmt(Math.abs(calc.newBalance))}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground pt-1">
                לאחר השמירה — היכנס/י לכרטיס וצור/י זיכוי ידני בסכום זה דרך כפתור "תשלום / זיכוי".
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            className="h-11 rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
          <Button
            className="h-11 rounded-xl"
            disabled={
              !endDate ||
              saveMutation.isPending ||
              (minDate && endDate < minDate) ||
              (maxDate && endDate > maxDate)
            }
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? "שומר..." : "שמור סיום"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EndEnrollmentDialog;
