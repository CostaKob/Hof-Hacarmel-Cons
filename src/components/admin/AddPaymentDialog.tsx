import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { calcEnrollment } from "@/lib/paymentCalc";
import { computeStandardDiscounts, type DiscountType } from "@/lib/discounts";

const PAYMENT_METHODS = [
  { value: "credit_card", label: "אשראי" },
  { value: "cash", label: "מזומן" },
  { value: "check", label: "צ׳ק" },
];

const HEBREW_YEAR_MAP: Record<string, string> = {
  "2024-2025": "תשפ״ה",
  "2025-2026": "תשפ״ו",
  "2026-2027": "תשפ״ז",
  "2027-2028": "תשפ״ח",
  "2028-2029": "תשפ״ט",
  "2029-2030": "תש״צ",
  "2030-2031": "תשצ״א",
};

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
  const [checkNumber, setCheckNumber] = useState("");
  // Multi-select map: enrollmentId -> amount string
  const [selectedAmounts, setSelectedAmounts] = useState<Record<string, string>>({});
  // Edit-mode single enrollment + amount
  const [editEnrollmentId, setEditEnrollmentId] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [transactionType, setTransactionType] = useState<"payment" | "credit">("payment");
  // invoiceMode removed — always combined when multiple entries
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitParts, setSplitParts] = useState<Array<{ label: string; amount: string; firstName: string; lastName: string; email: string; phone: string }>>([
    { label: "הורה 1", amount: "", firstName: "", lastName: "", email: "", phone: "" },
    { label: "הורה 2", amount: "", firstName: "", lastName: "", email: "", phone: "" },
  ]);
  const [splitResults, setSplitResults] = useState<Array<{ label: string; url: string }>>([]);

  // ---- Check spread state ----
  const [checksOpen, setChecksOpen] = useState(false);
  const [numChecks, setNumChecks] = useState("1");
  const [firstCheckDate, setFirstCheckDate] = useState(today);
  const [firstCheckNumber, setFirstCheckNumber] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [checks, setChecks] = useState<Array<{ date: string; number: string; amount: string }>>([]);

  const isEdit = !!editPayment;

  // Pre-fill form when editing or reset for new
  useEffect(() => {
    if (editPayment) {
      setEditAmount(String(editPayment.amount));
      setPaymentDate(editPayment.payment_date);
      setPaymentMethod(editPayment.payment_method || "credit_card");
      setInstallments(String((editPayment as any).installments ?? 1));
      setNotes(editPayment.notes || "");
      setCheckNumber((editPayment as any).reference_number || "");
      setEditEnrollmentId(editPayment.enrollment_id || enrollments[0]?.id || "");
      setTransactionType((editPayment as any).transaction_type || "payment");
    } else {
      resetForm();
      if (defaultType) setTransactionType(defaultType);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPayment, open, defaultType]);

  const suggestedFor = (e: any) => {
    const ppl = Number(e?.price_per_lesson || 0);
    const total = Number(e?.total_lessons_allocated || 0);
    const v = Math.round(ppl * total);
    return v > 0 ? String(v) : "";
  };

  const academicYearId = activeYear?.id ?? enrollments.find((e: any) => e.is_active)?.academic_year_id;

  // ---- Data needed to derive "same defaults as summary in student card" ----
  const { data: student } = useQuery({
    queryKey: ["addpay-student", studentId],
    enabled: !!studentId && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", studentId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["addpay-payment-settings"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_settings" as any).select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: yearFull } = useQuery({
    queryKey: ["addpay-year", academicYearId],
    enabled: !!academicYearId && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("*").eq("id", academicYearId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: discountTypes = [] } = useQuery({
    queryKey: ["addpay-discount-types", academicYearId],
    enabled: !!academicYearId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_types" as any)
        .select("*")
        .eq("academic_year_id", academicYearId!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as any[]) as DiscountType[];
    },
  });

  const { data: draft } = useQuery({
    queryKey: ["addpay-draft", studentId, academicYearId],
    enabled: !!studentId && !!academicYearId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_payment_drafts" as any)
        .select("*")
        .eq("student_id", studentId)
        .eq("academic_year_id", academicYearId!)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });

  const getEnrollmentLabel = (e: any) =>
    `${e.instruments?.name ?? "—"} — ${e.schools?.name ?? "—"}`;

  const activeEnrollments = useMemo(() => enrollments.filter((e: any) => e.is_active), [enrollments]);

  // ---- Compute default amounts, mirroring AdminStudentPaymentCalc ----
  type PaymentItem = {
    id: string; // enrollment uuid OR `special:<key>` OR `discount:<key>`
    enrollmentId: string | null;
    label: string;
    subLabel?: string;
    defaultAmount: number; // can be negative for discounts
    kind: "enrollment" | "special" | "discount";
  };

  const paymentItems: PaymentItem[] = useMemo(() => {
    const items: PaymentItem[] = [];
    if (!yearFull || !settings) {
      for (const e of activeEnrollments) {
        const raw = Number(e?.price_per_lesson || 0) * Number(e?.total_lessons_allocated || 0);
        items.push({
          id: e.id,
          enrollmentId: e.id,
          label: getEnrollmentLabel(e),
          subLabel: e.price_per_lesson
            ? `₪${Number(e.price_per_lesson).toLocaleString()} × ${e.total_lessons_allocated || 0} שיעורים`
            : undefined,
          defaultAmount: Math.round(raw * 100) / 100,
          kind: "enrollment",
        });
      }
      return items;
    }

    const prices = settings.lesson_prices ?? {};
    const startOverrides = (draft?.start_date_overrides as Record<string, string>) ?? {};
    const rows = activeEnrollments.map((e: any) =>
      calcEnrollment(
        {
          id: e.id,
          duration: e.lesson_duration_minutes,
          startDate: startOverrides[e.id] ?? e.start_date,
          endDate: e.end_date,
          pricePerLessonOverride: e.price_per_lesson,
        },
        prices,
        yearFull.start_date,
        yearFull.end_date,
      ),
    );

    const selectedDiscountIds: string[] = Array.isArray(draft?.selected_discount_ids)
      ? draft!.selected_discount_ids
      : [];
    const selectedDiscounts = discountTypes.filter((d) => selectedDiscountIds.includes(d.id));
    const stdCompute = computeStandardDiscounts(
      rows.map((r) => ({ enrollmentId: r.enrollmentId, prorated: r.prorated })),
      selectedDiscounts,
    );

    const specials: { key: string; label: string; price: number }[] = [];
    if (student?.has_music_production_course) {
      specials.push({ key: "music_production", label: "קורס הפקה מוסיקלית", price: Number(settings.music_production_price) || 0 });
    }
    if (student?.has_recital_track) {
      specials.push({ key: "recital_track", label: "מסלול לרסיטל", price: Number(settings.recital_track_price) || 0 });
    }

    // Enrollments at gross prorated (no discounts baked in)
    for (const r of rows) {
      const e = activeEnrollments.find((x: any) => x.id === r.enrollmentId);
      items.push({
        id: r.enrollmentId,
        enrollmentId: r.enrollmentId,
        label: e ? getEnrollmentLabel(e) : "—",
        subLabel: `${r.lessonsRemaining}/${r.lessonsTotal} שיעורים`,
        defaultAmount: Math.round(r.prorated * 100) / 100,
        kind: "enrollment",
      });
    }
    for (const s of specials) {
      items.push({
        id: `special:${s.key}`,
        enrollmentId: null,
        label: s.label,
        subLabel: "קורס מיוחד",
        defaultAmount: Math.round(s.price * 100) / 100,
        kind: "special",
      });
    }
    // Standard discounts — one negative line per applied discount
    for (const line of stdCompute.lines) {
      if (line.amount <= 0) continue;
      items.push({
        id: `discount:${line.discountTypeId}`,
        enrollmentId: null,
        label: `${line.label} (${line.percentage}%)`,
        subLabel: "הנחה",
        defaultAmount: -Math.round(line.amount * 100) / 100,
        kind: "discount",
      });
    }
    // Custom discounts (draft): each as its own negative line
    const customDiscounts = Array.isArray(draft?.custom_discounts) ? (draft!.custom_discounts as any[]) : [];
    const afterStdTotal =
      stdCompute.afterStdDiscount + specials.reduce((s, x) => s + x.price, 0);
    for (let i = 0; i < customDiscounts.length; i++) {
      const c = customDiscounts[i];
      const v = Number(c?.value) || 0;
      if (!v) continue;
      const amt = c?.mode === "pct" ? (afterStdTotal * v) / 100 : v;
      if (amt <= 0) continue;
      items.push({
        id: `discount:custom-${i}`,
        enrollmentId: null,
        label: c?.label ? `${c.label}${c.mode === "pct" ? ` (${v}%)` : ""}` : (c?.mode === "pct" ? `הנחה ${v}%` : "הנחה"),
        subLabel: "הנחה מותאמת",
        defaultAmount: -Math.round(amt * 100) / 100,
        kind: "discount",
      });
    }
    return items;
  }, [activeEnrollments, yearFull, settings, discountTypes, draft, student]);

  // Auto-fill selectedAmounts with defaults on open (new mode only, and once per open).
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  useEffect(() => {
    if (!open) { setDefaultsApplied(false); return; }
    if (isEdit) return;
    if (defaultsApplied) return;
    if (paymentItems.length === 0) return;
    // Wait for calc-based defaults before applying (avoid overriding with fallback)
    if (!yearFull || !settings) return;
    const next: Record<string, string> = {};
    for (const it of paymentItems) {
      if (it.defaultAmount !== 0) next[it.id] = String(it.defaultAmount);
    }
    setSelectedAmounts(next);
    setDefaultsApplied(true);
  }, [open, isEdit, paymentItems, yearFull, settings, defaultsApplied]);

  const totalSelected = useMemo(() => {
    return Object.values(selectedAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  }, [selectedAmounts]);

  const toggleItem = (it: PaymentItem, checked: boolean) => {
    setSelectedAmounts((prev) => {
      const next = { ...prev };
      if (checked) {
        next[it.id] = prev[it.id] ?? (it.defaultAmount !== 0 ? String(it.defaultAmount) : "");
      } else {
        delete next[it.id];
      }
      return next;
    });
  };

  const selectAll = () => {
    const next: Record<string, string> = {};
    for (const it of paymentItems) next[it.id] = selectedAmounts[it.id] ?? (it.defaultAmount !== 0 ? String(it.defaultAmount) : "");
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
            reference_number: paymentMethod === "check" ? (checkNumber.trim() || null) : null,
            enrollment_id: editEnrollmentId,
            transaction_type: transactionType,
          })
          .eq("id", editPayment!.id);
        if (error) throw error;
        return;
      }

      const itemById = new Map(paymentItems.map((it) => [it.id, it] as const));
      const entries = Object.entries(selectedAmounts)
        .map(([id, amt]) => {
          const it = itemById.get(id);
          return {
            id,
            kind: it?.kind ?? (id.startsWith("special:") ? "special" : id.startsWith("discount:") ? "discount" : "enrollment"),
            enrollmentId: it?.enrollmentId ?? (id.startsWith("special:") || id.startsWith("discount:") ? null : id),
            label: it?.label ?? null,
            amt: parseFloat(amt),
          };
        })
        .filter((x) => !Number.isNaN(x.amt) && x.amt !== 0);
      if (entries.length === 0) throw new Error("יש לבחור לפחות שורה עם סכום");

      const totalNet = entries.reduce((s, x) => s + x.amt, 0);
      if (totalNet <= 0) throw new Error("הסה״כ נטו חייב להיות חיובי");

      const hasDiscounts = entries.some((e) => e.kind === "discount");
      const anchorEnrollmentId = entries.find((e) => e.kind === "enrollment" && e.enrollmentId)?.enrollmentId ?? null;

      const bankInfoStr = [
        bankName && `בנק: ${bankName}`,
        bankBranch && `סניף: ${bankBranch}`,
        bankAccount && `ח-ן: ${bankAccount}`,
      ].filter(Boolean).join(" · ");

      const useCheckSpread =
        paymentMethod === "check" &&
        transactionType === "payment" &&
        checks.length > 0;

      const baseFields = {
        payment_date: paymentDate,
        payment_method: paymentMethod as any,
        installments: parseInt(installments),
        notes: notes || null,
        reference_number: paymentMethod === "check" && !useCheckSpread ? (checkNumber.trim() || null) : null,
        transaction_type: transactionType,
        student_id: studentId,
        academic_year_id: academicYearId,
      };

      const breakdownFor = (ratio: number) =>
        entries.map((e) => ({
          enrollment_id: e.enrollmentId,
          label: e.label,
          amount: Math.round(e.amt * ratio * 100) / 100,
        }));

      // Always create a single combined row when there are multiple entries
      const effectiveMode = "combined";

      let rows: any[];
      if (useCheckSpread) {
        const sumChecks = checks.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
        if (Math.abs(sumChecks - totalNet) > 0.01) {
          throw new Error(`סכום הצ׳קים (₪${sumChecks.toLocaleString()}) לא תואם לסה״כ (₪${totalNet.toLocaleString()})`);
        }
        const groupId =
          (typeof crypto !== "undefined" && "randomUUID" in crypto)
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`;
        rows = checks.map((c, i) => {
          const amt = Math.round((parseFloat(c.amount) || 0) * 100) / 100;
          const ratio = totalNet > 0 ? amt / totalNet : 0;
          const breakdown = entries.length > 1 ? breakdownFor(ratio) : null;
          const noteParts = [
            `צ׳ק ${i + 1}/${checks.length}`,
            bankInfoStr,
            notes,
          ].filter(Boolean);
          return {
            ...baseFields,
            payment_date: c.date,
            installments: 1,
            amount: amt,
            enrollment_id: anchorEnrollmentId,
            enrollment_breakdown: breakdown,
            reference_number: c.number?.trim() || null,
            payment_group_id: groupId,
            notes: noteParts.join(" · "),
          };
        });
      } else if (entries.length > 1 && effectiveMode === "combined") {
        rows = [{
          ...baseFields,
          amount: totalNet,
          enrollment_id: anchorEnrollmentId,
          enrollment_breakdown: breakdownFor(1),
        }];
      } else {
        rows = entries.map((e) => {
          const isNonEnrollment = e.kind !== "enrollment";
          const extraNote = isNonEnrollment && e.label ? [notes, e.label].filter(Boolean).join(" · ") : (notes || null);
          return {
            ...baseFields,
            amount: e.amt,
            enrollment_id: e.enrollmentId,
            notes: extraNote,
          };
        });
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
      const itemById = new Map(paymentItems.map((it) => [it.id, it] as const));
      // Include ALL selected entries — enrollments, specials, and discount lines
      // (negative amounts). The link total is the net of everything the user
      // sees in the dialog, matching the main calc-page link exactly.
      const entries = Object.entries(selectedAmounts)
        .map(([id, amt]) => ({ id, amt: parseFloat(amt), item: itemById.get(id) }))
        .filter((x) => !Number.isNaN(x.amt) && x.amt !== 0);
      if (entries.length === 0) throw new Error("יש לבחור לפחות שורה עם סכום");
      const total = Math.round(entries.reduce((s, x) => s + x.amt, 0) * 100) / 100;
      if (total <= 0) throw new Error("סה״כ הקישור חייב להיות גדול מ-0");

      const hebrewYear = activeYear?.name ? (HEBREW_YEAR_MAP[activeYear.name] ?? activeYear.name) : "";
      const yearSuffix = hebrewYear ? ` ${hebrewYear}` : "";

      const lines = entries.map(({ id, amt, item }) => {
        const amount = Math.round(amt * 100) / 100;
        if (item?.kind === "special") {
          return { description: `${item.label}${yearSuffix}`, amount };
        }
        if (item?.kind === "discount") {
          // item.label already includes the discount name (and % if applicable).
          return { description: `${item.label}${yearSuffix}`, amount };
        }
        const e = enrollments.find((x: any) => x.id === (item?.enrollmentId ?? id));
        const descParts = [
          e?.instruments?.name ?? "שכר לימוד",
          e?.schools?.name ? `· ${e.schools.name}` : "",
          e?.lesson_duration_minutes ? `· ${e.lesson_duration_minutes} דק׳` : "",
        ].filter(Boolean).join(" ");
        return {
          description: `שכר לימוד שנתי${yearSuffix} - ${descParts}`.replace(/ - $/, ""),
          amount,
        };
      });

      const { data, error } = await supabase.functions.invoke("icount-generate-student-paylink", {
        body: {
          studentId,
          amount: total,
          academicYearId,
          academicYearName: hebrewYear || activeYear?.name || null,
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

  const splitLinksMutation = useMutation({
    mutationFn: async () => {
      const parts = splitParts
        .map((p) => ({ label: p.label.trim() || "הורה", amount: Math.round((parseFloat(p.amount) || 0) * 100) / 100 }))
        .filter((p) => p.amount > 0);
      if (parts.length < 2) throw new Error("יש להזין לפחות שני חלקים עם סכום");

      // Build the full detailed line items exactly like the single-link flow —
      // each parent needs to see *all* enrollments (both instruments etc.) on
      // their payment page, just at their share of the amount.
      const itemById = new Map(paymentItems.map((it) => [it.id, it] as const));
      const baseEntries = Object.entries(selectedAmounts)
        .map(([id, amt]) => ({ id, amt: parseFloat(amt), item: itemById.get(id) }))
        .filter((x) => !Number.isNaN(x.amt) && x.amt !== 0);
      if (baseEntries.length === 0) throw new Error("יש לבחור לפחות שורה עם סכום");
      const grossTotal = Math.round(baseEntries.reduce((s, x) => s + x.amt, 0) * 100) / 100;
      if (grossTotal <= 0) throw new Error("סה״כ החישוב חייב להיות גדול מ-0");

      const hebrewYear = activeYear?.name ? (HEBREW_YEAR_MAP[activeYear.name] ?? activeYear.name) : "";
      const yearSuffix = hebrewYear ? ` ${hebrewYear}` : "";

      const baseLines = baseEntries.map(({ id, amt, item }) => {
        const amount = Math.round(amt * 100) / 100;
        if (item?.kind === "special") return { description: `${item.label}${yearSuffix}`, amount };
        if (item?.kind === "discount") return { description: `${item.label}${yearSuffix}`, amount };
        const e = enrollments.find((x: any) => x.id === (item?.enrollmentId ?? id));
        const descParts = [
          e?.instruments?.name ?? "שכר לימוד",
          e?.schools?.name ? `· ${e.schools.name}` : "",
          e?.lesson_duration_minutes ? `· ${e.lesson_duration_minutes} דק׳` : "",
        ].filter(Boolean).join(" ");
        return {
          description: `שכר לימוד שנתי${yearSuffix} - ${descParts}`.replace(/ - $/, ""),
          amount,
        };
      });

      const partsCount = parts.length;
      const results: Array<{ label: string; url: string }> = [];
      // Sequential to avoid iCount rate-limits and to make ordering deterministic
      for (let idx = 0; idx < partsCount; idx++) {
        const p = parts[idx];
        const ratio = p.amount / grossTotal;
        // Scale each line proportionally, then fix rounding drift on the last line.
        const scaled = baseLines.map((l) => ({
          description: l.description,
          amount: Math.round(l.amount * ratio * 100) / 100,
        }));
        const drift = Math.round((p.amount - scaled.reduce((s, l) => s + l.amount, 0)) * 100) / 100;
        if (scaled.length > 0 && Math.abs(drift) >= 0.01) {
          scaled[scaled.length - 1].amount = Math.round((scaled[scaled.length - 1].amount + drift) * 100) / 100;
        }
        // Add a clear note line so the parent understands they are paying a share
        const shareNote = {
          description: `חלקו של ${p.label} מתוך ${partsCount} משלמים (סה״כ החשבון ₪${grossTotal.toLocaleString()})`,
          amount: 0,
        };
        const finalLines = [...scaled, shareNote];

        const { data, error } = await supabase.functions.invoke("icount-generate-student-paylink", {
          body: {
            studentId,
            amount: p.amount,
            academicYearId,
            academicYearName: hebrewYear || activeYear?.name || null,
            lines: finalLines,
            // The first parent is prefilled with the student's parent-on-file.
            // Every additional parent must fill in their own details on the
            // iCount page — do NOT prefill name/phone/id/email for them.
            skipPayerPrefill: idx > 0,
            payerLabel: p.label,
            // Force a brand new paypage per part so the URLs don't collide
            // on the cached pending row.
            forceNewPaypage: true,
          },
        });
        if (error) throw error;
        if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
        if (!data?.url) throw new Error("לא התקבל קישור");
        results.push({ label: p.label, url: data.url as string });
      }
      return results;
    },
    onSuccess: (results) => {
      setSplitResults(results);
      queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-year-payments"] });
      queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["calc-pending-payments-all-years", studentId] });
      toast.success(`נוצרו ${results.length} קישורים`);
    },
    onError: (err: any) => toast.error(err.message || "שגיאה ביצירת הקישורים"),
  });

  // Autofill split parts from total when opening the split panel
  useEffect(() => {
    if (!splitOpen) return;
    if (splitParts.some((p) => parseFloat(p.amount) > 0)) return;
    if (totalSelected <= 0) return;
    const per = Math.round((totalSelected / splitParts.length) * 100) / 100;
    const rounded = Array(splitParts.length).fill(per);
    // fix rounding drift on last part
    const diff = Math.round((totalSelected - rounded.reduce((s, v) => s + v, 0)) * 100) / 100;
    rounded[rounded.length - 1] = Math.round((rounded[rounded.length - 1] + diff) * 100) / 100;
    setSplitParts((prev) => prev.map((p, i) => ({ ...p, amount: String(rounded[i]) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitOpen]);

  const resetForm = () => {
    setPaymentDate(today);
    setPaymentMethod("credit_card");
    setInstallments("1");
    setNotes("");
    setCheckNumber("");
    setTransactionType("payment");
    setSelectedAmounts({});
    setEditEnrollmentId("");
    setEditAmount("");
    
    setSplitOpen(false);
    setSplitParts([{ label: "הורה 1", amount: "" }, { label: "הורה 2", amount: "" }]);
    setSplitResults([]);
    setChecksOpen(false);
    setNumChecks("1");
    setFirstCheckDate(today);
    setFirstCheckNumber("");
    setBankName("");
    setBankBranch("");
    setBankAccount("");
    setChecks([]);
  };

  const addMonthsIso = (iso: string, months: number) => {
    const d = new Date(iso + "T00:00:00");
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + months);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  const generateChecks = () => {
    const n = Math.max(1, parseInt(numChecks) || 1);
    const total = Math.round(totalSelected * 100) / 100;
    if (total <= 0) { toast.error("סה״כ הסכום חייב להיות גדול מ-0"); return; }
    const baseWhole = Math.floor(total / n);
    const remainder = Math.round((total - baseWhole * n) * 100) / 100;
    const firstAmt = Math.round((baseWhole + remainder) * 100) / 100;
    const startNum = parseInt(firstCheckNumber);
    const rows: Array<{ date: string; number: string; amount: string }> = [];
    for (let i = 0; i < n; i++) {
      rows.push({
        date: addMonthsIso(firstCheckDate, i),
        number: Number.isFinite(startNum) ? String(startNum + i) : "",
        amount: String(i === 0 ? firstAmt : baseWhole),
      });
    }
    setChecks(rows);
  };

  const checksTotal = useMemo(
    () => checks.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0),
    [checks],
  );

  const checkRequirementMet = paymentMethod !== "check" || isEdit || checks.length > 0;
  const canSubmit = (isEdit
    ? !!editEnrollmentId && parseFloat(editAmount) > 0 && !!paymentDate
    : Object.entries(selectedAmounts).some(([, v]) => parseFloat(v) > 0) && !!paymentDate)
    && checkRequirementMet;


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
                {paymentItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-2">אין שיוכים פעילים</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {paymentItems.map((it) => {
                      const checked = selectedAmounts[it.id] !== undefined;
                      const isDiscount = it.kind === "discount";
                      return (
                        <div
                          key={it.id}
                          className={`flex items-center gap-2 rounded-lg border p-2 ${
                            isDiscount ? "border-emerald-300/60 bg-emerald-50/40" : "border-border"
                          }`}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => toggleItem(it, !!v)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {it.label}
                              {it.kind === "special" && <span className="text-[10px] text-primary mr-1">★</span>}
                              {isDiscount && <span className="text-[10px] text-emerald-700 mr-1">−</span>}
                            </p>
                            {it.subLabel && (
                              <p className={`text-xs ${isDiscount ? "text-emerald-700" : "text-muted-foreground"}`}>{it.subLabel}</p>
                            )}
                          </div>
                          <Input
                            type="number"
                            step="0.01"
                            disabled={!checked}
                            value={selectedAmounts[it.id] ?? ""}
                            onChange={(ev) =>
                              setSelectedAmounts((prev) => ({ ...prev, [it.id]: ev.target.value }))
                            }
                            placeholder={it.defaultAmount !== 0 ? String(it.defaultAmount) : "0.00"}
                            className="w-28 h-9"
                          />
                        </div>
                      );
                    })}
                    {Object.keys(selectedAmounts).length > 1 && (
                      <p className="text-xs text-muted-foreground text-end">
                        סה״כ: ₪{totalSelected.toLocaleString()}
                      </p>
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
            {paymentMethod !== "check" && paymentMethod !== "credit_card" && paymentMethod !== "cash" && (
              <div>
                <Label htmlFor="installments">מספר תשלומים</Label>
                <select id="installments" value={installments} onChange={(e) => setInstallments(e.target.value)} className={selectClass}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
              </div>
            )}
            {paymentMethod === "check" && isEdit && (
              <div>
                <Label htmlFor="check-number">מספר צ׳ק</Label>
                <Input
                  id="check-number"
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                  placeholder="לדוגמה: 1234"
                />
              </div>
            )}
            {paymentMethod === "check" && !isEdit && transactionType === "payment" && (
              <div className="rounded-xl border border-border p-3 space-y-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-11 rounded-xl justify-between px-3"
                  onClick={() => setChecksOpen((v) => !v)}
                >
                  <span className="flex items-center gap-2">
                    <Split className="h-4 w-4" />
                    פריסת צ׳קים
                  </span>
                  <span className="text-xs text-muted-foreground">{checksOpen ? "הסתר" : "הצג"}</span>
                </Button>
                {checksOpen && (
                  <div className="space-y-3 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      פריסה אוטומטית: הצ׳ק הראשון סופג את השארית ושאר הצ׳קים בסכומים שלמים ושווים. ניתן לערוך כל שורה ידנית.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">מספר צ׳קים</Label>
                        <Input type="number" min="1" max="24" value={numChecks} onChange={(e) => setNumChecks(e.target.value)} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">תאריך צ׳ק ראשון</Label>
                        <Input type="date" value={firstCheckDate} onChange={(e) => setFirstCheckDate(e.target.value)} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">מספר צ׳ק ראשון</Label>
                        <Input value={firstCheckNumber} onChange={(e) => setFirstCheckNumber(e.target.value)} placeholder="לדוגמה: 1001" className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">סה״כ לפריסה</Label>
                        <Input value={`₪${totalSelected.toLocaleString()}`} disabled className="h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">בנק</Label>
                        <Input value={bankName} onChange={(e) => setBankName(e.target.value)} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">סניף</Label>
                        <Input value={bankBranch} onChange={(e) => setBankBranch(e.target.value)} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">מס׳ חשבון</Label>
                        <Input value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} className="h-9" />
                      </div>
                    </div>
                    <Button type="button" variant="outline" className="w-full h-10 rounded-xl" onClick={generateChecks} disabled={totalSelected <= 0}>
                      צור פריסה
                    </Button>
                    {checks.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-border">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-medium">רשימת צ׳קים ({checks.length})</p>
                          <p className={`text-xs ${Math.abs(checksTotal - totalSelected) < 0.01 ? "text-muted-foreground" : "text-destructive"}`}>
                            סה״כ צ׳קים: ₪{checksTotal.toLocaleString()}
                            {Math.abs(checksTotal - totalSelected) >= 0.01 && ` (הפרש ₪${(totalSelected - checksTotal).toLocaleString()})`}
                          </p>
                        </div>
                        <div className="grid grid-cols-[24px_1fr_90px_90px_24px] gap-2 items-center text-[11px] text-muted-foreground px-1">
                          <span>#</span><span>תאריך</span><span>מס׳ צ׳ק</span><span>סכום</span><span></span>
                        </div>
                        {checks.map((c, i) => (
                          <div key={i} className="grid grid-cols-[24px_1fr_90px_90px_24px] gap-2 items-center">
                            <span className="text-xs text-muted-foreground text-center">{i + 1}</span>
                            <Input type="date" value={c.date}
                              onChange={(e) => setChecks((prev) => prev.map((x, idx) => idx === i ? { ...x, date: e.target.value } : x))} className="h-9" />
                            <Input value={c.number}
                              onChange={(e) => setChecks((prev) => prev.map((x, idx) => idx === i ? { ...x, number: e.target.value } : x))} placeholder="מס׳" className="h-9" />
                            <Input type="number" step="0.01" value={c.amount}
                              onChange={(e) => setChecks((prev) => prev.map((x, idx) => idx === i ? { ...x, amount: e.target.value } : x))} className="h-9" />
                            <button type="button" className="text-destructive hover:opacity-70"
                              onClick={() => setChecks((prev) => prev.filter((_, idx) => idx !== i))} aria-label="הסר">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                        <button type="button"
                          onClick={() => setChecks((prev) => [...prev, { date: prev.length ? addMonthsIso(prev[prev.length - 1].date, 1) : firstCheckDate, number: "", amount: "0" }])}
                          className="text-xs text-primary hover:underline flex items-center gap-1">
                          <Plus className="h-3 w-3" /> הוסף צ׳ק
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div>
              <Label>הערות</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות (אופציונלי)" rows={2} />
            </div>
            {!isEdit && transactionType === "payment" && paymentMethod === "credit_card" && (
              <div className="space-y-2">
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
                <div className="rounded-xl border border-border p-3 space-y-2">
                <button
                  type="button"
                  onClick={() => setSplitOpen((v) => !v)}
                  className="w-full flex items-center justify-between text-sm font-medium"
                >
                  <span className="flex items-center gap-2">
                    <Split className="h-4 w-4" />
                    פיצול לכמה קישורי תשלום
                  </span>
                  <span className="text-xs text-muted-foreground">{splitOpen ? "הסתר" : "הצג"}</span>
                </button>
                {splitOpen && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      צור מספר קישורים במקביל לחלוקת התשלום בין משלמים שונים (למשל שני הורים).
                    </p>
                    {splitParts.map((part, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={part.label}
                          onChange={(e) =>
                            setSplitParts((prev) => prev.map((p, i) => (i === idx ? { ...p, label: e.target.value } : p)))
                          }
                          placeholder={`הורה ${idx + 1}`}
                          className="flex-1 h-9"
                        />
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={part.amount}
                          onChange={(e) =>
                            setSplitParts((prev) => prev.map((p, i) => (i === idx ? { ...p, amount: e.target.value } : p)))
                          }
                          placeholder="0.00"
                          className="w-28 h-9"
                        />
                        {splitParts.length > 2 && (
                          <button
                            type="button"
                            className="text-destructive hover:opacity-70"
                            onClick={() => setSplitParts((prev) => prev.filter((_, i) => i !== idx))}
                            aria-label="הסר"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          setSplitParts((prev) => [...prev, { label: `הורה ${prev.length + 1}`, amount: "" }])
                        }
                        className="text-xs text-primary hover:underline flex items-center gap-1"
                      >
                        <Plus className="h-3 w-3" /> הוסף חלק
                      </button>
                      <span className="text-xs text-muted-foreground">
                        סה״כ פיצול: ₪{splitParts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0).toLocaleString()}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full h-10 rounded-xl"
                      onClick={() => splitLinksMutation.mutate()}
                      disabled={splitLinksMutation.isPending || splitParts.filter((p) => parseFloat(p.amount) > 0).length < 2}
                    >
                      {splitLinksMutation.isPending ? (
                        <><Loader2 className="h-4 w-4 animate-spin ml-2" /> יוצר קישורים...</>
                      ) : (
                        <><LinkIcon className="h-4 w-4 ml-2" /> צור {splitParts.filter((p) => parseFloat(p.amount) > 0).length || ""} קישורים</>
                      )}
                    </Button>
                    {splitResults.length > 0 && (
                      <div className="space-y-2 pt-3 mt-1 border-t border-border">
                        <p className="text-xs font-medium text-foreground">הקישורים שנוצרו:</p>
                        <div className="space-y-2">
                          {splitResults.map((r, i) => (
                            <div key={i} className="w-full rounded-lg border border-border bg-muted/30 p-2">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-xs font-semibold text-foreground truncate flex-1 min-w-0">{r.label}</p>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      try {
                                        await navigator.clipboard.writeText(r.url);
                                        toast.success(`הועתק: ${r.label}`);
                                      } catch { /* noop */ }
                                    }}
                                    className="p-1.5 hover:bg-background rounded-md"
                                    aria-label="העתק"
                                    title="העתק קישור"
                                  >
                                    <Copy className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => window.open(r.url, "_blank")}
                                    className="p-1.5 hover:bg-background rounded-md"
                                    aria-label="פתח"
                                    title="פתח קישור"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                              <p
                                className="text-[10px] text-muted-foreground font-mono leading-tight break-all line-clamp-2"
                                dir="ltr"
                              >
                                {r.url}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>
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
