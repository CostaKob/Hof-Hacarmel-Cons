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
  Music,
  Receipt,
  ArrowLeft,
  Loader2,
  Copy,
  Link as LinkIcon,
} from "lucide-react";
import { useFamiliesList, useFamilyDetails } from "@/hooks/useFamilies";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { computeChildTotals, type FamilyDraftRow } from "@/lib/familyCalc";
import type { DiscountType } from "@/lib/discounts";

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
  const [generating, setGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState<{ url: string; amount: number } | null>(
    null,
  );

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

  // ── Generate unified family payment link ──
  const generateFamilyLink = useMutation({
    mutationFn: async () => {
      if (!family || !yearFull || selectionSummary.count === 0) {
        throw new Error("לא נבחרו שיוכים");
      }
      const anchorChildId = family.children_ids[0];
      const yearName = toHebrewYear(yearFull.name);
      const yearSuffix = yearName ? ` ${yearName}` : "";
      const familyGroupId = crypto.randomUUID();

      // Build human-readable lines for iCount — one per selected enrollment.
      const lines: { description: string; amount: number }[] = [];
      for (const c of children) {
        const t = perChild.get(c.id);
        if (!t) continue;
        for (const en of t.enrollments) {
          if (!selectedEnrollmentIds.has(en.enrollmentId)) continue;
          if (en.net <= 0) continue;
          const parts = [
            `${c.first_name} ${c.last_name}`.trim(),
            en.instrumentName,
            en.teacherName !== "—" ? en.teacherName : "",
            en.schoolName !== "—" ? en.schoolName : "",
            `${en.lessonsRemaining}/${en.lessonsTotal} שיעורים`,
          ].filter(Boolean);
          const suffix = en.discountPct > 0 ? ` (כולל הנחה ${en.discountPct}%)` : "";
          lines.push({
            description: `שכר לימוד${yearSuffix} — ${parts.join(" · ")}${suffix}`,
            amount: en.net,
          });
        }
      }

      // Create a family-linked pending payment row on the anchor child.
      const { data: pending, error: insErr } = await supabase
        .from("student_payments")
        .insert({
          student_id: anchorChildId,
          academic_year_id: yearFull.id,
          transaction_type: "payment",
          amount: selectionSummary.amount,
          payment_date: new Date().toISOString().slice(0, 10),
          payment_status: "pending",
          family_payment_group_id: familyGroupId,
          family_parent_national_id: parentNationalId,
          notes: "תשלום משפחתי מאוחד — ממתין לתשלום",
          enrollment_breakdown: { lines, family: true },
        })
        .select("id")
        .single();
      if (insErr || !pending) throw new Error(insErr?.message || "יצירת שורה נכשלה");

      // Ask the iCount edge function to build the paypage. It preserves our
      // family_* fields because it only touches amount / link URL / breakdown.
      const { data, error } = await supabase.functions.invoke(
        "icount-generate-student-paylink",
        {
          body: {
            studentId: anchorChildId,
            paymentId: pending.id,
            amount: selectionSummary.amount,
            academicYearId: yearFull.id,
            academicYearName: yearName || null,
            lines,
            payerDetails: {
              firstName: (family.parent_name ?? "").split(/\s+/)[0] ?? "",
              lastName: (family.parent_name ?? "").split(/\s+/).slice(1).join(" "),
              email: family.parent_email ?? "",
              phone: family.parent_phone ?? "",
            },
            payerLabel: `משפחה - ${family.parent_name ?? ""}`,
          },
        },
      );
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      if (!data?.url) throw new Error("לא התקבל קישור מ-iCount");
      return data as { url: string; amount: number; paymentId: string };
    },
    onSuccess: (data) => {
      setGeneratedLink({ url: data.url, amount: data.amount });
      try {
        navigator.clipboard.writeText(data.url);
      } catch {
        /* clipboard may be unavailable */
      }
      window.open(data.url, "_blank");
      toast.success("קישור תשלום משפחתי נוצר והועתק");
      queryClient.invalidateQueries({ queryKey: ["family-details"] });
    },
    onError: (e: any) => {
      toast.error(`שגיאה ביצירת קישור: ${e?.message ?? e}`);
    },
    onSettled: () => setGenerating(false),
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
                            <th className="text-right py-2 pe-3">כלי</th>
                            <th className="text-right py-2 pe-3">מורה</th>
                            <th className="text-right py-2 pe-3">שלוחה</th>
                            <th className="text-right py-2 pe-3">שיעורים</th>
                            <th className="text-right py-2 pe-3">ברוטו</th>
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
                              <td className="py-2 pe-3">
                                <Checkbox
                                  checked={selectedEnrollmentIds.has(r.enrollmentId)}
                                  onCheckedChange={() => toggleEnrollment(r.enrollmentId)}
                                  disabled={!r.isActive || r.net <= 0}
                                />
                              </td>
                              <td className="py-2 pe-3">
                                {r.instrumentName}
                                {!r.isActive && (
                                  <Badge variant="secondary" className="text-[10px] ms-2">
                                    לא פעיל
                                  </Badge>
                                )}
                              </td>
                              <td className="py-2 pe-3">{r.teacherName}</td>
                              <td className="py-2 pe-3">{r.schoolName}</td>
                              <td className="py-2 pe-3 whitespace-nowrap">
                                {r.lessonsRemaining}/{r.lessonsTotal}
                              </td>
                              <td className="py-2 pe-3">{fmt(r.prorated)}</td>
                              <td className="py-2 pe-3">
                                {r.discountPct > 0 ? (
                                  <Badge variant="secondary" className="text-[10px]">
                                    {r.discountPct}%
                                  </Badge>
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
              <LinkIcon className="h-4 w-4" /> יצירת קישור תשלום מאוחד
            </h2>
            <p className="text-sm text-muted-foreground">
              סמן את השיוכים שברצונך לכלול בקבלה. הקישור יישלח על שם ההורה, ויקושר לכל
              ילדי המשפחה דרך ת.ז. ההורה.
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
                onClick={() => {
                  setGenerating(true);
                  generateFamilyLink.mutate();
                }}
                disabled={
                  generating ||
                  selectionSummary.count === 0 ||
                  selectionSummary.amount <= 0 ||
                  !family?.parent_email
                }
                className="h-11 rounded-xl"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ms-2" />
                    יוצר קישור...
                  </>
                ) : (
                  <>
                    <LinkIcon className="h-4 w-4 ms-2" />
                    צור קישור תשלום מאוחד
                  </>
                )}
              </Button>
            </div>
            {!family?.parent_email && (
              <p className="text-xs text-destructive">
                חסר אימייל הורה — עדכן פרטי הורה לפני יצירת קישור.
              </p>
            )}
            {generatedLink && (
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 p-3 space-y-2">
                <div className="text-sm text-emerald-800 dark:text-emerald-200 font-medium">
                  ✓ הקישור נוצר — {fmt(generatedLink.amount)}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    readOnly
                    value={generatedLink.url}
                    className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-border bg-background text-xs font-mono"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(generatedLink.url);
                      toast.success("הועתק");
                    }}
                  >
                    <Copy className="h-4 w-4 ms-1" /> העתק
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(generatedLink.url, "_blank")}
                  >
                    <ExternalLink className="h-4 w-4 ms-1" /> פתח
                  </Button>
                </div>
              </div>
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
                      <th className="text-right py-2">קבלה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-border/50">
                        <td className="py-2 pe-3 whitespace-nowrap">{p.payment_date}</td>
                        <td className="py-2 pe-3">
                          {p.family_payment_group_id ? (
                            <Badge variant="secondary" className="text-[10px]">
                              משפחתי
                            </Badge>
                          ) : (
                            (p.student_id && nameById.get(p.student_id)) || "—"
                          )}
                        </td>
                        <td className="py-2 pe-3">
                          {p.transaction_type === "credit" ? "זיכוי" : "תשלום"}
                        </td>
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
                          {(p.payment_method &&
                            (METHOD_LABELS[p.payment_method] || p.payment_method)) ||
                            "—"}
                        </td>
                        <td className="py-2 pe-3 font-medium">
                          {p.transaction_type === "credit" ? "−" : ""}
                          {fmt(Number(p.amount))}
                        </td>
                        <td className="py-2">
                          {p.invoice_url ? (
                            <a
                              href={p.invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {p.icount_doc_number || "צפייה"}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminFamilyCard;
