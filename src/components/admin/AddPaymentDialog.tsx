import { useState, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Link as LinkIcon, Loader2, Plus, Copy, ExternalLink, Split, CalendarClock, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { calcEnrollment } from "@/lib/paymentCalc";
import { computeStandardDiscounts, type DiscountType } from "@/lib/discounts";
import { allocatePayment } from "@/lib/familyPaymentAllocation";
import BankTransferRefundDialog, { type BankRefundDefaults } from "@/components/admin/BankTransferRefundDialog";
import BankBranchPicker from "@/components/admin/BankBranchPicker";

const PAYMENT_METHODS = [
  { value: "credit_card", label: "אשראי" },
  { value: "cash", label: "מזומן" },
  { value: "check", label: "צ׳ק" },
];

// Credit (זיכוי) is executed as an outgoing bank transfer by default.
const CREDIT_PAYMENT_METHODS = [
  { value: "transfer", label: "העברה בנקאית (ברירת מחדל)" },
  ...PAYMENT_METHODS,
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

export interface FamilyPaymentItemOverride {
  id: string;                 // unique key
  enrollmentId: string | null;
  studentId: string;          // which child this item belongs to
  label: string;              // includes child name for family mode
  subLabel?: string;
  defaultAmount: number;
  kind: "enrollment" | "special" | "discount";
}

export interface FamilyPaymentContext {
  parentNationalId: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  familyGroupId: string;      // pre-generated UUID for this dialog session
  anchorStudentId: string;    // student_id used for edge fn / anchor row
  overrideItems: FamilyPaymentItemOverride[];
  childrenNames: Record<string, string>; // studentId → "First Last"
  invalidateKeys?: (string | undefined)[][];
}

export interface RefundSource {
  id: string;            // payment row id that carries the iCount receipt
  label: string;         // e.g. "קבלה 1090 · 10/08/2026 · פריסת צ׳קים"
  amount: number;        // full receipt amount (group total)
  remaining: number;     // still refundable
}

interface AddPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  enrollments: any[];
  editPayment?: PaymentData | null;
  defaultType?: "payment" | "credit";
  familyContext?: FamilyPaymentContext | null;
  refundSources?: RefundSource[];
  /** Opens the "cancel future cheques" dialog from within the credit flow. */
  onOpenChequeCancel?: () => void;
}

const AddPaymentDialog = ({ open, onOpenChange, studentId, enrollments, editPayment, defaultType, familyContext, refundSources = [], onOpenChequeCancel }: AddPaymentDialogProps) => {


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
  // Manual overrides for the receipt/paylink line descriptions (itemId -> text)
  const [descOverrides, setDescOverrides] = useState<Record<string, string>>({});
  const [editingDescIds, setEditingDescIds] = useState<string[]>([]);
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
  const [splitResults, setSplitResults] = useState<Array<{ label: string; url: string; amount: number; firstName: string; lastName: string; email: string; phone: string }>>([]);

  // ---- Bank-transfer credit (refund) state ----
  const [refundSourceId, setRefundSourceId] = useState("");
  const [bankRefundAmount, setBankRefundAmount] = useState("");
  const [bankRefund, setBankRefund] = useState<BankRefundDefaults | null>(null);

  // ---- Check spread state ----
  const [checksOpen, setChecksOpen] = useState(false);
  const [numChecks, setNumChecks] = useState("1");
  const [firstCheckDate, setFirstCheckDate] = useState(today);
  const [firstCheckNumber, setFirstCheckNumber] = useState("");
  const [firstCheckAmount, setFirstCheckAmount] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [bankBranch, setBankBranch] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [checks, setChecks] = useState<Array<{ date: string; number: string; amount: string }>>([]);

  // ---- Paying parent selection (single-student mode, when the family has 2 parents) ----
  const [payerChoice, setPayerChoice] = useState<string>("p1");
  // Free-form extra payer (grandparent, ex-spouse, third party...)
  const [customPayer, setCustomPayer] = useState({ name: "", nationalId: "", email: "", phone: "" });

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
      if (defaultType) {
        setTransactionType(defaultType);
        if (defaultType === "credit") setPaymentMethod("transfer");
      }
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

  // Parents available for billing on this student (single-student mode only).
  const parentOptions = useMemo(() => {
    if (!student) return [] as Array<{ key: string; name: string; nationalId: string; email: string; phone: string }>;
    const opts: Array<{ key: string; name: string; nationalId: string; email: string; phone: string }> = [];
    if ((student.parent_name ?? "").trim() || (student.parent_national_id ?? "").trim()) {
      opts.push({
        key: "p1",
        name: (student.parent_name ?? "").trim() || "הורה 1",
        nationalId: (student.parent_national_id ?? "").trim(),
        email: (student.parent_email ?? "").trim(),
        phone: (student.parent_phone ?? "").trim(),
      });
    }
    if ((student.parent_name_2 ?? "").trim() || (student.parent_national_id_2 ?? "").trim()) {
      opts.push({
        key: "p2",
        name: (student.parent_name_2 ?? "").trim() || "הורה 2",
        nationalId: (student.parent_national_id_2 ?? "").trim(),
        email: (student.parent_email_2 ?? "").trim(),
        phone: (student.parent_phone_2 ?? "").trim(),
      });
    }
    return opts;
  }, [student]);

  const hasTwoParents = parentOptions.length > 1;
  const isCustomPayer = payerChoice === "custom";
  const selectedPayerParent = useMemo(() => {
    if (isCustomPayer) {
      return {
        key: "custom",
        name: customPayer.name.trim(),
        nationalId: customPayer.nationalId.trim(),
        email: customPayer.email.trim(),
        phone: customPayer.phone.trim(),
      };
    }
    return parentOptions.find((p) => p.key === payerChoice) ?? parentOptions[0] ?? null;
  }, [parentOptions, payerChoice, isCustomPayer, customPayer]);

  // Default the picker to the parent that the family context bills, if identifiable.
  useEffect(() => {
    if (!open || !familyContext || parentOptions.length < 2) return;
    const pid = (familyContext.parentNationalId ?? "").trim();
    const match = parentOptions.find(
      (p) => (pid && p.nationalId === pid) || p.name === (familyContext.parentName ?? "").trim(),
    );
    if (match) setPayerChoice(match.key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, familyContext?.parentNationalId, parentOptions.length]);




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

  // Item.studentId is only meaningful in family mode; for single-student mode
  // it is always the current studentId.
  type PaymentItem = {
    id: string;
    enrollmentId: string | null;
    studentId: string;
    label: string;
    subLabel?: string;
    defaultAmount: number;
    kind: "enrollment" | "special" | "discount";
  };

  const paymentItems: PaymentItem[] = useMemo(() => {
    // Family mode: use pre-computed items (one per child enrollment / discount).
    if (familyContext) {
      return familyContext.overrideItems.map((it) => ({
        id: it.id,
        enrollmentId: it.enrollmentId,
        studentId: it.studentId,
        label: it.label,
        subLabel: it.subLabel,
        defaultAmount: it.defaultAmount,
        kind: it.kind,
      }));
    }

    const items: PaymentItem[] = [];
    if (!yearFull || !settings) {
      for (const e of activeEnrollments) {
        const raw = Number(e?.price_per_lesson || 0) * Number(e?.total_lessons_allocated || 0);
        items.push({
          id: e.id,
          enrollmentId: e.id,
          studentId,
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

    for (const r of rows) {
      const e = activeEnrollments.find((x: any) => x.id === r.enrollmentId);
      items.push({
        id: r.enrollmentId,
        enrollmentId: r.enrollmentId,
        studentId,
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
        studentId,
        label: s.label,
        subLabel: "קורס מיוחד",
        defaultAmount: Math.round(s.price * 100) / 100,
        kind: "special",
      });
    }
    for (const line of stdCompute.lines) {
      if (line.amount <= 0) continue;
      items.push({
        id: `discount:${line.discountTypeId}`,
        enrollmentId: null,
        studentId,
        label: `${line.label} (${line.percentage}%)`,
        subLabel: "הנחה",
        defaultAmount: -Math.round(line.amount * 100) / 100,
        kind: "discount",
      });
    }
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
        studentId,
        label: c?.label ? `${c.label}${c.mode === "pct" ? ` (${v}%)` : ""}` : (c?.mode === "pct" ? `הנחה ${v}%` : "הנחה"),
        subLabel: "הנחה מותאמת",
        defaultAmount: -Math.round(amt * 100) / 100,
        kind: "discount",
      });
    }
    return items;
  }, [familyContext, activeEnrollments, yearFull, settings, discountTypes, draft, student, studentId]);

  // ---- Remaining-balance defaults ----
  // If part of the tuition was already paid (e.g. one parent paid half), the
  // pre-filled amounts should reflect only what's still owed — not the full sum.
  const itemStudentIds = useMemo(
    () => [...new Set(paymentItems.map((it) => it.studentId).filter(Boolean))].sort(),
    [paymentItems],
  );

  const { data: priorPayments = [], isFetched: priorPaymentsFetched } = useQuery({
    queryKey: ["addpay-prior-payments", academicYearId, itemStudentIds],
    enabled: open && !!academicYearId && itemStudentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_payments")
        .select("id, student_id, amount, payment_status, transaction_type, refund_of_payment_id, enrollment_breakdown")
        .in("student_id", itemStudentIds)
        .eq("academic_year_id", academicYearId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // paymentItems with defaultAmount scaled down to the remaining balance per child.
  const displayItems: PaymentItem[] = useMemo(() => {
    if (!priorPaymentsFetched || priorPayments.length === 0) return paymentItems;

    // Net paid per child (payments minus credits), splitting family payments
    // across siblings the same way the reports do.
    const children = itemStudentIds.map((id) => {
      const name = (familyContext?.childrenNames?.[id] ??
        (id === studentId && student ? `${student.first_name ?? ""} ${student.last_name ?? ""}` : "") ?? ""
      ).trim();
      const sp = name.indexOf(" ");
      return { id, first_name: sp > 0 ? name.slice(0, sp) : name, last_name: sp > 0 ? name.slice(sp + 1) : "" };
    });
    const paidByStudent = new Map<string, number>();
    for (const p of priorPayments) {
      if (p.payment_status === "pending") continue;
      const alloc = allocatePayment(p, children, priorPayments);
      for (const [sid, share] of alloc) {
        paidByStudent.set(sid, (paidByStudent.get(sid) ?? 0) + share);
      }
    }

    // Scale each child's lines (charges and discounts alike) so their sum
    // equals the remaining balance rather than the full tuition.
    return paymentItems.map((it) => {
      const paid = paidByStudent.get(it.studentId) ?? 0;
      if (paid <= 0) return it;
      const sibs = paymentItems.filter((x) => x.studentId === it.studentId);
      const totalDue = sibs.reduce((s, x) => s + x.defaultAmount, 0);
      if (totalDue <= 0) return it;
      const remaining = Math.max(0, Math.round((totalDue - paid) * 100) / 100);
      const scale = Math.min(1, remaining / totalDue);
      return { ...it, defaultAmount: Math.round(it.defaultAmount * scale * 100) / 100 };
    });
  }, [paymentItems, priorPayments, priorPaymentsFetched, itemStudentIds, familyContext, studentId, student]);

  // Auto-fill selectedAmounts with defaults on open (new mode only, and once per open).
  const [defaultsApplied, setDefaultsApplied] = useState(false);
  useEffect(() => {
    if (!open) { setDefaultsApplied(false); return; }
    if (isEdit) return;
    if (defaultsApplied) return;
    if (paymentItems.length === 0) return;
    // Wait for calc-based defaults before applying, unless we're in family mode
    // where items are pre-computed by the caller.
    if (!familyContext && (!yearFull || !settings)) return;
    const next: Record<string, string> = {};
    for (const it of paymentItems) {
      if (it.defaultAmount !== 0) next[it.id] = String(it.defaultAmount);
    }
    setSelectedAmounts(next);
    setDefaultsApplied(true);
  }, [open, isEdit, paymentItems, yearFull, settings, defaultsApplied, familyContext]);



  const totalSelected = useMemo(() => {
    return Object.values(selectedAmounts).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  }, [selectedAmounts]);

  // In credit mode the amounts are refund amounts — never pre-fill them with the
  // full charge of the enrollment (that confuses the user).
  const initialAmountFor = (it: PaymentItem) =>
    transactionType === "credit" ? "" : it.defaultAmount !== 0 ? String(it.defaultAmount) : "";

  const toggleItem = (it: PaymentItem, checked: boolean) => {
    setSelectedAmounts((prev) => {
      const next = { ...prev };
      if (checked) {
        next[it.id] = prev[it.id] ?? initialAmountFor(it);
      } else {
        delete next[it.id];
      }
      return next;
    });
  };

  const selectAll = () => {
    const next: Record<string, string> = {};
    for (const it of paymentItems) next[it.id] = selectedAmounts[it.id] ?? initialAmountFor(it);
    setSelectedAmounts(next);
  };

  const clearAll = () => setSelectedAmounts({});

  const hebrewYearName = activeYear?.name ? (HEBREW_YEAR_MAP[activeYear.name] ?? activeYear.name) : "";

  /** The default text that will appear as the line description on the receipt
   *  / payment page. Can be overridden manually per line. */
  const defaultLineDescription = (id: string, item?: PaymentItem) => {
    const yearSuffix = hebrewYearName ? ` ${hebrewYearName}` : "";
    const childPrefix = familyContext && item?.studentId
      ? `${familyContext.childrenNames[item.studentId] ?? ""} · `
      : "";
    if (item?.kind === "special" || item?.kind === "discount") {
      return `${childPrefix}${item.label}${yearSuffix}`;
    }
    const e = enrollments.find((x: any) => x.id === (item?.enrollmentId ?? id));
    const descParts = [
      e?.instruments?.name ?? "שכר לימוד",
      e?.schools?.name ? `· ${e.schools.name}` : "",
      e?.lesson_duration_minutes ? `· ${e.lesson_duration_minutes} דק׳` : "",
    ].filter(Boolean).join(" ");
    return `${childPrefix}שכר לימוד שנתי${yearSuffix} - ${descParts}`.replace(/ - $/, "");
  };

  const lineDescription = (id: string, item?: PaymentItem) =>
    descOverrides[id]?.trim() || defaultLineDescription(id, item);


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
            studentId: it?.studentId ?? studentId,
            label: it?.label ?? null,
            amt: parseFloat(amt),
          };
        })
        .filter((x) => !Number.isNaN(x.amt) && x.amt !== 0);
      if (entries.length === 0) throw new Error("יש לבחור לפחות שורה עם סכום");

      const totalNet = entries.reduce((s, x) => s + x.amt, 0);
      if (totalNet <= 0) throw new Error("הסה״כ נטו חייב להיות חיובי");

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

      const commonFields = {
        payment_date: paymentDate,
        payment_method: paymentMethod as any,
        installments: parseInt(installments),
        notes: notes || null,
        reference_number: paymentMethod === "check" && !useCheckSpread ? (checkNumber.trim() || null) : null,
        transaction_type: transactionType,
        academic_year_id: academicYearId,
      };

      const familyFields = familyContext
        ? {
            family_parent_national_id: familyContext.parentNationalId,
            family_payment_group_id: familyContext.familyGroupId,
          }
        : {};

      const breakdownFor = (subEntries: typeof entries, ratio: number) =>
        subEntries.map((e) => ({
          enrollment_id: e.enrollmentId,
          label: e.label,
          amount: Math.round(e.amt * ratio * 100) / 100,
        }));

      // In family mode, group entries by child. In single-student mode, one
      // group containing all entries under the current student.
      const groupedByChild = new Map<string, typeof entries>();
      if (familyContext) {
        for (const e of entries) {
          const arr = groupedByChild.get(e.studentId) ?? [];
          arr.push(e);
          groupedByChild.set(e.studentId, arr);
        }
      } else {
        groupedByChild.set(studentId, entries);
      }

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
        rows = [];
        const checkSpreadRows: any[] = [];
        for (const [sid, subEntries] of groupedByChild) {
          const childTotal = subEntries.reduce((s, x) => s + x.amt, 0);
          if (childTotal <= 0) continue;
          const childAnchor = subEntries.find((e) => e.kind === "enrollment" && e.enrollmentId)?.enrollmentId ?? null;
          checks.forEach((c, i) => {
            const checkAmt = Math.round((parseFloat(c.amount) || 0) * 100) / 100;
            const checkRatio = totalNet > 0 ? checkAmt / totalNet : 0;
            // Split this check across children proportionally to each child's share.
            const childShare = Math.round(childTotal * checkRatio * 100) / 100;
            if (childShare <= 0) return;
            const perEntryRatio = childTotal > 0 ? childShare / childTotal : 0;
            const breakdown = subEntries.length > 1 ? breakdownFor(subEntries, perEntryRatio) : null;
            const noteParts = [
              `צ׳ק ${i + 1}/${checks.length}`,
              bankInfoStr,
            ].filter(Boolean);
            checkSpreadRows.push({
              ...commonFields,
              ...familyFields,
              student_id: sid,
              payment_date: c.date,
              installments: 1,
              amount: childShare,
              enrollment_id: childAnchor,
              enrollment_breakdown: breakdown,
              reference_number: c.number?.trim() || null,
              payment_group_id: groupId,
              notes: noteParts.join(" · "),
            });
          });
        }
        // Place the user's general note on the chronologically first (main) row only,
        // so it appears on the group summary and is not duplicated on every cheque.
        if (checkSpreadRows.length > 0 && notes.trim()) {
          const mainRow = [...checkSpreadRows].sort(
            (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
          )[0];
          mainRow.notes = [notes.trim(), mainRow.notes].filter(Boolean).join(" · ");
        }
        rows.push(...checkSpreadRows);
      } else {
        rows = [];
        // In family mode with multiple children we still need one group id so
        // the rows created together share `payment_group_id` (in addition to
        // the family_payment_group_id).
        const groupId =
          familyContext && groupedByChild.size > 1
            ? ((typeof crypto !== "undefined" && "randomUUID" in crypto)
                ? crypto.randomUUID()
                : `${Date.now()}-${Math.random()}`)
            : null;
        for (const [sid, subEntries] of groupedByChild) {
          const childTotal = subEntries.reduce((s, x) => s + x.amt, 0);
          if (childTotal <= 0) continue;
          const childAnchor = subEntries.find((e) => e.kind === "enrollment" && e.enrollmentId)?.enrollmentId ?? null;
          if (subEntries.length > 1) {
            rows.push({
              ...commonFields,
              ...familyFields,
              student_id: sid,
              amount: childTotal,
              enrollment_id: childAnchor,
              enrollment_breakdown: breakdownFor(subEntries, 1),
              ...(groupId ? { payment_group_id: groupId } : {}),
            });
          } else {
            for (const e of subEntries) {
              const isNonEnrollment = e.kind !== "enrollment";
              const extraNote = isNonEnrollment && e.label ? [notes, e.label].filter(Boolean).join(" · ") : (notes || null);
              rows.push({
                ...commonFields,
                ...familyFields,
                student_id: sid,
                amount: e.amt,
                enrollment_id: e.enrollmentId,
                notes: extraNote,
                ...(groupId ? { payment_group_id: groupId } : {}),
              });
            }
          }
        }
      }



      const { error } = await supabase.from("student_payments").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-year-payments"] });
      queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] });
      if (familyContext) {
        queryClient.invalidateQueries({ queryKey: ["family-details"] });
        queryClient.invalidateQueries({ queryKey: ["family-pending", familyContext.parentNationalId] });
        for (const key of familyContext.invalidateKeys ?? []) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
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
      const entries = Object.entries(selectedAmounts)
        .map(([id, amt]) => ({ id, amt: parseFloat(amt), item: itemById.get(id) }))
        .filter((x) => !Number.isNaN(x.amt) && x.amt !== 0);
      if (entries.length === 0) throw new Error("יש לבחור לפחות שורה עם סכום");
      const total = Math.round(entries.reduce((s, x) => s + x.amt, 0) * 100) / 100;
      if (total <= 0) throw new Error("סה״כ הקישור חייב להיות גדול מ-0");

      const hebrewYear = activeYear?.name ? (HEBREW_YEAR_MAP[activeYear.name] ?? activeYear.name) : "";

      // `student_id` keeps each line attributable to its child, so a family
      // payment can be split back per sibling in reports and family cards.
      const lines = entries.map(({ id, amt, item }) => ({
        description: lineDescription(id, item),
        amount: Math.round(amt * 100) / 100,
        student_id: item?.studentId ?? studentId,
      }));

      const anchorStudentId = familyContext?.anchorStudentId ?? studentId;
      const payer = familyContext
        ? (() => {
            const parts = (familyContext.parentName ?? "").trim().split(/\s+/);
            return {
              firstName: parts[0] ?? "",
              lastName: parts.slice(1).join(" "),
              email: familyContext.parentEmail,
              phone: familyContext.parentPhone,
            };
          })()
        : null;

      const familyTitleName = familyContext
        ? (() => {
            const seen = new Set<string>();
            const names: string[] = [];
            for (const { item } of entries) {
              const sid = item?.studentId;
              if (!sid || seen.has(sid)) continue;
              seen.add(sid);
              const nm = familyContext.childrenNames[sid];
              if (nm) names.push(nm);
            }
            return names.join(", ");
          })()
        : null;

      // When the student/family has two parents — or when an extra payer was
      // entered manually — bill that payer explicitly (overrides the family payer).
      const chosenParentPayer = (hasTwoParents || isCustomPayer) && selectedPayerParent?.name
        ? (() => {
            const parts = selectedPayerParent.name.trim().split(/\s+/);
            return {
              firstName: parts[0] ?? "",
              lastName: parts.slice(1).join(" "),
              email: selectedPayerParent.email,
              phone: selectedPayerParent.phone,
              nationalId: selectedPayerParent.nationalId,
            };
          })()
        : null;

      const { data, error } = await supabase.functions.invoke("icount-generate-student-paylink", {
        body: {
          studentId: anchorStudentId,
          amount: total,
          academicYearId,
          academicYearName: hebrewYear || activeYear?.name || null,
          lines,
          ...(payer ? {
            skipPayerPrefill: true,
            payerLabel: `משפחה - ${familyContext!.parentName}`,
            payerDetails: payer,
            // Force a new paypage — the anchor student's cached pending row
            // may belong to a non-family link.
            forceNewPaypage: true,
          } : {}),
          ...(chosenParentPayer ? {
            skipPayerPrefill: true,
            payerLabel: `${isCustomPayer ? "משלם נוסף" : "הורה משלם"} - ${selectedPayerParent!.name}`,
            payerDetails: chosenParentPayer,
          } : {}),
          ...(familyTitleName ? { pageTitleName: familyTitleName } : {}),
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      if (!data?.url) throw new Error("לא התקבל קישור");

      // Family mode: tag the pending row with family fields so it shows up in
      // the family card's pending list and unifies with the group.
      if (familyContext && data?.paymentId) {
        await supabase
          .from("student_payments")
          .update({
            family_parent_national_id: familyContext.parentNationalId,
            family_payment_group_id: familyContext.familyGroupId,
          })
          .eq("id", data.paymentId);
      }
      return data as { url: string };
    },
    onSuccess: async (data) => {
      try { await navigator.clipboard.writeText(data.url); } catch { /* noop */ }
      window.open(data.url, "_blank");
      queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-year-payments"] });
      queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["calc-pending-payments-all-years", studentId] });
      if (familyContext) {
        queryClient.invalidateQueries({ queryKey: ["family-details"] });
        queryClient.invalidateQueries({ queryKey: ["family-pending", familyContext.parentNationalId] });
        for (const key of familyContext.invalidateKeys ?? []) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      toast.success("קישור התשלום נוצר והועתק ללוח");
      onOpenChange(false);
      resetForm();
    },
    onError: (err: any) => toast.error(err.message || "שגיאה ביצירת קישור"),
  });



  const splitLinksMutation = useMutation({
    mutationFn: async () => {
      const parts = splitParts
        .map((p) => ({
          label: p.label.trim() || "הורה",
          amount: Math.round((parseFloat(p.amount) || 0) * 100) / 100,
          firstName: p.firstName.trim(),
          lastName: p.lastName.trim(),
          email: p.email.trim(),
          phone: p.phone.trim(),
        }))
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
      

      const baseLines = baseEntries.map(({ id, amt, item }) => ({
        description: lineDescription(id, item),
        amount: Math.round(amt * 100) / 100,
        student_id: item?.studentId ?? studentId,
      }));

      const familyTitleName = familyContext
        ? (() => {
            const seen = new Set<string>();
            const names: string[] = [];
            for (const { item } of baseEntries) {
              const sid = item?.studentId;
              if (!sid || seen.has(sid)) continue;
              seen.add(sid);
              const nm = familyContext.childrenNames[sid];
              if (nm) names.push(nm);
            }
            return names.join(", ");
          })()
        : null;


      const partsCount = parts.length;
      const results: Array<{ label: string; url: string; amount: number; firstName: string; lastName: string; email: string; phone: string }> = [];
      // Sequential to avoid iCount rate-limits and to make ordering deterministic
      for (let idx = 0; idx < partsCount; idx++) {
        const p = parts[idx];
        const ratio = p.amount / grossTotal;
        // Scale each line proportionally, then fix rounding drift on the last line.
        const scaled = baseLines.map((l) => ({
          description: l.description,
          amount: Math.round(l.amount * ratio * 100) / 100,
          student_id: l.student_id,
        }));
        const drift = Math.round((p.amount - scaled.reduce((s, l) => s + l.amount, 0)) * 100) / 100;
        if (scaled.length > 0 && Math.abs(drift) >= 0.01) {
          scaled[scaled.length - 1].amount = Math.round((scaled[scaled.length - 1].amount + drift) * 100) / 100;
        }
        // Partial-payment indication is surfaced via the paypage title
        // (see `splitInfo` below) since iCount filters zero-amount line items.
        const sharePct = Math.round(ratio * 100);
        const finalLines = scaled;

        const { data, error } = await supabase.functions.invoke("icount-generate-student-paylink", {
          body: {
            studentId: familyContext?.anchorStudentId ?? studentId,
            amount: p.amount,
            academicYearId,
            academicYearName: hebrewYear || activeYear?.name || null,
            lines: finalLines,
            skipPayerPrefill: true,
            payerLabel: p.label,
            payerDetails: {
              firstName: p.firstName,
              lastName: p.lastName,
              email: p.email,
              phone: p.phone,
            },
            splitInfo: {
              partIndex: idx + 1,
              partsCount,
              grossTotal,
              sharePct,
            },
            forceNewPaypage: true,
            ...(familyTitleName ? { pageTitleName: familyTitleName } : {}),
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
        if (!data?.url) throw new Error("לא התקבל קישור");
        if (familyContext && data?.paymentId) {
          await supabase
            .from("student_payments")
            .update({
              family_parent_national_id: familyContext.parentNationalId,
              family_payment_group_id: familyContext.familyGroupId,
            })
            .eq("id", data.paymentId);
        }
        results.push({ label: p.label, url: data.url as string, amount: p.amount, firstName: p.firstName, lastName: p.lastName, email: p.email, phone: p.phone });
      }
      return results;
    },
    onSuccess: (results) => {
      setSplitResults(results);
      queryClient.invalidateQueries({ queryKey: ["admin-student-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-year-payments"] });
      queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["calc-pending-payments-all-years", studentId] });
      if (familyContext) {
        queryClient.invalidateQueries({ queryKey: ["family-details"] });
        queryClient.invalidateQueries({ queryKey: ["family-pending", familyContext.parentNationalId] });
        for (const key of familyContext.invalidateKeys ?? []) {
          queryClient.invalidateQueries({ queryKey: key });
        }
      }
      toast.success(`נוצרו ${results.length} קישורים`);
    },
    onError: (err: any) => toast.error(err.message || "שגיאה ביצירת הקישורים"),
  });

  // Autofill split parts (amount split + parent 1 details from student) on open.
  useEffect(() => {
    if (!splitOpen) return;
    const parentName = (student?.parent_name ?? "").trim();
    const [pFirst, ...pRest] = parentName.split(/\s+/);
    const parent1First = pFirst ?? "";
    const parent1Last = pRest.join(" ");
    const parent1Email = student?.parent_email ?? "";
    const parent1Phone = student?.parent_phone ?? "";

    setSplitParts((prev) => {
      const hasAmounts = prev.some((p) => parseFloat(p.amount) > 0);
      let amounts = prev.map((p) => p.amount);
      if (!hasAmounts && totalSelected > 0) {
        const per = Math.round((totalSelected / prev.length) * 100) / 100;
        amounts = Array(prev.length).fill(String(per));
        const diff = Math.round((totalSelected - per * prev.length) * 100) / 100;
        if (Math.abs(diff) >= 0.01) {
          amounts[amounts.length - 1] = String(Math.round((per + diff) * 100) / 100);
        }
      }
      return prev.map((p, i) => {
        if (i === 0) {
          return {
            ...p,
            amount: amounts[i],
            firstName: p.firstName || parent1First,
            lastName: p.lastName || parent1Last,
            email: p.email || parent1Email,
            phone: p.phone || parent1Phone,
          };
        }
        return { ...p, amount: amounts[i] };
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitOpen, student?.id]);

  const resetForm = () => {
    setPaymentDate(today);
    setPaymentMethod("credit_card");
    setInstallments("1");
    setNotes("");
    setCheckNumber("");
    setTransactionType("payment");
    setSelectedAmounts({});
    setDescOverrides({});
    setEditingDescIds([]);
    setEditEnrollmentId("");
    setEditAmount("");
    setPayerChoice("p1");
    setCustomPayer({ name: "", nationalId: "", email: "", phone: "" });
    
    
    setSplitOpen(false);
    setSplitParts([
      { label: "הורה 1", amount: "", firstName: "", lastName: "", email: "", phone: "" },
      { label: "הורה 2", amount: "", firstName: "", lastName: "", email: "", phone: "" },
    ]);
    setSplitResults([]);
    setChecksOpen(false);
    setNumChecks("1");
    setFirstCheckDate(today);
    setFirstCheckNumber("");
    setFirstCheckAmount("");
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
    const manualFirst = parseFloat(firstCheckAmount);
    const hasManualFirst = !Number.isNaN(manualFirst) && manualFirst > 0;
    if (hasManualFirst && manualFirst > total) {
      toast.error("סכום הצ׳ק הראשון לא יכול לעבור את סה״כ הפריסה");
      return;
    }
    const remaining = hasManualFirst ? Math.round((total - manualFirst) * 100) / 100 : 0;
    const restCount = hasManualFirst ? n - 1 : n;
    if (hasManualFirst && restCount < 0) {
      toast.error("מספר הצ׳קים קטן מדי לסכום הראשון שהוזן");
      return;
    }
    const baseWhole = restCount > 0 ? Math.floor(remaining / restCount) : 0;
    const remainder = restCount > 0 ? Math.round((remaining - baseWhole * restCount) * 100) / 100 : 0;
    const firstAmt = hasManualFirst ? manualFirst : Math.round((baseWhole + remainder) * 100) / 100;
    const startNum = parseInt(firstCheckNumber);
    const rows: Array<{ date: string; number: string; amount: string }> = [];
    for (let i = 0; i < n; i++) {
      const isFirst = i === 0;
      const isSecond = i === 1 && hasManualFirst;
      const amt = isFirst
        ? firstAmt
        : (hasManualFirst
            ? (isSecond ? Math.round((baseWhole + remainder) * 100) / 100 : baseWhole)
            : baseWhole);
      rows.push({
        date: addMonthsIso(firstCheckDate, i),
        number: Number.isFinite(startNum) ? String(startNum + i) : "",
        amount: String(amt),
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
        <DialogContent className="max-w-lg sm:max-w-xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden p-0" dir="rtl">
          <DialogHeader className="px-6 pb-2 pt-6 text-right sm:text-right">
            <DialogTitle>{isEdit ? "עריכת רישום" : "הוסף תשלום / זיכוי"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "עדכון פרטי רישום קיים."
                : "כל שיוך ייווצר כרישום נפרד עם הסכום שלו (וכפריט נפרד בקבלה)."}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[calc(90vh-5.5rem)] space-y-4 overflow-y-auto overflow-x-hidden overscroll-contain px-6 pb-6 pl-10 pt-2 [scrollbar-gutter:stable]">
            {/* Transaction type */}
            <div>
              <Label>סוג רישום</Label>
              <div className="flex gap-2 mt-1">
                <button
                  type="button"
                  className={`flex-1 h-10 rounded-lg text-sm font-medium border transition-colors ${transactionType === "payment" ? "bg-emerald-600 text-white border-emerald-600" : "bg-background text-emerald-700 border-emerald-200 hover:bg-emerald-50"}`}
                  onClick={() => { setTransactionType("payment"); setSelectedAmounts({}); }}

                >
                  תשלום
                </button>
                <button
                  type="button"
                  className={`flex-1 h-10 rounded-lg text-sm font-medium border transition-colors ${transactionType === "credit" ? "bg-red-600 text-white border-red-600" : "bg-background text-red-700 border-red-200 hover:bg-red-50"}`}
                  onClick={() => {
                    setTransactionType("credit");
                    setPaymentMethod("transfer");
                    setSelectedAmounts({});
                  }}

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
            ) : transactionType === "credit" && paymentMethod === "transfer" ? (
              <div className="rounded-xl border border-border bg-muted/20 p-3 text-sm leading-relaxed">
                בזיכוי בהעברה בנקאית לא בוחרים שיוכים — הזיכוי נרשם על הקבלה כולה.
                בחרו למטה את הקבלה לזיכוי ואת סכום ההחזר בפועל.
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between">
                  <Label>{transactionType === "credit" ? "שיוכים לזיכוי · הזינו סכום החזר" : "שיוכים וסכומים"}</Label>
                  <div className="flex gap-2 text-xs">
                    <button type="button" className="text-primary hover:underline" onClick={selectAll}>בחר הכל</button>
                    <span className="text-muted-foreground">·</span>
                    <button type="button" className="text-muted-foreground hover:underline" onClick={clearAll}>נקה</button>
                  </div>
                </div>
                {transactionType === "credit" && (
                  <p className="text-xs text-muted-foreground mt-1">
                    הסכומים כאן הם סכומי הזיכוי, לא סכום החיוב המקורי.
                  </p>
                )}
                {paymentItems.length === 0 ? (
                  <p className="text-sm text-muted-foreground mt-2">אין שיוכים פעילים</p>
                ) : (

                  <div className="mt-2 w-full space-y-2 overflow-hidden">
                    {paymentItems.map((it) => {
                      const checked = selectedAmounts[it.id] !== undefined;
                      const isDiscount = it.kind === "discount";
                      const isEditingDesc = editingDescIds.includes(it.id);
                      const hasOverride = !!descOverrides[it.id]?.trim();
                      return (
                        <div
                          key={it.id}
                            className={`w-full min-w-0 rounded-lg border p-2 ${
                            isDiscount ? "border-emerald-300/60 bg-emerald-50/40" : "border-border"
                          }`}
                        >
                          <div className="flex w-full min-w-0 items-center gap-2">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => toggleItem(it, !!v)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug break-words">
                              {it.label}
                              {it.kind === "special" && <span className="text-[10px] text-primary mr-1">★</span>}
                              {isDiscount && <span className="text-[10px] text-emerald-700 mr-1">−</span>}
                            </p>
                            {it.subLabel && (
                              <p className={`text-xs leading-snug break-words ${isDiscount ? "text-emerald-700" : "text-muted-foreground"}`}>{it.subLabel}</p>
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
                            placeholder={transactionType === "credit" ? "0.00" : it.defaultAmount !== 0 ? String(it.defaultAmount) : "0.00"}
                            className="h-9 w-24 shrink-0 sm:w-28"
                          />
                          </div>

                          {transactionType === "payment" && (
                            <div className="mt-1.5 ps-6">
                              {isEditingDesc ? (
                                <div className="space-y-1">
                                  <Label className="text-[11px] text-muted-foreground">
                                    שם השורה בקבלה / בדף התשלום
                                  </Label>
                                  <Input
                                    value={descOverrides[it.id] ?? defaultLineDescription(it.id, it)}
                                    onChange={(ev) =>
                                      setDescOverrides((prev) => ({ ...prev, [it.id]: ev.target.value }))
                                    }
                                    className="h-9 text-sm"
                                  />
                                  <div className="flex gap-3 text-xs">
                                    <button
                                      type="button"
                                      className="text-primary hover:underline"
                                      onClick={() => setEditingDescIds((prev) => prev.filter((x) => x !== it.id))}
                                    >
                                      סיום עריכה
                                    </button>
                                    <button
                                      type="button"
                                      className="text-muted-foreground hover:underline"
                                      onClick={() => {
                                        setDescOverrides((prev) => {
                                          const next = { ...prev };
                                          delete next[it.id];
                                          return next;
                                        });
                                        setEditingDescIds((prev) => prev.filter((x) => x !== it.id));
                                      }}
                                    >
                                      איפוס לברירת מחדל
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="flex w-full items-start gap-1.5 text-start text-[11px] text-muted-foreground hover:text-primary"
                                  onClick={() => setEditingDescIds((prev) => [...prev, it.id])}
                                >
                                  <Pencil className="mt-[2px] h-3 w-3 shrink-0" />
                                  <span className="break-words">
                                    {hasOverride ? descOverrides[it.id] : defaultLineDescription(it.id, it)}
                                  </span>
                                </button>
                              )}
                            </div>
                          )}
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

            {(isEdit || paymentMethod !== "credit_card") && (
              <div>
                <Label>{transactionType === "credit" ? "תאריך זיכוי" : "תאריך תשלום"}</Label>
                <DateInput value={paymentDate} onChange={(v) => setPaymentDate(v)} />
              </div>
            )}
            <div>
              <Label htmlFor="payment-method">{transactionType === "credit" ? "אופן זיכוי" : "אופן תשלום"}</Label>
              <select id="payment-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={selectClass}>
                {(transactionType === "credit" ? CREDIT_PAYMENT_METHODS : PAYMENT_METHODS).map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>

            {!isEdit && transactionType === "credit" && onOpenChequeCancel && (
              <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">צ׳קים עתידיים</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    לפני החזר בהעברה בנקאית — בדקו אם יש צ׳קים שטרם הופקדו וניתן לבטל אותם.
                  </p>
                </div>
                <Button type="button" variant="outline" className="h-10 rounded-xl shrink-0 gap-2" onClick={onOpenChequeCancel}>
                  <CalendarClock className="h-4 w-4" /> ביטול צ׳קים עתידיים
                </Button>
              </div>
            )}

            {/* Credit executed as an outgoing bank transfer — one refund for the
                whole receipt (including cheque spreads), not per cheque. */}
            {!isEdit && transactionType === "credit" && paymentMethod === "transfer" && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                <p className="text-sm font-medium text-foreground">החזר בהעברה בנקאית</p>
                <div>
                  <Label htmlFor="refund-source">קבלה לזיכוי</Label>
                  <select
                    id="refund-source"
                    value={refundSourceId}
                    onChange={(e) => {
                      setRefundSourceId(e.target.value);
                      const s = refundSources.find((x) => x.id === e.target.value);
                      if (s) setBankRefundAmount(String(s.remaining));
                    }}
                    className={selectClass}
                  >
                    <option value="">בחר קבלה...</option>
                    {refundSources.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  {refundSources.length === 0 && (
                    <p className="text-xs text-muted-foreground mt-1">אין קבלות שניתן לזכות.</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="refund-total">סכום הזיכוי (₪)</Label>
                  <Input
                    id="refund-total"
                    type="number"
                    min="0"
                    step="0.01"
                    value={bankRefundAmount}
                    onChange={(e) => setBankRefundAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <Button
                  className="w-full h-11 rounded-xl"
                  onClick={() => {
                    const src = refundSources.find((x) => x.id === refundSourceId);
                    if (!src) { toast.error("נא לבחור קבלה"); return; }
                    const amt = Number(bankRefundAmount);
                    if (!amt || amt <= 0) { toast.error("נא להזין סכום חיובי"); return; }
                    if (amt > src.remaining + 0.005) {
                      toast.error(`הסכום חורג מהנותר לזיכוי (₪${src.remaining.toLocaleString()})`);
                      return;
                    }
                    setBankRefund({
                      studentId: familyContext?.anchorStudentId ?? studentId,
                      parentName: familyContext?.parentName ?? "",
                      paymentId: src.id,
                      paidAmount: src.amount,
                      refundAmount: amt,
                    });
                  }}
                >
                  המשך — מכתב להנהלת החשבונות
                </Button>
              </div>
            )}

            {paymentMethod !== "check" && paymentMethod !== "credit_card" && paymentMethod !== "cash" && paymentMethod !== "transfer" && (
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
                      ניתן להזין סכום לצ׳ק הראשון; אם השדה ריק, הסכום יתחלק שווה בשווה והראשון יספוג את השארית. ניתן לערוך כל שורה ידנית.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Label className="text-xs">מספר צ׳קים</Label>
                        <Input type="number" min="1" max="24" value={numChecks} onChange={(e) => setNumChecks(e.target.value)} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">תאריך צ׳ק ראשון</Label>
                        <DateInput value={firstCheckDate} onChange={(v) => setFirstCheckDate(v)} className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">מספר צ׳ק ראשון</Label>
                        <Input value={firstCheckNumber} onChange={(e) => setFirstCheckNumber(e.target.value)} placeholder="לדוגמה: 1001" className="h-9" />
                      </div>
                      <div>
                        <Label className="text-xs">סכום צ׳ק ראשון (₪)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={firstCheckAmount}
                          onChange={(e) => setFirstCheckAmount(e.target.value)}
                          placeholder="ריק = חלוקה שווה"
                          className="h-9"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">סה״כ לפריסה</Label>
                        <Input value={`₪${totalSelected.toLocaleString()}`} disabled className="h-9" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 items-end">
                      <BankBranchPicker
                        bankName={bankName}
                        setBankName={setBankName}
                        bankCode={bankCode}
                        setBankCode={setBankCode}
                        branch={bankBranch}
                        setBranch={setBankBranch}
                      />
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
                            <DateInput value={c.date}
                              onChange={(v) => setChecks((prev) => prev.map((x, idx) => idx === i ? { ...x, date: v } : x))} className="h-9" />
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
                {parentOptions.length > 0 && (
                  <div className="rounded-xl border border-border p-3 space-y-2">
                    <Label className="text-sm">מי המשלם?</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {parentOptions.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setPayerChoice(p.key)}
                          className={`text-right rounded-xl border p-2.5 transition ${
                            payerChoice === p.key
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <p className="text-sm font-medium">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {[p.nationalId, p.phone, p.email].filter(Boolean).join(" · ") || "אין פרטים"}
                          </p>
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPayerChoice("custom")}
                        className={`text-right rounded-xl border p-2.5 transition ${
                          isCustomPayer ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                        }`}
                      >
                        <p className="text-sm font-medium">משלם נוסף</p>
                        <p className="text-[11px] text-muted-foreground">סבא/סבתא, בן משפחה או צד ג׳</p>
                      </button>
                    </div>
                    {isCustomPayer && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <Input
                          value={customPayer.name}
                          onChange={(e) => setCustomPayer((p) => ({ ...p, name: e.target.value }))}
                          placeholder="שם מלא"
                          className="h-11 rounded-xl"
                        />
                        <Input
                          value={customPayer.nationalId}
                          onChange={(e) => setCustomPayer((p) => ({ ...p, nationalId: e.target.value }))}
                          placeholder="ת״ז"
                          className="h-11 rounded-xl"
                        />
                        <Input
                          value={customPayer.phone}
                          onChange={(e) => setCustomPayer((p) => ({ ...p, phone: e.target.value }))}
                          placeholder="טלפון"
                          className="h-11 rounded-xl"
                        />
                        <Input
                          value={customPayer.email}
                          onChange={(e) => setCustomPayer((p) => ({ ...p, email: e.target.value }))}
                          placeholder="אימייל"
                          className="h-11 rounded-xl"
                        />
                      </div>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      פרטי המשלם שנבחר ימולאו אוטומטית בדף התשלום. אפשר ליצור קישור נפרד לכל משלם.
                    </p>
                  </div>
                )}
                <Button
                  variant="outline"
                  className="w-full h-11 rounded-xl"
                  onClick={() => generateLinkMutation.mutate()}
                  disabled={totalSelected <= 0 || generateLinkMutation.isPending || (isCustomPayer && !customPayer.name.trim())}
                >
                  {generateLinkMutation.isPending ? (
                    <><Loader2 className="h-4 w-4 animate-spin ml-2" /> יוצר קישור...</>
                  ) : (
                    <><LinkIcon className="h-4 w-4 ml-2" /> צור קישור לסכום מותאם {totalSelected > 0 ? `(₪${totalSelected.toLocaleString()})` : ""}</>
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
                    {splitParts.map((part, idx) => {
                      const update = (patch: Partial<typeof part>) =>
                        setSplitParts((prev) => prev.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
                      return (
                        <div key={idx} className="space-y-2 rounded-lg border border-border bg-muted/20 p-2">
                          <div className="flex items-center gap-2">
                            <Input
                              value={part.label}
                              onChange={(e) => update({ label: e.target.value })}
                              placeholder={`הורה ${idx + 1}`}
                              className="flex-1 h-9"
                            />
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={part.amount}
                              onChange={(e) => update({ amount: e.target.value })}
                              placeholder="סכום"
                              className="w-28 h-9"
                            />
                            {splitParts.length > 2 && (
                              <button
                                type="button"
                                className="text-destructive hover:opacity-70"
                                onClick={() => setSplitParts((prev) => {
                                  const next = prev.filter((_, i) => i !== idx);
                                  if (totalSelected > 0 && next.length > 0) {
                                    const per = Math.round((totalSelected / next.length) * 100) / 100;
                                    const diff = Math.round((totalSelected - per * next.length) * 100) / 100;
                                    return next.map((p, i) => ({
                                      ...p,
                                      amount: String(i === next.length - 1 ? Math.round((per + diff) * 100) / 100 : per),
                                    }));
                                  }
                                  return next;
                                })}
                                aria-label="הסר"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Input value={part.firstName} onChange={(e) => update({ firstName: e.target.value })} placeholder="שם פרטי" className="h-9" />
                            <Input value={part.lastName} onChange={(e) => update({ lastName: e.target.value })} placeholder="שם משפחה" className="h-9" />
                            <Input value={part.email} onChange={(e) => update({ email: e.target.value })} placeholder="מייל" className="h-9" dir="ltr" />
                            <Input value={part.phone} onChange={(e) => update({ phone: e.target.value })} placeholder="טלפון" className="h-9" dir="ltr" />
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          setSplitParts((prev) => {
                            const next = [
                              ...prev,
                              { label: `הורה ${prev.length + 1}`, amount: "", firstName: "", lastName: "", email: "", phone: "" },
                            ];
                            if (totalSelected > 0) {
                              const per = Math.round((totalSelected / next.length) * 100) / 100;
                              const diff = Math.round((totalSelected - per * next.length) * 100) / 100;
                              return next.map((p, i) => ({
                                ...p,
                                amount: String(i === next.length - 1 ? Math.round((per + diff) * 100) / 100 : per),
                              }));
                            }
                            return next;
                          })
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
                        <><LinkIcon className="h-4 w-4 ml-2" /> צור {splitParts.length} קישורים</>
                      )}
                    </Button>
                    {splitResults.length > 0 && (
                      <div className="space-y-2 pt-3 mt-1 border-t border-border">
                        <p className="text-xs font-medium text-foreground">הקישורים שנוצרו:</p>
                        <div className="space-y-2">
                          {splitResults.map((r, i) => {
                            const fullName = [r.firstName, r.lastName].filter(Boolean).join(" ").trim();
                            return (
                            <div key={i} className="w-full rounded-lg border border-border bg-muted/30 p-2.5">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-foreground truncate">
                                    {r.label}
                                    {fullName ? ` · ${fullName}` : ""}
                                    <span className="text-muted-foreground font-normal"> · ₪{r.amount.toLocaleString()}</span>
                                  </p>
                                  {(r.email || r.phone) && (
                                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                                      {[r.phone, r.email].filter(Boolean).join(" · ")}
                                    </p>
                                  )}
                                </div>
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
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
              </div>
            )}
            {/* Save button: only for cash/checks or when editing an existing row.
                Credit-card flow only produces payment links — the actual payment
                row is created by the iCount webhook after the parent pays. */}
            {(isEdit || paymentMethod === "cash" || paymentMethod === "check") && (
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
            )}
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

      <BankTransferRefundDialog
        open={!!bankRefund}
        onOpenChange={(o) => { if (!o) setBankRefund(null); }}
        defaults={bankRefund}
        invalidate={() => {
          queryClient.invalidateQueries({ queryKey: ["family-details"] });
          queryClient.invalidateQueries({ queryKey: ["student-payments", studentId] });
        }}
        onDone={(info) => {
          setBankRefund(null);
          toast.success(`קבלת זיכוי בסך ₪${Number(info.amount || 0).toLocaleString()} הופקה`);
          if (info.url) window.open(info.url, "_blank");
          onOpenChange(false);
        }}
      />
    </>
  );
};

export default AddPaymentDialog;
