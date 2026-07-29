import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import UnifyParentDetailsDialog from "@/components/admin/UnifyParentDetailsDialog";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  Undo2,
  Trash2,
  Plus,
  Copy,
} from "lucide-react";
import { useFamiliesList, useFamilyDetails } from "@/hooks/useFamilies";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { computeChildTotals, type FamilyDraftRow } from "@/lib/familyCalc";
import type { DiscountType } from "@/lib/discounts";
import AddPaymentDialog, { type FamilyPaymentContext, type FamilyPaymentItemOverride } from "@/components/admin/AddPaymentDialog";


const STATUS_LABELS: Record<string, string> = {
  paid: "שולם",
  pending: "ממתין",
  failed: "נכשל",
};

const METHOD_LABELS: Record<string, string> = {
  credit_card: "אשראי",
  cash: "מזומן",
  check: "צ׳ק",
  transfer: "העברה",
  other: "אחר",
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

  const [unifyOpen, setUnifyOpen] = useState(false);
  const [selectedEnrollmentIds, setSelectedEnrollmentIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectionSeeded, setSelectionSeeded] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<any>(null);
  const [familyCtx, setFamilyCtx] = useState<FamilyPaymentContext | null>(null);
  const [refundTarget, setRefundTarget] = useState<any>(null);
  const [refundAmount, setRefundAmount] = useState<string>("");


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

  // Seed default selection: all active enrollments checked once data loads.
  useEffect(() => {
    if (selectionSeeded) return;
    if (children.length === 0 || perChild.size === 0) return;
    const s = new Set<string>();
    for (const c of children) {
      const t = perChild.get(c.id);
      if (!t) continue;
      for (const en of t.enrollments) {
        if (en.isActive && en.net > 0) s.add(en.enrollmentId);
      }
    }
    setSelectedEnrollmentIds(s);
    setSelectionSeeded(true);
  }, [children, perChild, selectionSeeded]);

  const toggleEnrollment = (id: string) => {
    setSelectedEnrollmentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleChildAll = (childId: string, on: boolean) => {
    const t = perChild.get(childId);
    if (!t) return;
    setSelectedEnrollmentIds((prev) => {
      const next = new Set(prev);
      for (const en of t.enrollments) {
        if (!en.isActive) continue;
        if (on) next.add(en.enrollmentId);
        else next.delete(en.enrollmentId);
      }
      return next;
    });
  };

  // Selected total amount
  const selectionSummary = useMemo(() => {
    let amount = 0;
    let count = 0;
    for (const t of perChild.values()) {
      for (const en of t.enrollments) {
        if (selectedEnrollmentIds.has(en.enrollmentId)) {
          amount += en.net;
          count += 1;
        }
      }
    }
    return { amount: Math.round(amount * 100) / 100, count };
  }, [perChild, selectedEnrollmentIds]);

  // Family financial rollup
  const totalExpected = useMemo(
    () => Array.from(perChild.values()).reduce((s, t) => s + t.net, 0),
    [perChild],
  );
  const totalPaid = payments
    .filter((p) => p.transaction_type === "payment" && p.payment_status === "paid")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalCredit = payments
    .filter((p) => p.transaction_type === "credit")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = Math.round((totalExpected - totalPaid + totalCredit) * 100) / 100;

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
          subLabel: `${en.lessonsRemaining}/${en.lessonsTotal} שיעורים${en.discountPct > 0 ? ` · הנחה ${en.discountPct}%` : ""}`,
          defaultAmount: Math.round(en.net * 100) / 100,
          kind: "enrollment",
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
    mutationFn: async (params: { paymentId?: string; groupId?: string }) => {
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

          {/* Per-child breakdown with selection */}
          {children.map((c) => {
            const t = perChild.get(c.id);
            const rows = t?.enrollments ?? [];
            const activeRows = rows.filter((r) => r.isActive);
            const allSelected =
              activeRows.length > 0 &&
              activeRows.every((r) => selectedEnrollmentIds.has(r.enrollmentId));
            const selectedChildSum = rows
              .filter((r) => selectedEnrollmentIds.has(r.enrollmentId))
              .reduce((s, r) => s + r.net, 0);

            return (
              <div
                key={c.id}
                className="rounded-2xl border border-border bg-card p-5 shadow-sm"
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
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">סה"כ לילד:</span>
                    <span className="font-bold text-foreground">
                      {fmt(t?.net ?? 0)}
                    </span>
                  </div>
                </div>

                {rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">אין שיוכים בשנה זו.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto -mx-5 px-5">
                      <table className="w-full text-sm">
                        <thead className="text-xs text-muted-foreground">
                          <tr className="border-b border-border">
                            <th className="text-right py-2 pe-3 w-8">
                              <Checkbox
                                checked={allSelected}
                                onCheckedChange={(v) => toggleChildAll(c.id, !!v)}
                                aria-label="בחר הכל"
                              />
                            </th>
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
                              <td className="py-2 pe-3 align-top">
                                <Checkbox
                                  checked={selectedEnrollmentIds.has(r.enrollmentId)}
                                  onCheckedChange={() => toggleEnrollment(r.enrollmentId)}
                                  disabled={!r.isActive || r.net <= 0}
                                />
                              </td>
                              <td className="py-2 pe-3">
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
                    <div className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
                      <span>
                        נבחרו {rows.filter((r) => selectedEnrollmentIds.has(r.enrollmentId)).length}
                        {" / "}
                        {activeRows.length} שיוכים
                      </span>
                      <span className="font-medium text-foreground">
                        {fmt(selectedChildSum)}
                      </span>
                    </div>
                  </>
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
              סמן את השיוכים שברצונך לכלול, ובחר את סוג הפעולה בחלון הבא (מזומן, צ׳ק,
              העברה, אשראי, קישור לתשלום, או פיצול בין הורים).
            </p>
            <div className="flex items-center justify-between flex-wrap gap-3 rounded-xl bg-muted/40 p-3">
              <div className="text-sm">
                <span className="text-muted-foreground">נבחרו: </span>
                <span className="font-semibold">{selectionSummary.count}</span>
                <span className="text-muted-foreground"> שיוכים · </span>
                <span className="text-muted-foreground">סה"כ: </span>
                <span className="font-bold">{fmt(selectionSummary.amount)}</span>
              </div>
              <Button
                onClick={openNewPayment}
                disabled={selectionSummary.count === 0 || selectionSummary.amount <= 0}
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
            <h2 className="font-semibold text-foreground text-base flex items-center gap-2 mb-3">
              <Receipt className="h-4 w-4" /> תשלומים משותפים ({payments.length})
            </h2>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין תשלומים בשנה זו.</p>
            ) : (
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="text-right py-2 pe-3">תאריך</th>
                      <th className="text-right py-2 pe-3">ילד</th>
                      <th className="text-right py-2 pe-3">סוג</th>
                      <th className="text-right py-2 pe-3">סטטוס</th>
                      <th className="text-right py-2 pe-3">שיטה</th>
                      <th className="text-right py-2 pe-3">סכום</th>
                      <th className="text-right py-2">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const isCredit = p.transaction_type === "credit";
                      const isPending = p.payment_status === "pending";
                      const hasInvoice = !!p.invoice_url;
                      const hasDoc = !!p.icount_doc_id;
                      const refunded = payments
                        .filter((x: any) => x.refund_of_payment_id === p.id)
                        .reduce((s: number, x: any) => s + Math.abs(Number(x.amount || 0)), 0);
                      const remaining = Math.max(0, Number(p.amount || 0) - refunded);
                      const canRefund = !isCredit && hasDoc && remaining > 0;
                      const isCombined =
                        Array.isArray(p.enrollment_breakdown) && p.enrollment_breakdown.length > 1;
                      return (
                        <tr
                          key={p.id}
                          className="border-b border-border/50 hover:bg-muted/40 cursor-pointer"
                          onClick={() => {
                            setEditingPayment(p);
                            setFamilyCtx(null);
                            setPaymentDialogOpen(true);
                          }}
                        >
                          <td className="py-2 pe-3 whitespace-nowrap align-top">
                            <div>{p.payment_date}</div>
                            {isPending && (() => {
                              const bd: any = p.enrollment_breakdown ?? {};
                              const pd = bd && !Array.isArray(bd) ? bd.payerDetails : null;
                              const pl = bd && !Array.isArray(bd) ? bd.payerLabel : null;
                              const fullName = pd ? [pd.firstName, pd.lastName].filter(Boolean).join(" ").trim() : "";
                              const contact = pd ? [pd.phone, pd.email].filter(Boolean).join(" · ") : "";
                              if (!pl && !fullName && !contact && !p.payment_link_url) return null;
                              return (
                                <div className="mt-1 space-y-0.5 text-[11px] font-normal">
                                  {(pl || fullName) && (
                                    <div className="text-foreground">
                                      {pl}
                                      {pl && fullName ? " · " : ""}
                                      {fullName && <span className="font-medium">{fullName}</span>}
                                    </div>
                                  )}
                                  {contact && <div className="text-muted-foreground">{contact}</div>}
                                  {p.payment_link_url && (
                                    <div className="text-muted-foreground truncate max-w-[220px]" dir="ltr">{p.payment_link_url}</div>
                                  )}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="py-2 pe-3">
                            {p.family_payment_group_id ? (
                              <Badge variant="secondary" className="text-[10px]">משפחתי</Badge>
                            ) : (
                              (p.student_id && nameById.get(p.student_id)) || "—"
                            )}
                          </td>
                          <td className="py-2 pe-3">{isCredit ? "זיכוי" : "תשלום"}</td>
                          <td className="py-2 pe-3">
                            <Badge
                              variant={
                                p.payment_status === "paid"
                                  ? "default"
                                  : p.payment_status === "failed"
                                    ? "destructive"
                                    : "secondary"
                              }
                              className="text-[10px]"
                            >
                              {STATUS_LABELS[p.payment_status] || p.payment_status}
                            </Badge>
                          </td>
                          <td className="py-2 pe-3">
                            {(p.payment_method && (METHOD_LABELS[p.payment_method] || p.payment_method)) || "—"}
                          </td>
                          <td className="py-2 pe-3 font-medium">
                            {isCredit ? "−" : ""}
                            {fmt(Number(p.amount))}
                          </td>
                          <td className="py-2" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1 flex-wrap">
                              {hasInvoice && (
                                <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="הורד קבלה"
                                  onClick={() => window.open(p.invoice_url, "_blank")}>
                                  <FileDown className="h-4 w-4" />
                                </Button>
                              )}
                              {!hasDoc && !isPending && !isCredit && (
                                <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs"
                                  disabled={createInvoiceMutation.isPending}
                                  onClick={() =>
                                    createInvoiceMutation.mutate(
                                      p.payment_group_id ? { groupId: p.payment_group_id } : { paymentId: p.id },
                                    )
                                  }>
                                  <FileDown className="h-3.5 w-3.5 ms-1" />
                                  {isCombined ? "קבלה מאוחדת" : "הפק קבלה"}
                                </Button>
                              )}
                              {isPending && p.payment_link_url && (
                                <>
                                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="פתח קישור"
                                    onClick={() => window.open(p.payment_link_url!, "_blank")}>
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="העתק קישור"
                                    onClick={async () => {
                                      try { await navigator.clipboard.writeText(p.payment_link_url!); toast.success("הקישור הועתק"); }
                                      catch { toast.error("לא ניתן להעתיק"); }
                                    }}>
                                    <Copy className="h-4 w-4" />
                                  </Button>
                                  <Button variant="outline" size="icon"
                                    className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                                    title="בטל קישור ומחק שורה"
                                    disabled={deleteLinkMutation.isPending}
                                    onClick={() => {
                                      if (confirm("לבטל את קישור התשלום? דף הסליקה יימחק מ-iCount.")) {
                                        deleteLinkMutation.mutate(p.id);
                                      }
                                    }}>
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {canRefund && (
                                <Button variant="outline" size="icon"
                                  className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                                  title={p.payment_method === "credit_card"
                                    ? `החזר אשראי (נותר ₪${remaining.toLocaleString()})`
                                    : `זיכוי (נותר ₪${remaining.toLocaleString()})`}
                                  onClick={() => {
                                    setRefundTarget({ ...p, _remaining: remaining, _cc: p.payment_method === "credit_card" });
                                    setRefundAmount(String(remaining));
                                  }}>
                                  <Undo2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
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
          />

          {refundTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={() => setRefundTarget(null)}
            >
              <div className="bg-card rounded-2xl border border-border p-5 max-w-md w-full space-y-3"
                onClick={(e) => e.stopPropagation()}>
                <h3 className="font-semibold">
                  {refundTarget._cc ? "החזר אשראי" : "זיכוי"} · קבלה {refundTarget.icount_doc_number ?? ""}
                </h3>
                <p className="text-sm text-muted-foreground">
                  סכום מקורי: {fmt(Number(refundTarget.amount || 0))} · נותר לזיכוי: {fmt(refundTarget._remaining)}
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
                <div className="flex gap-2 justify-end pt-2">
                  <Button variant="outline" onClick={() => setRefundTarget(null)}>ביטול</Button>
                  <Button
                    disabled={refundMutation.isPending}
                    onClick={() => {
                      const amt = parseFloat(refundAmount);
                      if (!Number.isFinite(amt) || amt <= 0) return toast.error("סכום לא תקין");
                      if (amt > refundTarget._remaining + 0.005) return toast.error("סכום גבוה מהנותר");
                      refundMutation.mutate({ paymentId: refundTarget.id, amount: amt, isCc: refundTarget._cc });
                    }}
                  >
                    בצע
                  </Button>
                </div>
              </div>
            </div>
          )}

        </div>
      )}
    </AdminLayout>
  );
};

export default AdminFamilyCard;
