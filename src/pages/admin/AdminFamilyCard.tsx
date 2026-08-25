import { shortenUrl } from "@/lib/shortLink";
import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import UnifyParentDetailsDialog from "@/components/admin/UnifyParentDetailsDialog";
import FamilyNotesSection from "@/components/admin/FamilyNotesSection";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  Users,
  User,
  Phone,
  Mail,
  ExternalLink,
  Wallet,
  Receipt,
  ArrowLeft,
  FileDown,
  Trash2,
  Plus,
  Copy,
  Send,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Ban,
  Loader2,
  Clock,
} from "lucide-react";

import StopEnrollmentDialog from "@/components/admin/StopEnrollmentDialog";
import { useFamiliesList, useFamilyDetails } from "@/hooks/useFamilies";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { computeChildTotals, type FamilyDraftRow } from "@/lib/familyCalc";
import type { DiscountType } from "@/lib/discounts";
import AddPaymentDialog, { type FamilyPaymentContext, type FamilyPaymentItemOverride, type RefundSource } from "@/components/admin/AddPaymentDialog";
import SendFamilyAssignmentMessage from "@/components/admin/SendFamilyAssignmentMessage";
import BankTransferRefundDialog, { type BankRefundDefaults } from "@/components/admin/BankTransferRefundDialog";
import RefundSuccessDialog, { type RefundSuccessInfo } from "@/components/admin/RefundSuccessDialog";
import ChequeCancellationTracking from "@/components/admin/ChequeCancellationTracking";
import { createChequeWithdrawalRequest, parseChequeMeta, openLetter } from "@/lib/chequeCancellation";
import { useAppLogo } from "@/hooks/useAppLogo";
import { formatPaymentMethodWithCount, isCheckMethod, summarizePaymentMethods } from "@/lib/paymentMethodLabel";



const STATUS_LABELS: Record<string, string> = {
  paid: "שולם",
  pending: "ממתין",
  failed: "נכשל",
};

const HEBREW_YEAR_MAP: Record<string, string> = {
  "2024-2025": "תשפ״ה",
  "2025-2026": "תשפ״ו",
  "2026-2027": "תשפ״ז",
  "2027-2028": "תשפ״ח",
  "2028-2029": "תשפ״ט",
  "2029-2030": "תש״צ",
  "2030-2031": "תשצ״א",
};
const toHebrewYear = (name?: string | null) =>
  name ? HEBREW_YEAR_MAP[name] ?? name : "";

const fmt = (n: number) =>
  `₪${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const AdminFamilyCard = () => {
  const { parentNationalId: raw } = useParams();
  const parentNationalId = raw ? decodeURIComponent(raw) : "";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedYearId, activeYear } = useAcademicYear();
  const yearId = selectedYearId ?? activeYear?.id ?? null;
  const { logoUrl } = useAppLogo();

  const [unifyOpen, setUnifyOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [sendMessageOpen, setSendMessageOpen] = useState(false);


  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [familyCtx, setFamilyCtx] = useState<FamilyPaymentContext | null>(null);
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [paymentSortBy, setPaymentSortBy] = useState<"payment_date" | "paid_at">("payment_date");
  const [selectedCheques, setSelectedCheques] = useState<Record<string, boolean>>({});
  const [pendingInvoiceParams, setPendingInvoiceParams] = useState<{ paymentId?: string; groupId?: string; isCredit?: boolean } | null>(null);
  const [invoiceNote, setInvoiceNote] = useState("");
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [bankRefund, setBankRefund] = useState<BankRefundDefaults | null>(null);
  const [refundSuccess, setRefundSuccess] = useState<RefundSuccessInfo | null>(null);
  const [refundMethod, setRefundMethod] = useState<"bank_transfer" | "credit_card" | "receipt">("bank_transfer");
  const [owedByGroup, setOwedByGroup] = useState<Record<string, string>>({});



  const { data: families = [] } = useFamiliesList(yearId);
  const family = useMemo(
    () => families.find((f) => f.parent_national_id === parentNationalId),
    [families, parentNationalId],
  );

  const { data, isLoading } = useFamilyDetails(
    parentNationalId,
    family?.children_ids,
    yearId,
  );

  const children = data?.children ?? [];
  const enrollments = data?.enrollments ?? [];
  const payments = data?.payments ?? [];

  // ── Data needed for real per-child computation (mirrors AdminStudentPaymentCalc) ──
  const { data: settings } = useQuery({
    queryKey: ["family-payment-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_settings" as any)
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: yearFull } = useQuery({
    queryKey: ["family-year", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("*")
        .eq("id", yearId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: discountTypes = [] } = useQuery({
    queryKey: ["family-discount-types", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_types" as any)
        .select("*")
        .eq("academic_year_id", yearId!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as any[]) as DiscountType[];
    },
  });

  const childIdsKey = (family?.children_ids ?? []).slice().sort().join(",");
  const { data: drafts = [] } = useQuery({
    queryKey: ["family-drafts", childIdsKey, yearId],
    enabled: !!yearId && !!family?.children_ids?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_payment_drafts" as any)
        .select(
          "student_id, selected_discount_ids, custom_discounts, start_date_overrides, discount_enrollment_overrides",
        )
        .in("student_id", family!.children_ids)
        .eq("academic_year_id", yearId!);
      if (error) throw error;
      return (data ?? []) as unknown as FamilyDraftRow[];
    },
  });

  // ── Per-child computed totals ──
  const perChild = useMemo(() => {
    if (!settings || !yearFull || !discountTypes) return new Map();
    const prices = (settings.lesson_prices ?? {}) as Record<string, number>;
    const yStart = yearFull.start_date as string;
    const yEnd = yearFull.end_date as string;
    const draftByChild = new Map<string, FamilyDraftRow>();
    for (const d of drafts) draftByChild.set(d.student_id, d);

    const out = new Map<string, ReturnType<typeof computeChildTotals>>();
    for (const c of children) {
      const es = enrollments.filter((e) => e.student_id === c.id);
      const totals = computeChildTotals(
        c.id,
        es as any,
        draftByChild.get(c.id) ?? null,
        discountTypes,
        prices,
        yStart,
        yEnd,
      );
      out.set(c.id, totals);
    }
    return out;
  }, [children, enrollments, drafts, settings, yearFull, discountTypes]);





  // Selection of enrollments/items now happens inside AddPaymentDialog.

  const pendingPayments = useMemo(
    () =>
      payments.filter(
        (p) => p.payment_status === "pending" && p.transaction_type === "payment",
      ),
    [payments],
  );
  const hasPendingLinks = pendingPayments.some((p) => !!p.payment_link_url);




  // Special-course items per child (music production / recital track).
  type SpecialItem = { key: string; label: string; price: number };
  const specialsByChild = useMemo(() => {
    const map = new Map<string, SpecialItem[]>();
    const mpPrice = Number(settings?.music_production_price) || 0;
    const rtPrice = Number(settings?.recital_track_price) || 0;
    for (const c of children) {
      const items: SpecialItem[] = [];
      if (c.has_music_production_course && mpPrice > 0) {
        items.push({ key: "music_production", label: "קורס הפקה מוסיקלית", price: mpPrice });
      }
      if (c.has_recital_track && rtPrice > 0) {
        items.push({ key: "recital_track", label: "מסלול לרסיטל", price: rtPrice });
      }
      if (items.length) map.set(c.id, items);
    }
    return map;
  }, [children, settings]);

  const specialsTotal = useMemo(() => {
    let sum = 0;
    for (const arr of specialsByChild.values()) for (const s of arr) sum += s.price;
    return sum;
  }, [specialsByChild]);

  // Family financial rollup
  const totalExpected = useMemo(
    () => Array.from(perChild.values()).reduce((s, t) => s + t.net, 0) + specialsTotal,
    [perChild, specialsTotal],
  );
  const totalPaid = payments
    .filter((p) => p.transaction_type === "payment" && p.payment_status === "paid")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalCredit = payments
    .filter((p) => p.transaction_type === "credit")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  // Credits are stored as negative amounts (e.g. -15). We subtract them so a
  // refund cancels out the matching paid row instead of being counted twice.
  const balance = Math.round((totalExpected - totalPaid - totalCredit) * 100) / 100;

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of children) m.set(c.id, `${c.first_name} ${c.last_name}`.trim());
    return m;
  }, [children]);

  // Merged active enrollments across all children — used by AddPaymentDialog
  // so its link/split flows can look up instrument/school/duration.
  const mergedEnrollments = useMemo(
    () => enrollments.filter((e: any) => e.is_active !== false),
    [enrollments],
  );

  // Build override items for AddPaymentDialog family mode. Each active
  // enrollment becomes one item with `studentId = child.id` and a label that
  // includes the child name, so the dialog can group rows per child.
  const buildFamilyContext = (): FamilyPaymentContext | null => {
    if (!family || !yearFull) return null;
    const overrideItems: FamilyPaymentItemOverride[] = [];

    for (const c of children) {
      const t = perChild.get(c.id);
      if (!t) continue;
      const childName = `${c.first_name} ${c.last_name}`.trim();

      // Enrollments for this child.
      for (const en of t.enrollments) {
        if (!en.isActive) continue;
        const parts = [
          en.instrumentName,
          en.teacherName !== "—" ? en.teacherName : "",
          en.schoolName !== "—" ? en.schoolName : "",
        ].filter(Boolean).join(" · ");
        overrideItems.push({
          id: `${c.id}:${en.enrollmentId}`,
          enrollmentId: en.enrollmentId,
          studentId: c.id,
          label: `${childName} — ${parts || "שכר לימוד"}`,
          subLabel: `${en.lessonsRemaining}/${en.lessonsTotal} שיעורים`,
          defaultAmount: Math.round(en.prorated * 100) / 100,
          kind: "enrollment",
        });
      }

      // Special courses for this child, right below their enrollments.
      const specials = specialsByChild.get(c.id) ?? [];
      for (const s of specials) {
        overrideItems.push({
          id: `${c.id}:special:${s.key}`,
          enrollmentId: null,
          studentId: c.id,
          label: `${childName} — ${s.label}`,
          subLabel: "קורס מיוחד",
          defaultAmount: Math.round(s.price * 100) / 100,
          kind: "special",
        });
      }

      // Discount lines for this child.
      for (let i = 0; i < t.discountLines.length; i++) {
        const d = t.discountLines[i];
        overrideItems.push({
          id: `${c.id}:discount:${i}`,
          enrollmentId: null,
          studentId: c.id,
          label: d.label,
          subLabel: "הנחה",
          defaultAmount: -Math.round(d.amount * 100) / 100,
          kind: "discount",
        });
      }
    }
    return {
      parentNationalId,
      parentName: family.parent_name ?? "",
      parentEmail: family.parent_email ?? "",
      parentPhone: family.parent_phone ?? "",
      familyGroupId: crypto.randomUUID(),
      anchorStudentId: family.children_ids[0],
      overrideItems,
      childrenNames: Object.fromEntries(
        children.map((c) => [c.id, `${c.first_name} ${c.last_name}`.trim()]),
      ),
      invalidateKeys: [["family-details"]],
    };
  };


  const openNewPayment = () => {
    setEditingPayment(null);
    setFamilyCtx(buildFamilyContext());
    setPaymentDialogOpen(true);
  };

  const invalidateFamily = () => {
    queryClient.invalidateQueries({ queryKey: ["family-details"] });
  };

  // Row-level actions on the payments table.
  const createInvoiceMutation = useMutation({
    mutationFn: async (params: { paymentId?: string; groupId?: string; note?: string }) => {
      const { data, error } = await supabase.functions.invoke("icount-create-invoice", { body: params });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any) => {
      invalidateFamily();
      if (data?.url) {
        toast.success(`קבלה ${data.doc_number ?? ""} נוצרה`);
        window.open(data.url, "_blank");
      } else toast.success("קבלה נוצרה");
    },
    onError: (e: any) => toast.error(`שגיאה ביצירת קבלה: ${e?.message ?? ""}`),
  });

  const deleteLinkMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { data, error } = await supabase.functions.invoke(
        "icount-delete-student-paypage",
        { body: { paymentId } },
      );
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      // Also delete the pending row itself.
      await supabase.from("student_payments").delete().eq("id", paymentId);
    },
    onSuccess: () => { invalidateFamily(); toast.success("הקישור וההזמנה נמחקו"); },
    onError: (e: any) => toast.error(`שגיאה במחיקת קישור: ${e?.message ?? ""}`),
  });

  const refundMutation = useMutation({
    mutationFn: async ({ paymentId, amount, isCc }: { paymentId: string; amount: number; isCc: boolean }) => {
      const fn = isCc ? "icount-student-refund-api" : "icount-create-refund";
      const body = isCc ? { paymentId, refundAmount: amount } : { paymentId, amount };
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) throw error;
      if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
      return data;
    },
    onSuccess: (data: any, vars) => {
      invalidateFamily();
      setRefundTarget(null);
      setRefundAmount("");
      toast.success(`זיכוי בסך ₪${(data?.refund_amount ?? vars.amount).toLocaleString()} בוצע`);
      if (data?.url) window.open(data.url, "_blank");
    },
    onError: (e: any) => toast.error(`שגיאה בזיכוי: ${e?.message ?? ""}`),
  });

  // Delete a single row (e.g. cancel one cheque out of a spread).
  const deleteRowMutation = useMutation({
    mutationFn: async (paymentId: string) => {
      const { error } = await supabase.from("student_payments").delete().eq("id", paymentId);
      if (error) throw error;
    },
    onSuccess: () => { invalidateFamily(); toast.success("השורה בוטלה"); },
    onError: (e: any) => toast.error(`שגיאה בביטול: ${e?.message ?? ""}`),
  });

  // Mark a cheque as cleared / not cleared (manual override on top of the date-based hint).
  const chequeStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "pending" | "cleared" }) => {
      const { error } = await supabase
        .from("student_payments")
        .update({
          cheque_status: status,
          cheque_cleared_at: status === "cleared" ? new Date().toISOString().slice(0, 10) : null,
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidateFamily(),
    onError: (e: any) => toast.error(`שגיאה בעדכון: ${e?.message ?? ""}`),
  });

  // Stage 1 of the cheque cancellation process: a withdrawal request + a letter to
  // the bookkeeping office. No iCount document is created here.
  const cancelChequesMutation = useMutation({
    mutationFn: async (paymentIds: string[]) => {
      const rows = payments.filter((p: any) => paymentIds.includes(p.id));
      const items = rows.map((p: any) => {
        const meta = parseChequeMeta(p.notes);
        return {
          paymentId: p.id,
          chequeNumber: String(p.reference_number ?? ""),
          bank: meta.bank,
          branch: meta.branch,
          account: meta.account,
          dueDate: String(p.payment_date ?? "").slice(0, 10),
          amount: Math.abs(Number(p.amount || 0)),
          studentName: p.student_id ? nameById.get(p.student_id) : undefined,
          docNumber: p.icount_doc_number ?? null,
        };
      });
      return await createChequeWithdrawalRequest({
        items,
        parentName: family?.parent_name ?? "",
        parentNationalId: parentNationalId ?? "",
        studentId: family?.children_ids?.[0] ?? null,
        academicYearId: yearId,
        creditDue: Math.max(0, -balance),
        logoUrl,
      });
    },
    onSuccess: (res: any) => {
      invalidateFamily();
      queryClient.invalidateQueries({ queryKey: ["cheque-cancellation-requests"] });
      setSelectedCheques({});
      toast.success(`נפתחה בקשה למשיכת צ׳קים · ${fmt(Number(res?.total ?? 0))}`);
      openLetter(res.html);
    },
    onError: (e: any) => toast.error(`שגיאה ביצירת הבקשה: ${e?.message ?? ""}`),
  });


  // Receipts that can still be credited — one entry per receipt (a cheque
  // spread counts as a single receipt, never per cheque).
  const refundSources: RefundSource[] = useMemo(() => {
    const groups = new Map<string, any[]>();
    for (const p of payments as any[]) {
      if (p.transaction_type === "credit") continue;
      const k = p.payment_group_id ? `g:${p.payment_group_id}` : `p:${p.id}`;
      const arr = groups.get(k);
      if (arr) arr.push(p); else groups.set(k, [p]);
    }
    const out: RefundSource[] = [];
    for (const rows of groups.values()) {
      const head = rows.find((r: any) => r.icount_doc_id) ?? rows[0];
      if (!head?.icount_doc_id) continue;
      const total = rows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const refunded = (payments as any[])
        .filter((x: any) => rows.some((r: any) => r.id === x.refund_of_payment_id))
        .reduce((s: number, x: any) => s + Math.abs(Number(x.amount || 0)), 0);
      const remaining = Math.max(0, total - refunded);
      if (remaining <= 0.005) continue;
      const label = `קבלה ${head.icount_doc_number ?? ""} · ${format(new Date(head.payment_date), "dd/MM/yyyy")} · ${fmt(total)}${rows.length > 1 ? ` · פריסה (${rows.length})` : ""}`;
      out.push({ id: head.id, label, amount: total, remaining });
    }
    return out;
  }, [payments]);

  // Refund letters / documents saved for this family's children (bank-transfer requests etc.)
  const { data: refundDocs = [] } = useQuery({
    queryKey: ["family-refund-documents", childIdsKey],
    enabled: !!family?.children_ids?.length,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refund_documents")
        .select("id, title, doc_type, refund_amount, bank_reference, file_path, created_at, student_id")
        .in("student_id", family!.children_ids)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Storage serves the archived letters as plain text, so download the file and
  // re-open it locally as UTF-8 HTML (otherwise the browser shows raw markup).
  const openRefundDoc = async (path: string | null, docId?: string) => {
    let html: string | null = null;
    if (path) {
      const { data } = await supabase.storage.from("refund-documents").download(path);
      if (data) html = new TextDecoder("utf-8").decode(await data.arrayBuffer());
    }
    if (!html && docId) {
      const { data } = await supabase
        .from("refund_documents")
        .select("content_html")
        .eq("id", docId)
        .maybeSingle();
      html = data?.content_html ?? null;
    }
    if (!html) return toast.error("לא ניתן לפתוח את המסמך");
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const w = window.open(url, "_blank");
    if (!w) { URL.revokeObjectURL(url); return toast.error("החלון נחסם על ידי הדפדפן"); }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };



  return (
    <AdminLayout title="כרטיס משפחה" backPath="/admin/families">
      <PageTitle title={family?.parent_name || "כרטיס משפחה"} />

      {!family && !isLoading ? (
        <div className="text-center text-muted-foreground py-12">משפחה לא נמצאה</div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-5 w-5 text-primary" />
                  <h1 className="text-xl font-bold text-foreground">
                    {family?.parent_name || "ללא שם"}
                  </h1>
                </div>
                <div className="text-sm text-muted-foreground">
                  ת.ז. הורה: <span className="font-mono">{parentNationalId}</span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                  {family?.parent_phone && (
                    <a
                      href={`tel:${family.parent_phone}`}
                      className="inline-flex items-center gap-1 hover:text-primary"
                    >
                      <Phone className="h-4 w-4" /> {family.parent_phone}
                    </a>
                  )}
                  {family?.parent_email && (
                    <a
                      href={`mailto:${family.parent_email}`}
                      className="inline-flex items-center gap-1 hover:text-primary"
                    >
                      <Mail className="h-4 w-4" /> {family.parent_email}
                    </a>
                  )}
                </div>
                {family?.partner_national_id ? (
                  <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                    <div className="text-xs text-muted-foreground mb-1">הורה שני</div>
                    <div className="text-sm font-medium text-foreground">
                      {family.partner_name || "ללא שם"}
                      <span className="text-xs text-muted-foreground font-mono ms-2">
                        ת.ז. {family.partner_national_id}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                      {family.partner_phone && (
                        <a
                          href={`tel:${family.partner_phone}`}
                          className="inline-flex items-center gap-1 hover:text-primary"
                        >
                          <Phone className="h-4 w-4" /> {family.partner_phone}
                        </a>
                      )}
                      {family.partner_email && (
                        <a
                          href={`mailto:${family.partner_email}`}
                          className="inline-flex items-center gap-1 hover:text-primary"
                        >
                          <Mail className="h-4 w-4" /> {family.partner_email}
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 text-xs text-muted-foreground">
                    אין הורה שני משויך — ניתן להוסיף מכרטיס התלמיד (הורה 2)
                  </div>
                )}
              </div>

              <div className="flex flex-col items-end gap-2">
                <Badge variant="default" className="text-sm">
                  {children.length} {children.length === 1 ? "ילד" : "ילדים"}
                </Badge>
                {children.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUnifyOpen(true)}
                    className="rounded-xl"
                  >
                    {children.length > 1 ? "ערוך ואחד פרטי הורה" : "ערוך פרטי הורה"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          <UnifyParentDetailsDialog
            open={unifyOpen}
            onOpenChange={setUnifyOpen}
            parentNationalId={parentNationalId}
            children={children}
          />

          <FamilyNotesSection parentNationalId={parentNationalId} yearId={yearId} />

          {/* Per-child breakdown */}
          {children.map((c) => {
            const t = perChild.get(c.id);
            const rows = t?.enrollments ?? [];
            const childSpecials = specialsByChild.get(c.id) ?? [];
            const childSpecialsTotal = childSpecials.reduce((s, x) => s + x.price, 0);
            const childTotal = (t?.net ?? 0) + childSpecialsTotal;
            const childPaid = payments
              .filter((p: any) => p.student_id === c.id && p.transaction_type === "payment" && p.payment_status === "paid")
              .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
            const childBalance = Math.max(0, Math.round((childTotal - childPaid) * 100) / 100);

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm overflow-hidden"
              >

                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <button
                    onClick={() => navigate(`/admin/students/${c.id}`)}
                    className="text-right group inline-flex items-center gap-2 hover:text-primary"
                  >
                    <User className="h-4 w-4" />
                    <span className="font-semibold text-base">
                      {c.first_name} {c.last_name}
                    </span>
                    <ArrowLeft className="h-4 w-4 opacity-60 group-hover:opacity-100" />
                    {c.grade && (
                      <span className="text-xs text-muted-foreground font-normal">
                        · כיתה {c.grade}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="text-muted-foreground">סה"כ לילד:</span>
                    <span className="font-bold text-foreground">
                      {fmt(childTotal)}
                    </span>
                    {childPaid > 0.01 && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">שולם:</span>
                        <span className="font-bold text-emerald-600">
                          {fmt(childPaid)}
                        </span>
                      </>
                    )}
                    {childBalance > 0.01 && childPaid > 0.01 && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">יתרה:</span>
                        <span className="font-bold text-amber-600">
                          {fmt(childBalance)}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין שיוכים בשנה זו.</p>
                ) : (
                  <>
                    <div>
                      <table className="w-full text-sm table-fixed">
                        <colgroup>
                          <col />
                          <col className="w-[70px]" />
                          <col className="w-[90px]" />
                          <col className="w-[90px]" />
                        </colgroup>
                        <thead className="text-xs text-muted-foreground">
                          <tr className="border-b border-border">
                            <th className="text-right py-2 pe-3">שיוך</th>
                            <th className="text-right py-2 pe-3">שיעורים</th>
                            <th className="text-right py-2 pe-3">הנחה</th>
                            <th className="text-right py-2">נטו</th>
                          </tr>

                        </thead>
                        <tbody>
                          {rows.map((r) => (
                            <tr
                              key={r.enrollmentId}
                              className={`border-b border-border/50 ${!r.isActive ? "opacity-50" : ""}`}
                            >
                              <td className="py-2 pe-3 break-words">

                                <div className="font-medium text-foreground">
                                  {r.instrumentName}
                                  {r.schoolName !== "—" && (
                                    <span className="text-muted-foreground font-normal"> — {r.schoolName}</span>
                                  )}
                                  {!r.isActive && (
                                    <Badge variant="secondary" className="text-[10px] ms-2">
                                      לא פעיל
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {r.teacherName}
                                  {r.duration ? ` · ${r.duration} דק׳` : ""}
                                </div>
                              </td>
                              <td className="py-2 pe-3 whitespace-nowrap">
                                {r.lessonsRemaining}/{r.lessonsTotal}
                              </td>
                              <td className="py-2 pe-3">
                                {r.discountPct > 0 ? (
                                  <div className="flex flex-col gap-1 items-start">
                                    <Badge variant="secondary" className="text-[10px]">
                                      {r.discountPct}%
                                    </Badge>
                                    {r.discountLabels.length > 0 && (
                                      <span className="text-[11px] text-muted-foreground leading-tight">
                                        {r.discountLabels.join(" · ")}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                              <td className="py-2 font-medium">{fmt(r.net)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(t?.customDiscountAmount ?? 0) > 0 && (
                      <p className="text-xs text-muted-foreground mt-2">
                        כולל הנחה מותאמת בסך {fmt(t!.customDiscountAmount)}
                      </p>
                    )}
                  </>
                )}

                {childSpecials.length > 0 && (
                  <div className="mt-3">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col />
                        <col className="w-[70px]" />
                        <col className="w-[90px]" />
                        <col className="w-[90px]" />
                      </colgroup>
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b border-border">
                          <th className="text-right py-2 pe-3">קורסים מיוחדים</th>
                          <th className="text-right py-2 pe-3"></th>
                          <th className="text-right py-2 pe-3"></th>
                          <th className="text-right py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {childSpecials.map((s) => (
                          <tr key={s.key} className="border-b border-border/50">
                            <td className="py-2 pe-3 break-words">
                              <div className="font-medium text-foreground">{s.label}</div>
                            </td>
                            <td className="py-2 pe-3">—</td>
                            <td className="py-2 pe-3 text-muted-foreground">—</td>
                            <td className="py-2 font-medium">{fmt(s.price)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}


          {/* Family financial summary */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-semibold text-foreground text-base flex items-center gap-2 mb-3">
              <Wallet className="h-4 w-4" /> סיכום כספי משפחתי
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">סה"כ צפוי</div>
                <div className="text-lg font-bold text-foreground">{fmt(totalExpected)}</div>
              </div>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3">
                <div className="text-xs text-emerald-700 dark:text-emerald-300">שולם</div>
                <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                  {fmt(totalPaid)}
                </div>
              </div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3">
                <div className="text-xs text-amber-700 dark:text-amber-300">זיכויים</div>
                <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
                  {fmt(totalCredit)}
                </div>
              </div>
              <div
                className={`rounded-xl p-3 ${balance > 0 ? "bg-rose-50 dark:bg-rose-950/30" : "bg-sky-50 dark:bg-sky-950/30"}`}
              >
                <div
                  className={`text-xs ${balance > 0 ? "text-rose-700 dark:text-rose-300" : "text-sky-700 dark:text-sky-300"}`}
                >
                  יתרה לגבייה
                </div>
                <div
                  className={`text-lg font-bold ${balance > 0 ? "text-rose-700 dark:text-rose-300" : "text-sky-700 dark:text-sky-300"}`}
                >
                  {fmt(balance)}
                </div>
              </div>
            </div>
          </div>

          {/* Unified receipt action */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
            <h2 className="font-semibold text-foreground text-base flex items-center gap-2">
              <Wallet className="h-4 w-4" /> תשלום / קישור / זיכוי משפחתי
            </h2>
            <p className="text-sm text-muted-foreground">
              פתח את חלון התשלום כדי לבחור על אילו שיוכים לחייב ולבחור את סוג הפעולה
              (מזומן, צ׳ק, העברה, אשראי, קישור לתשלום, או פיצול בין הורים).
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                onClick={() => setSendMessageOpen(true)}
                variant="outline"
                disabled={!hasPendingLinks}
                className="h-11 rounded-xl gap-2"
                title={hasPendingLinks ? undefined : "יש ליצור קישור לתשלום לפני שליחת הודעה"}
              >
                <Send className="h-4 w-4" /> שלח הודעה להורה
              </Button>
              <Button
                onClick={openNewPayment}
                className="h-11 rounded-xl gap-2"
              >
                <Plus className="h-4 w-4" /> פתח חלון תשלום משפחתי
              </Button>
            </div>

            {!family?.parent_email && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                שים לב — לא מוגדר אימייל להורה; יש למלא את פרטי המשלם ידנית בחלון.
              </p>
            )}
          </div>




          {/* Payments history */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="font-semibold text-foreground text-base flex items-center gap-2">
                <Receipt className="h-4 w-4" /> תשלומי משפחה ({payments.length})
              </h2>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={paymentSortBy} onValueChange={(v) => setPaymentSortBy(v as any)}>
                  <SelectTrigger className="h-10 w-auto min-w-[160px] rounded-xl gap-2" dir="rtl">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="payment_date">תאריך תשלום</SelectItem>
                    <SelectItem value="paid_at">תאריך ושעה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין תשלומים בשנה זו.</p>
            ) : (
              <div className="space-y-2">
                {(() => {
                  // Group split payments (cheque splits / installments) sharing a payment_group_id
                  const groups = new Map<string, any[]>();
                  for (const p of payments as any[]) {
                    const k = p.payment_group_id ? `g:${p.payment_group_id}` : `p:${p.id}`;
                    const arr = groups.get(k);
                    if (arr) arr.push(p); else groups.set(k, [p]);
                  }
                  const entries = [...groups.entries()].map(([key, rows]) => {
                    const sorted = [...rows].sort((a: any, b: any) =>
                      new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime());
                    return { key, head: sorted[0], rows: sorted };
                  });
                  entries.sort((a, b) => {
                    if (paymentSortBy === "paid_at") {
                      return (
                        new Date(b.head.paid_at || b.head.created_at || b.head.payment_date).getTime() -
                        new Date(a.head.paid_at || a.head.created_at || a.head.payment_date).getTime()
                      );
                    }
                    return (
                      new Date(b.head.created_at || b.head.payment_date).getTime() -
                      new Date(a.head.created_at || a.head.payment_date).getTime()
                    );
                  });
                  return entries;
                })().map(({ key: groupKey, head: p, rows }) => {
                  const isGroup = rows.length > 1;
                  const groupTotal = rows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
                  const isExpanded = !!expandedGroups[groupKey];
                  const lastRow = rows[rows.length - 1];
                  const isCredit = p.transaction_type === "credit";
                  const isPending = p.payment_status === "pending";
                  const hasInvoice = !!p.invoice_url;
                  const hasDoc = !!p.icount_doc_id;
                  const refundedSoFar = payments
                    .filter((x: any) => rows.some((r: any) => r.id === x.refund_of_payment_id))
                    .reduce((s: number, x: any) => s + Math.abs(Number(x.amount || 0)), 0);
                  const remaining = Math.max(0, groupTotal - refundedSoFar);
                  // Refunds are performed only from the family payment dialog.


                  const isCombined =
                    Array.isArray(p.enrollment_breakdown) && p.enrollment_breakdown.length > 1;

                  let statusLabel = "";
                  let statusClass = "";
                  if (isCredit) {
                    statusLabel = "זיכוי";
                    statusClass = "bg-destructive/10 text-destructive border-destructive/30";
                  } else if (p.payment_status === "failed") {
                    statusLabel = "נכשל";
                    statusClass = "bg-destructive/10 text-destructive border-destructive/30";
                  } else if (p.payment_status === "pending") {
                    statusLabel = "ממתין לתשלום";
                    statusClass = "bg-amber-500/10 text-amber-700 border-amber-500/30";
                  } else if (refundedSoFar >= groupTotal - 0.005 && refundedSoFar > 0) {
                    statusLabel = "זוכה במלואו";
                    statusClass = "bg-muted text-muted-foreground border-border";
                  } else if (refundedSoFar > 0) {
                    statusLabel = "זוכה חלקית";
                    statusClass = "bg-amber-500/10 text-amber-700 border-amber-500/30";
                  } else {
                    statusLabel = "שולם";
                    statusClass = "bg-green-500/10 text-green-700 border-green-500/30";
                  }

                  return (
                    <div key={groupKey} className="rounded-xl border border-border">
                    <div
                      onClick={() => {
                        if (isGroup) {
                          setExpandedGroups((s) => ({ ...s, [groupKey]: !s[groupKey] }));
                          return;
                        }
                        setEditingPayment(p);
                        setFamilyCtx(null);
                        setPaymentDialogOpen(true);
                      }}
                      className="flex items-start justify-between rounded-xl p-3 gap-2 cursor-pointer hover:bg-muted/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-foreground text-sm">
                            {isGroup
                              ? `${format(new Date(p.payment_date), "dd/MM/yyyy")} – ${format(new Date(lastRow.payment_date), "dd/MM/yyyy")}`
                              : paymentSortBy === "paid_at" && p.paid_at
                                ? `${format(new Date(p.paid_at), "dd/MM/yyyy · HH:mm")}`
                                : format(new Date(p.payment_date), "dd/MM/yyyy")}
                            {p.academic_years?.name && (
                              <span className="text-muted-foreground font-normal"> · {p.academic_years.name}</span>
                            )}
                          </p>
                          <span className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${statusClass}`}>
                            {statusLabel}
                          </span>
                          {isGroup && (
                            <span className="text-[11px] px-2 py-0.5 rounded-md border border-border bg-muted text-muted-foreground font-medium">
                              פריסה · {rows.length} תשלומים
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isCredit ? "זיכוי" : "תשלום"}
                          {p.payment_method && ` · ${formatPaymentMethodWithCount(p.payment_method, p.installments)}`}
                          {!isGroup && p.reference_number && ` · ${isCheckMethod(p.payment_method) ? "צ׳ק מס׳" : "אסמכתא"} ${p.reference_number}`}
                          {p.icount_doc_number && ` · קבלה ${p.icount_doc_number}`}
                          {p.month_reference && ` · ${p.month_reference}`}
                          {p.family_payment_group_id
                            ? " · משפחתי"
                            : (p.student_id && ` · ${nameById.get(p.student_id)}`) || ""}
                        </p>
                        {(() => {
                          const bd: any = p.enrollment_breakdown ?? {};
                          const pd = bd && !Array.isArray(bd) ? bd.payerDetails : null;
                          const pl = bd && !Array.isArray(bd) ? bd.payerLabel : null;
                          const fullName = pd ? [pd.firstName, pd.lastName].filter(Boolean).join(" ").trim() : "";
                          const contact = pd ? [pd.phone, pd.email].filter(Boolean).join(" · ") : "";
                          const showLink = isPending && !!p.payment_link_url;
                          if (!pl && !fullName && !contact && !showLink) return null;
                          return (
                            <div className="mt-1 space-y-0.5 text-[11px] font-normal">
                              {(pl || fullName) && (
                                <div className="text-foreground">
                                  <span className="text-muted-foreground">{isPending ? "משלם: " : "שולם ע״י: "}</span>
                                  {pl}
                                  {pl && fullName ? " · " : ""}
                                  {fullName && <span className="font-medium">{fullName}</span>}
                                </div>
                              )}
                              {contact && <div className="text-muted-foreground">{contact}</div>}
                              {showLink && (
                                <div className="text-muted-foreground truncate max-w-[220px]" dir="ltr">{p.payment_link_url}</div>
                              )}
                            </div>
                          );
                        })()}
                        {p.notes && <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                        {isGroup && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                            title={isExpanded ? "הסתר פירוט" : "הצג פירוט"}
                            onClick={() => setExpandedGroups((s) => ({ ...s, [groupKey]: !s[groupKey] }))}>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                        )}
                        {!isCredit && hasInvoice && (
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="הורד קבלה"
                            onClick={() => window.open(p.invoice_url, "_blank")}>
                            <FileDown className="h-4 w-4" />
                          </Button>
                        )}
                        {(() => {
                          const iv: any = createInvoiceMutation.variables;
                          const invoicingThis = createInvoiceMutation.isPending &&
                            (iv?.paymentId === p.id || (!!p.payment_group_id && iv?.groupId === p.payment_group_id));
                          return (
                            <>
                        {!hasDoc && !isPending && !isCredit && (
                          <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs"
                            disabled={createInvoiceMutation.isPending}
                            onClick={() => {
                              setInvoiceNote("");
                              setPendingInvoiceParams(
                                p.payment_group_id ? { groupId: p.payment_group_id } : { paymentId: p.id },
                              );
                            }}>

                            {invoicingThis
                              ? <><Loader2 className="h-3.5 w-3.5 ms-1 animate-spin" />מפיק קבלה...</>
                              : <><FileDown className="h-3.5 w-3.5 ms-1" />{isCombined ? "קבלה מאוחדת" : "הפק קבלה"}</>}
                          </Button>
                        )}
                        {isCredit && hasInvoice && (
                          <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="הורד קבלת זיכוי"
                            onClick={() => window.open(p.invoice_url, "_blank")}>
                            <FileDown className="h-4 w-4" />
                          </Button>
                        )}
                        {isCredit && !hasDoc && (
                          <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs"
                            disabled={createInvoiceMutation.isPending}
                            onClick={() => { setInvoiceNote(""); setPendingInvoiceParams({ paymentId: p.id, isCredit: true }); }}>
                            {invoicingThis
                              ? <><Loader2 className="h-3.5 w-3.5 ms-1 animate-spin" />מפיק...</>
                              : <><FileDown className="h-3.5 w-3.5 ms-1" />קבלת זיכוי</>}
                          </Button>
                        )}
                            </>
                          );
                        })()}
                        {isPending && p.payment_link_url && (
                          <>
                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="פתח קישור"
                              onClick={() => window.open(p.payment_link_url!, "_blank")}>
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="העתק קישור"
                              onClick={async () => {
                                try { await navigator.clipboard.writeText(await shortenUrl(p.payment_link_url!)); toast.success("הקישור הועתק"); }
                                catch { toast.error("לא ניתן להעתיק"); }
                              }}>
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button variant="outline" size="icon"
                              className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                              title={deleteLinkMutation.isPending ? "מוחק, אנא המתן..." : "בטל קישור ומחק שורה"}
                              disabled={deleteLinkMutation.isPending}
                              onClick={() => {
                                if (confirm("לבטל את קישור התשלום? דף הסליקה יימחק מ-iCount.")) {
                                  deleteLinkMutation.mutate(p.id);
                                }
                              }}>
                              {deleteLinkMutation.isPending && deleteLinkMutation.variables === p.id
                                ? <Loader2 className="h-4 w-4 animate-spin" />
                                : <Trash2 className="h-4 w-4" />}
                            </Button>
                          </>
                        )}

                        <span className={`font-semibold text-sm whitespace-nowrap ${isCredit ? "text-destructive" : "text-primary"}`} dir="ltr">
                          {isCredit ? `−${fmt(Math.abs(groupTotal))}` : fmt(Math.abs(groupTotal))}
                        </span>
                      </div>
                    </div>

                    {isGroup && isExpanded && (() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const selectedIds = rows
                        .filter((r: any) => selectedCheques[r.id])
                        .map((r: any) => r.id);
                      const selectedSum = rows
                        .filter((r: any) => selectedCheques[r.id])
                        .reduce((s: number, r: any) => s + Math.abs(Number(r.amount || 0)), 0);
                      return (
                      <div className="border-t border-border px-3 py-2 space-y-1">
                        {rows.map((r: any, idx: number) => {
                          const rRefunded = payments
                            .filter((x: any) => x.refund_of_payment_id === r.id)
                            .reduce((s: number, x: any) => s + Math.abs(Number(x.amount || 0)), 0);
                          const rRemaining = Math.max(0, Number(r.amount || 0) - rRefunded);
                          const rIsCheck = isCheckMethod(r.payment_method);
                          const cStatus: string = r.cheque_status ?? "pending";
                          const isCancelled = cStatus === "cancelled";
                          const isCleared = cStatus === "cleared";
                          const isDue = !isCleared && !isCancelled && String(r.payment_date) <= today;
                          const canSelect = rIsCheck && !isCredit && hasDoc && !isCancelled && !isCleared;
                          return (
                            <div
                              key={r.id}
                              onClick={() => { setEditingPayment(r); setFamilyCtx(null); setPaymentDialogOpen(true); }}
                              className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs cursor-pointer hover:bg-muted/50 ${isCancelled ? "opacity-60" : ""}`}
                            >
                              <div className="min-w-0 flex-1 flex items-start gap-2">
                                {canSelect && (
                                  <span onClick={(e) => e.stopPropagation()} className="pt-0.5">
                                    <Checkbox
                                      checked={!!selectedCheques[r.id]}
                                      onCheckedChange={(v) =>
                                        setSelectedCheques((s) => ({ ...s, [r.id]: !!v }))
                                      }
                                    />
                                  </span>
                                )}
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-muted-foreground">{idx + 1}.</span>
                                    <span className={`font-medium text-foreground ${isCancelled ? "line-through" : ""}`}>
                                      {format(new Date(r.payment_date), "dd/MM/yyyy")}
                                    </span>
                                    {r.reference_number && <span className="text-muted-foreground">{rIsCheck ? "צ׳ק מס׳" : "אסמכתא"} {r.reference_number}</span>}
                                    {rIsCheck && (
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md border font-medium ${
                                        isCancelled
                                          ? "bg-destructive/10 text-destructive border-destructive/30"
                                          : isCleared
                                            ? "bg-green-500/10 text-green-700 border-green-500/30"
                                            : isDue
                                              ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
                                              : "bg-muted text-muted-foreground border-border"
                                      }`}>
                                        {isCancelled ? "בוטל" : isCleared ? "נפרע" : isDue ? "אמור להיפרע" : "עתידי"}
                                      </span>
                                    )}
                                    {!isGroup && rRefunded > 0 && <span className="text-amber-700">זוכה {fmt(rRefunded)}</span>}
                                  </div>
                                  {r.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{r.notes}</p>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                                {rIsCheck && !isCancelled && (
                                  <Button variant="ghost" size="icon"
                                    className={`h-7 w-7 rounded-lg ${isCleared ? "text-green-700 hover:bg-green-500/10" : "text-muted-foreground hover:bg-muted"}`}
                                    title={isCleared ? "בטל סימון פירעון" : "סמן כנפרע"}
                                    disabled={chequeStatusMutation.isPending}
                                    onClick={() => chequeStatusMutation.mutate({
                                      id: r.id,
                                      status: isCleared ? "pending" : "cleared",
                                    })}>
                                    {chequeStatusMutation.isPending && (chequeStatusMutation.variables as any)?.id === r.id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <CheckCircle2 className="h-3.5 w-3.5" />}
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive hover:bg-destructive/10"
                                  title={rIsCheck ? "מחק שורת צ׳ק (ללא מסמך חשבונאי)" : "מחק שורה זו"}
                                  disabled={deleteRowMutation.isPending}
                                  onClick={() => {
                                    if (confirm(rIsCheck
                                      ? `למחוק את שורת הצ׳ק ${r.reference_number ?? ""} על סך ${fmt(Number(r.amount || 0))}? לא ייווצר מסמך זיכוי. לביטול חשבונאי תקין יש לסמן את הצ׳ק ולהשתמש ב"בטל צ׳קים שנבחרו".`
                                      : `לבטל שורה זו על סך ${fmt(Number(r.amount || 0))}?`)) {
                                      deleteRowMutation.mutate(r.id);
                                    }
                                  }}>
                                  {deleteRowMutation.isPending && deleteRowMutation.variables === r.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Trash2 className="h-3.5 w-3.5" />}
                                </Button>

                                <span className="font-semibold text-foreground whitespace-nowrap" dir="ltr">
                                  {fmt(Math.abs(Number(r.amount || 0)))}
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        {(() => {
                          const cleared = rows.filter((r: any) => r.cheque_status === "cleared");
                          const cancelled = rows.filter((r: any) => r.cheque_status === "cancelled");
                          const open = rows.filter((r: any) => (r.cheque_status ?? "pending") === "pending");
                          const sum = (a: any[]) => a.reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
                          return (
                            <div className="pt-2 mt-1 border-t border-border flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                              <span>סה״כ עסקה <b className="text-foreground">{fmt(groupTotal)}</b></span>
                              <span>נפרע <b className="text-green-700">{fmt(sum(cleared))}</b> ({cleared.length})</span>
                              <span>טרם נפרע <b className="text-foreground">{fmt(sum(open))}</b> ({open.length})</span>
                              {cancelled.length > 0 && (
                                <span>בוטל <b className="text-destructive">{fmt(sum(cancelled))}</b> ({cancelled.length})</span>
                              )}
                              {refundedSoFar > 0 && (
                                <span>זוכה בעסקה <b className="text-amber-700">{fmt(refundedSoFar)}</b> · נותר לזיכוי <b className="text-foreground">{fmt(remaining)}</b></span>
                              )}
                            </div>
                          );
                        })()}

                        {selectedIds.length > 0 && (
                          <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg bg-muted/60 p-2">
                            <span className="text-[11px] text-muted-foreground flex-1">
                              נבחרו {selectedIds.length} צ׳קים · {fmt(selectedSum)} — ייפתח תהליך משיכה מהבנק עם מכתב להנהלת החשבונות
                            </span>
                            <div className="flex gap-2">
                              <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs"
                                onClick={() => setSelectedCheques({})}>
                                נקה בחירה
                              </Button>
                              <Button size="sm" className="h-8 rounded-lg text-xs"
                                disabled={cancelChequesMutation.isPending}
                                onClick={() => cancelChequesMutation.mutate(selectedIds)}>
                                {cancelChequesMutation.isPending
                                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin ms-1" />יוצר בקשה...</>
                                  : <><Ban className="h-3.5 w-3.5 ms-1" />בקשת משיכת צ׳קים</>}

                              </Button>
                            </div>
                          </div>
                        )}

                        {(() => {
                          const chequeRows = rows.filter((r: any) => r.payment_method === "check");
                          if (chequeRows.length === 0) return null;
                          const sum = (a: any[]) => a.reduce((s, r) => s + Math.abs(Number(r.amount || 0)), 0);
                          const clearedSum = sum(chequeRows.filter((r: any) => r.cheque_status === "cleared"));
                          const cancelledSum = sum(chequeRows.filter((r: any) => r.cheque_status === "cancelled"));
                          if (cancelledSum <= 0) return null;
                          const owedRaw = owedByGroup[groupKey];
                          const owed = owedRaw === undefined || owedRaw === "" ? clearedSum : Number(owedRaw);
                          const dueBack = Math.max(0, clearedSum - (Number.isFinite(owed) ? owed : clearedSum));
                          return (
                            <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
                              <p className="text-xs font-semibold text-foreground">
                                חישוב סופי לאחר ביטול הצ׳קים
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                נפרע בפועל <b className="text-green-700">{fmt(clearedSum)}</b> · בוטל <b className="text-destructive">{fmt(cancelledSum)}</b>
                              </p>
                              <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                                <div className="flex-1 space-y-1">
                                  <label className="text-[11px] text-muted-foreground">סכום שההורה חייב בפועל (לאחר הפסקת הלימודים)</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={owedRaw ?? String(clearedSum)}
                                    onChange={(e) => setOwedByGroup((s) => ({ ...s, [groupKey]: e.target.value }))}
                                    className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm"
                                  />
                                </div>
                                <div className="text-xs">
                                  <span className="text-muted-foreground">להחזר בהעברה בנקאית: </span>
                                  <b className="text-foreground">{fmt(dueBack)}</b>
                                </div>
                              </div>
                              <Button
                                size="sm"
                                className="h-9 rounded-xl text-xs w-full sm:w-auto"
                                disabled={dueBack <= 0}
                                onClick={() => {
                                  setBankRefund({
                                    studentId: p.student_id ?? family?.children_ids?.[0],
                                    parentName: family?.parent_name ?? undefined,
                                    studentName: nameById[p.student_id] ?? undefined,
                                    paymentId: p.id,
                                    docNumber: p.icount_doc_number,
                                    paidAmount: clearedSum,
                                    refundAmount: dueBack,
                                  });
                                }}
                              >
                                המשך למכתב החזר בהעברה בנקאית
                              </Button>
                            </div>
                          );
                        })()}
                      </div>

                      );
                    })()}

                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <AddPaymentDialog
            open={paymentDialogOpen}
            onOpenChange={(o) => {
              setPaymentDialogOpen(o);
              if (!o) { setEditingPayment(null); setFamilyCtx(null); }
            }}
            studentId={editingPayment?.student_id ?? family?.children_ids?.[0] ?? ""}
            enrollments={mergedEnrollments}
            editPayment={editingPayment}
            familyContext={editingPayment ? null : familyCtx}
            refundSources={refundSources}
            onOpenChequeCancel={() => setScheduleOpen(true)}
          />

          <SendFamilyAssignmentMessage
            open={sendMessageOpen}
            onOpenChange={setSendMessageOpen}
            family={{
              parent_name: family?.parent_name ?? null,
              parent_phone: family?.parent_phone ?? null,
              parent_email: family?.parent_email ?? null,
              partner_name: family?.partner_name ?? null,
              partner_phone: family?.partner_phone ?? null,
              partner_email: family?.partner_email ?? null,
            }}
            children={children}
            enrollments={enrollments as any[]}
            pendingPayments={pendingPayments.filter((p) => !!p.payment_link_url) as any[]}
          />

          <AlertDialog
            open={!!pendingInvoiceParams}
            onOpenChange={(o) => { if (!o) { setPendingInvoiceParams(null); setInvoiceNote(""); } }}
          >
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {pendingInvoiceParams?.isCredit ? "אישור הפקת קבלת זיכוי" : "אישור הפקת קבלה"}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  ⚠️ הפקת מסמך ב-iCount היא פעולה <strong>סופית ובלתי הפיכה</strong>. המסמך יישלח באופן מיידי. האם להמשיך?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label className="text-sm">הערה לקבלה (אופציונלי)</Label>
                <Textarea
                  value={invoiceNote}
                  onChange={(e) => setInvoiceNote(e.target.value)}
                  placeholder="הערה שתופיע על גבי הקבלה"
                  rows={3}
                  maxLength={500}
                  className="rounded-xl"
                />
              </div>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogAction
                  onClick={() => {
                    if (pendingInvoiceParams) {
                      const { isCredit, ...params } = pendingInvoiceParams;
                      createInvoiceMutation.mutate({ ...params, note: invoiceNote.trim() || undefined });
                    }
                    setPendingInvoiceParams(null);
                    setInvoiceNote("");
                  }}
                >
                  כן, הפק
                </AlertDialogAction>
                <AlertDialogCancel>ביטול</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>



          {refundTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={() => { if (!refundMutation.isPending) setRefundTarget(null); }}
            >
              <div className="bg-card rounded-2xl border border-border p-5 max-w-md w-full space-y-3"
                onClick={(e) => e.stopPropagation()}>
                <h3 className="font-semibold">
                  זיכוי · קבלה {refundTarget.icount_doc_number ?? ""}
                </h3>
                {refundMutation.isPending ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm font-medium text-foreground">
                      {refundMethod === "credit_card" ? "מבצע החזר לכרטיס אשראי..." : "מתבצע זיכוי, אנא המתן..."}
                    </p>
                    <p className="text-xs text-muted-foreground text-center">
                      הפעולה עשויה לקחת מספר שניות — אין לסגור את החלון
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      סכום מקורי: {fmt(Number(refundTarget._originalTotal ?? refundTarget.amount ?? 0))} · נותר לזיכוי: {fmt(refundTarget._remaining)}
                    </p>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">סכום לזיכוי</label>
                      <input
                        type="number"
                        step="0.01"
                        value={refundAmount}
                        onChange={(e) => setRefundAmount(e.target.value)}
                        className="w-full h-11 rounded-xl border border-border bg-background px-3"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground">אופן הזיכוי</label>
                      {([
                        {
                          key: "bank_transfer" as const,
                          title: "החזר בהעברה בנקאית",
                          desc: "מכתב להנהלת החשבונות → ביצוע ההעברה → הזנת אסמכתא והפקת קבלת זיכוי",
                        },
                        {
                          key: "credit_card" as const,
                          title: "זיכוי לכרטיס האשראי",
                          desc: refundTarget._cc
                            ? "מקרים חריגים בלבד: זיכוי ישיר דרך iCount לכרטיס שבו שולם"
                            : "מקרים חריגים בלבד — התשלום המקורי לא בוצע באשראי, ולכן זיכוי לכרטיס לא אפשרי",
                        },
                        {
                          key: "receipt" as const,
                          title: "קבלת זיכוי בלבד",
                          desc: "מפיק קבלה במינוס ב-iCount ללא העברה בנקאית (לרישום חשבונאי)",
                        },
                      ]).map((opt) => (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setRefundMethod(opt.key)}
                          className={`w-full text-right rounded-xl border p-3 transition ${
                            refundMethod === opt.key
                              ? "border-primary bg-primary/5"
                              : "border-border hover:bg-muted/50"
                          }`}
                        >
                          <p className="text-sm font-medium text-foreground">{opt.title}</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">{opt.desc}</p>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div className="flex flex-wrap gap-2 justify-end pt-2">
                  <Button variant="outline" disabled={refundMutation.isPending} onClick={() => setRefundTarget(null)}>ביטול</Button>
                  <Button
                    disabled={refundMutation.isPending}
                    onClick={() => {
                      const amt = parseFloat(refundAmount);
                      if (!Number.isFinite(amt) || amt <= 0) return toast.error("סכום לא תקין");
                      if (amt > refundTarget._remaining + 0.005) return toast.error("סכום גבוה מהנותר");
                      if (refundMethod === "bank_transfer") {
                        setBankRefund({
                          studentId: refundTarget.student_id ?? family?.children_ids?.[0],
                          parentName: family?.parent_name ?? undefined,
                          studentName: nameById[refundTarget.student_id] ?? undefined,
                          paymentId: refundTarget.id,
                          docNumber: refundTarget.icount_doc_number,
                          paidAmount: Number(refundTarget._originalTotal ?? refundTarget.amount ?? 0),
                          refundAmount: amt,
                        });
                        setRefundTarget(null);
                        setRefundAmount("");
                        return;
                      }
                      if (refundMethod === "credit_card" && !refundTarget._cc
                        && !confirm("התשלום המקורי לא סומן כאשראי. לנסות בכל זאת לבצע זיכוי לכרטיס?")) return;
                      refundMutation.mutate({
                        paymentId: refundTarget.id,
                        amount: amt,
                        isCc: refundMethod === "credit_card",
                      });
                    }}
                  >
                    {refundMutation.isPending
                      ? <><Loader2 className="h-4 w-4 animate-spin ml-2" />מבצע זיכוי...</>
                      : refundMethod === "bank_transfer"
                        ? "המשך למכתב להנהלת החשבונות"
                        : refundMethod === "credit_card"
                          ? "בצע זיכוי לאשראי"
                          : "הפק קבלת זיכוי"}
                  </Button>
                </div>

              </div>
            </div>
          )}

          {refundDocs.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
              <h2 className="font-semibold text-foreground text-base flex items-center gap-2">
                <FileDown className="h-4 w-4" /> מסמכי החזר ({refundDocs.length})
              </h2>
              <div className="space-y-2">
                {refundDocs.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{d.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(d.created_at), "dd/MM/yyyy")}
                        {nameById[d.student_id] && ` · ${nameById[d.student_id]}`}
                        {d.refund_amount ? ` · ${fmt(Number(d.refund_amount))}` : ""}
                        {d.bank_reference ? ` · אסמכתא ${d.bank_reference}` : ""}
                      </p>
                    </div>
                    <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs shrink-0"
                      onClick={() => openRefundDoc(d.file_path, d.id)}>
                      <FileDown className="h-3.5 w-3.5" /> פתח
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4">
        <ChequeCancellationTracking
          parentNationalId={parentNationalId}
          studentIds={family?.children_ids ?? []}
          invalidate={invalidateFamily}
          onRequestTransfer={({ amount, parentName, chequesTotal, creditDue, chequesCount }) => {
            const src = payments.find((p: any) => p.payment_method === "check" && p.icount_doc_id) ?? payments[0];
            const creditsGiven = Math.abs(totalCredit);
            // Money actually left in our hands after pulling the cancelled cheques
            const netReceived = Math.round((totalPaid - chequesTotal) * 100) / 100;
            const computed = Math.max(0, Math.round((netReceived - creditsGiven - totalExpected) * 100) / 100);
            const finalAmount = amount || computed;
            setBankRefund({
              studentId: family?.children_ids?.[0],
              parentName: parentName || family?.parent_name || "",
              subject: "החזר יתרה לאחר ביטול צ׳קים",
              paidAmount: Math.round(totalPaid),
              refundAmount: finalAmount,
              paymentId: src?.id,
              docNumber: src?.icount_doc_number ?? null,
              accountSummary: [
                { label: "סה״כ חיוב (עסקה מעודכנת)", value: fmt(totalExpected) },
                { label: "סה״כ נרשם כתשלום (כולל צ׳קים עתידיים)", value: fmt(totalPaid) },
                { label: `בניכוי צ׳קים שבוטלו/נמשכו (${chequesCount})`, value: `-${fmt(chequesTotal)}` },
                { label: "בניכוי זיכויים שכבר בוצעו", value: `-${fmt(creditsGiven)}` },
                { label: "התקבל בפועל נטו", value: fmt(Math.round((netReceived - creditsGiven) * 100) / 100) },
                {
                  label: netReceived - creditsGiven - totalExpected >= 0 ? "יתרה לטובת ההורה" : "יתרה לחובת ההורה",
                  value: fmt(Math.abs(Math.round((netReceived - creditsGiven - totalExpected) * 100) / 100)),
                },
                { label: "להעברה בנקאית", value: fmt(finalAmount), strong: true },
              ],
            });
          }}


        />
      </div>

      <BankTransferRefundDialog
        open={!!bankRefund}
        onOpenChange={(o) => { if (!o) setBankRefund(null); }}
        defaults={bankRefund}
        invalidate={invalidateFamily}
        onDone={(info) => { setBankRefund(null); setRefundSuccess(info); }}
      />

      <RefundSuccessDialog info={refundSuccess} onClose={() => setRefundSuccess(null)} />


      <StopEnrollmentDialog
        open={scheduleOpen}
        onOpenChange={setScheduleOpen}
        studentId={family?.children_ids?.[0] ?? ""}
        payments={payments}
        enrollments={enrollments}
        studentNames={nameById}
        creditDue={Math.max(0, -balance)}
        parentName={family?.parent_name ?? ""}
        parentNationalId={parentNationalId ?? ""}
        academicYearId={yearId}
        invalidate={invalidateFamily}
      />
    </AdminLayout>
  );
};

export default AdminFamilyCard;
