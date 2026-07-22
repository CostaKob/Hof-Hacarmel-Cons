import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";

import { PhoneDisplay } from "@/components/PhoneDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Send, ExternalLink, Copy, X } from "lucide-react";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { calcEnrollment, type CalcRow } from "@/lib/paymentCalc";
import { computeStandardDiscounts, type DiscountType } from "@/lib/discounts";
import { toast } from "sonner";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import StudentPaymentsSection from "@/components/admin/StudentPaymentsSection";
import SendTeacherAssignmentMessage from "@/components/admin/SendTeacherAssignmentMessage";

const HEBREW_YEAR_MAP: Record<string, string> = {
  "2024-2025": "תשפ״ה",
  "2025-2026": "תשפ״ו",
  "2026-2027": "תשפ״ז",
  "2027-2028": "תשפ״ח",
  "2028-2029": "תשפ״ט",
  "2029-2030": "תש״צ",
  "2030-2031": "תשצ״א",
};
const toHebrewYear = (name: string): string => HEBREW_YEAR_MAP[name] ?? name;

type PaymentDiscountSnapshot = {
  selectedDiscountIds: string[];
  customDiscounts: { label: string; value: string; mode: "pct" | "amount" }[];
  startDateOverrides: Record<string, string>;
};

const extractPaymentDiscountSnapshot = (payment: any): PaymentDiscountSnapshot | null => {
  const breakdown = payment?.enrollment_breakdown;
  const discounts = breakdown && !Array.isArray(breakdown) ? breakdown.discounts : null;
  if (!discounts || typeof discounts !== "object") return null;

  const selectedDiscountIds = Array.isArray(discounts.selectedDiscountIds)
    ? discounts.selectedDiscountIds.filter(Boolean)
    : [];
  const customDiscounts = Array.isArray(discounts.customDiscounts)
    ? discounts.customDiscounts.filter((d: any) => d && typeof d === "object")
    : [];
  const startDateOverrides =
    discounts.startDateOverrides && typeof discounts.startDateOverrides === "object"
      ? discounts.startDateOverrides
      : {};

  if (selectedDiscountIds.length === 0 && customDiscounts.length === 0 && Object.keys(startDateOverrides).length === 0) {
    return null;
  }
  return { selectedDiscountIds, customDiscounts, startDateOverrides };
};

const AdminStudentPaymentCalc = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeYear, selectedYearId, years } = useAcademicYear();
  const yearId = selectedYearId ?? activeYear?.id;
  const year = years.find((y) => y.id === yearId);

  const { data: student, isLoading: loadingStudent } = useQuery({
    queryKey: ["calc-student", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", studentId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: enrollments, isLoading: loadingEnrollments } = useQuery({
    queryKey: ["calc-enrollments", studentId, yearId],
    enabled: !!studentId && !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("*, instruments(name), schools(name), teachers(first_name, last_name)")
        .eq("student_id", studentId!)
        .eq("academic_year_id", yearId!);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: settings } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_settings" as any).select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: yearFull } = useQuery({
    queryKey: ["calc-year", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("*").eq("id", yearId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: discountTypes = [] } = useQuery({
    queryKey: ["discount-types", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_types" as any)
        .select("*")
        .eq("academic_year_id", yearId!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) as DiscountType[];
    },
  });

  // ── Sibling detection: load confirmed siblings + their enrollments to detect
  // whether the current student has the lowest annual total (before discounts).
  const { data: siblingsList = [] } = useQuery({
    queryKey: ["calc-siblings", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("get_confirmed_siblings", { _student_id: studentId });
      if (error) throw error;
      return (data ?? []) as { id: string; first_name: string; last_name: string }[];
    },
  });

  const siblingIds = siblingsList.map((s) => s.id);
  const { data: siblingEnrollments = [] } = useQuery({
    queryKey: ["calc-sibling-enrollments", siblingIds.sort().join(","), yearId],
    enabled: siblingIds.length > 0 && !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, lesson_duration_minutes, start_date, end_date, price_per_lesson, is_active")
        .in("student_id", siblingIds)
        .eq("academic_year_id", yearId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: allStudentPayments = [] } = useQuery({
    queryKey: ["calc-payments", studentId, yearId],
    enabled: !!studentId && !!yearId,
    queryFn: async () => {
      const { data: enrs } = await supabase.from("enrollments").select("id").eq("student_id", studentId!);
      const ids = (enrs ?? []).map((e) => e.id);
      const query = supabase
        .from("student_payments")
        .select("*")
        .eq("academic_year_id", yearId!)
        .order("payment_date", { ascending: true })
        .order("created_at", { ascending: true });
      const { data, error } = ids.length > 0
        ? await query.or(`student_id.eq.${studentId},enrollment_id.in.(${ids.join(",")})`)
        : await query.eq("student_id", studentId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Pending payment links across ALL years — a link may have been created while a
  // different year was selected; we still want to surface it here to avoid "ghost" links.
  const { data: allPendingPayments = [] } = useQuery({
    queryKey: ["calc-pending-payments-all-years", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data: enrs } = await supabase.from("enrollments").select("id").eq("student_id", studentId!);
      const ids = (enrs ?? []).map((e) => e.id);
      const query = supabase
        .from("student_payments")
        .select("*, academic_years(start_date, end_date)")
        .eq("payment_status", "pending")
        .order("created_at", { ascending: false });
      const { data, error } = ids.length > 0
        ? await query.or(`student_id.eq.${studentId},enrollment_id.in.(${ids.join(",")})`)
        : await query.eq("student_id", studentId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const paymentsList = useMemo(
    () => (allStudentPayments as any[]).filter((p) => (p.payment_status ?? "paid") !== "pending"),
    [allStudentPayments],
  );
  const pendingPayments = allPendingPayments as any[];

  const paymentDiscountSnapshot = useMemo(() => {
    const candidates = [...pendingPayments, ...(allStudentPayments as any[])]
      .map((payment) => ({
        payment,
        snapshot: extractPaymentDiscountSnapshot(payment),
        ts: new Date(payment?.created_at || payment?.paid_at || payment?.payment_date || 0).getTime(),
      }))
      .filter((x) => x.snapshot)
      .sort((a, b) => b.ts - a.ts);
    return candidates[0]?.snapshot ?? null;
  }, [pendingPayments, allStudentPayments]);

  const paymentsAggr = useMemo(() => {
    let paid = 0, credit = 0, net = 0;
    for (const r of paymentsList as any[]) {
      const amount = Number(r.amount || 0);
      if (amount < 0) {
        credit += Math.abs(amount);
        net += amount;
      } else if (r.transaction_type === "payment") {
        paid += amount;
        net += amount;
      } else {
        credit += amount;
        net -= amount;
      }
    }
    return { net, paid, credit };
  }, [paymentsList]);

  // Server-side draft (source of truth across devices). localStorage kept as
  // a same-browser fallback for the first load if server draft doesn't exist yet.
  const { data: draft } = useQuery({
    queryKey: ["payment-draft", studentId, yearId],
    enabled: !!studentId && !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_payment_drafts" as any)
        .select("*")
        .eq("student_id", studentId!)
        .eq("academic_year_id", yearId!)
        .maybeSingle();
      if (error) throw error;
      return (data as any) ?? null;
    },
  });

  // localStorage key for persisting discount selections per student+year (legacy fallback)
  const lsKey = studentId && yearId ? `payment-calc-discounts:${studentId}:${yearId}` : null;
  const lsInitial = (() => {
    if (!lsKey) return null;
    try { const raw = localStorage.getItem(lsKey); return raw ? JSON.parse(raw) : null; } catch { return null; }
  })();

  // Dynamic discount selection — set of selected discount_type ids
  const [selectedDiscountIds, setSelectedDiscountIds] = useState<string[]>(
    Array.isArray(lsInitial?.selectedDiscountIds) ? lsInitial.selectedDiscountIds : []
  );
  const [customDiscounts, setCustomDiscounts] = useState<{ label: string; value: string; mode: "pct" | "amount" }[]>(
    Array.isArray(lsInitial?.customDiscounts) ? lsInitial.customDiscounts : []
  );

  const [startDateOverrides, setStartDateOverrides] = useState<Record<string, string>>(
    lsInitial?.startDateOverrides && typeof lsInitial.startDateOverrides === "object" ? lsInitial.startDateOverrides : {}
  );
  // Per-discount override selecting which enrollments a "cheapest_enrollment"
  // discount applies to. Empty/undefined array = automatic default (all except
  // the most expensive enrollment).
  const [discountEnrollmentOverrides, setDiscountEnrollmentOverrides] =
    useState<Record<string, string[]>>({});

  const [hydratedFromPending, setHydratedFromPending] = useState<boolean>(!!lsInitial);
  const [hydratedFromDraft, setHydratedFromDraft] = useState<boolean>(false);
  const paymentDiscountSnapshotRef = useRef<PaymentDiscountSnapshot | null>(paymentDiscountSnapshot);
  const customDiscountsTouchedRef = useRef(false);

  useEffect(() => {
    paymentDiscountSnapshotRef.current = paymentDiscountSnapshot;
  }, [paymentDiscountSnapshot]);

  // After discountTypes load, map any legacy keys (sibling/secondInstrument/majorStudent)
  // from localStorage or older payments into discount_type ids.
  const mapLegacy = (raw: any): string[] => {
    if (!raw || typeof raw !== "object") return [];
    const ids = new Set<string>(Array.isArray(raw.selectedDiscountIds) ? raw.selectedDiscountIds : []);
    const legacyMap: Record<string, string> = {
      sibling: "sibling",
      secondInstrument: "second_instrument",
      majorStudent: "major_student",
    };
    for (const k of Object.keys(legacyMap)) {
      if (raw[k] === true) {
        const dt = discountTypes.find((d) => d.legacy_key === legacyMap[k]);
        if (dt) ids.add(dt.id);
      }
    }
    return Array.from(ids);
  };

  // Mutually-exclusive percentage discounts on private lessons — only ONE
  // preset discount type may be active at a time (sibling, major, second
  // instrument, afterschool branch, school-music graduate, etc.). Manual
  // custom discounts are the only ones that stack.
  const exclusiveIdsSet = new Set(discountTypes.map((d) => d.id));


  // ─────────────────────────────────────────────────────────────────────────
  // Hydration priority (single source of truth = server draft):
  //   1. If a server draft row exists → apply it exactly as saved and STOP.
  //      No auto-selects, no snapshot merging. Empty arrays mean the user
  //      explicitly cleared those discounts and that must be honored on
  //      every device.
  //   2. If no draft exists yet → seed from (localStorage fallback →
  //      last payment snapshot → auto-selects), then let the debounced
  //      autosave write it back so every other device sees the same state.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (hydratedFromDraft) return;
    if (draft === undefined) return; // still loading
    if (draft) {
      setSelectedDiscountIds(Array.isArray(draft.selected_discount_ids) ? draft.selected_discount_ids : []);
      setCustomDiscounts(Array.isArray(draft.custom_discounts) ? (draft.custom_discounts as any) : []);
      setStartDateOverrides(
        draft.start_date_overrides && typeof draft.start_date_overrides === "object"
          ? (draft.start_date_overrides as any)
          : {},
      );
      setDiscountEnrollmentOverrides(
        draft.discount_enrollment_overrides && typeof draft.discount_enrollment_overrides === "object"
          ? (draft.discount_enrollment_overrides as any)
          : {},
      );
      setHydratedFromDraft(true);
      setHydratedFromPending(true);
    } else {
      // No draft yet — mark ready so the seeding effects below can run.
      setHydratedFromDraft(true);
    }
  }, [draft, hydratedFromDraft]);

  // Map legacy per-flag localStorage / payment snapshot payloads into
  // discount_type ids once discountTypes are loaded (seeding only).
  useEffect(() => {
    if (draft || !lsInitial || !discountTypes.length) return;
    if (Array.isArray(lsInitial.selectedDiscountIds)) return;
    const mapped = mapLegacy(lsInitial);
    if (mapped.length) setSelectedDiscountIds(mapped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountTypes.length, draft]);

  // Seed from the most recent payment snapshot ONLY when there is no draft
  // yet. Once a draft exists, the draft wins.
  useEffect(() => {
    if (draft) return;
    if (!discountTypes.length || !paymentDiscountSnapshot) return;
    if (hydratedFromPending) return;
    const d = paymentDiscountSnapshot;
    const mapped = mapLegacy(d);
    if (mapped.length) setSelectedDiscountIds(mapped);
    if (d.startDateOverrides && typeof d.startDateOverrides === "object") {
      setStartDateOverrides(d.startDateOverrides);
    }
    if (Array.isArray(d.customDiscounts) && d.customDiscounts.length > 0 && !customDiscountsTouchedRef.current) {
      setCustomDiscounts(d.customDiscounts);
    }
    setHydratedFromPending(true);
  }, [paymentDiscountSnapshot, hydratedFromPending, discountTypes, draft]);

  // Auto-selects only run when seeding a fresh calc (no draft row yet).
  useEffect(() => {
    if (draft) return;
    if (!student?.is_major_student || !discountTypes.length) return;
    const dt = discountTypes.find((d) => d.legacy_key === "major_student");
    if (!dt) return;
    setSelectedDiscountIds((prev) => {
      if (prev.includes(dt.id)) return prev;
      if (prev.some((id) => exclusiveIdsSet.has(id))) return prev;
      return [...prev, dt.id];
    });
  }, [student, discountTypes, draft]);

  useEffect(() => {
    if (draft) return;
    if (!discountTypes.length || !enrollments) return;
    const activeCount = (enrollments as any[]).filter((e) => e.is_active).length;
    if (activeCount < 2) return;
    const dt = discountTypes.find((d) => d.legacy_key === "second_instrument");
    if (!dt) return;
    setSelectedDiscountIds((prev) => {
      if (prev.some((id) => exclusiveIdsSet.has(id))) return prev;
      if (prev.includes(dt.id)) return prev;
      return [...prev, dt.id];
    });
  }, [enrollments, discountTypes, draft]);

  useEffect(() => {
    if (draft) return;
    if (!discountTypes.length || !enrollments) return;
    const hasKarmel = (enrollments as any[]).some(
      (e) => e.is_active && (e.schools?.name || "").includes("כרם מהר"),
    );
    if (!hasKarmel) return;
    const dt = discountTypes.find((d) => d.legacy_key === "afterschool_branch");
    if (!dt) return;
    setSelectedDiscountIds((prev) => {
      if (prev.includes(dt.id)) return prev;
      if (prev.some((id) => exclusiveIdsSet.has(id))) return prev;
      return [...prev, dt.id];
    });

  }, [enrollments, discountTypes, draft]);

  // ── Sibling discount: auto-select "sibling" discount when the current
  // student has the lowest base annual total (before discounts) among their
  // confirmed siblings. Runs only when seeding a fresh calc (no draft yet).
  const siblingCheapestInfo = useMemo(() => {
    if (!yearFull || !settings || siblingsList.length === 0 || !enrollments) return null;
    const globalPrices = (settings.lesson_prices ?? {}) as Record<string, number>;
    const yStart = yearFull.start_date as string;
    const yEnd = yearFull.end_date as string;
    const totalFor = (enrs: any[]) => enrs
      .filter((e) => e.is_active !== false)
      .reduce((sum, e) => sum + calcEnrollment({
        id: e.id,
        duration: Number(e.lesson_duration_minutes) || 0,
        startDate: e.start_date,
        endDate: e.end_date ?? null,
        pricePerLessonOverride: e.price_per_lesson ?? null,
      }, globalPrices, yStart, yEnd).prorated, 0);
    const myTotal = totalFor(enrollments as any[]);
    const siblingTotals = siblingsList.map((s) => ({
      id: s.id,
      name: `${s.first_name} ${s.last_name}`,
      total: totalFor(siblingEnrollments.filter((e: any) => e.student_id === s.id)),
    }));
    const allTotals = [{ id: studentId!, name: "current", total: myTotal }, ...siblingTotals];
    const min = Math.min(...allTotals.map((t) => t.total));
    // Current student must be strictly the cheapest (or tied) AND have a positive total.
    const isCheapest = myTotal > 0 && Math.abs(myTotal - min) < 0.005;
    return { isCheapest, siblingTotals, myTotal };
  }, [yearFull, settings, siblingsList, siblingEnrollments, enrollments, studentId]);

  useEffect(() => {
    if (draft) return;
    if (!discountTypes.length) return;
    if (!siblingCheapestInfo?.isCheapest) return;
    const dt = discountTypes.find((d) => d.legacy_key === "sibling" || d.applies_to === "sibling_cheapest");
    if (!dt) return;
    setSelectedDiscountIds((prev) => {
      if (prev.includes(dt.id)) return prev;
      if (prev.some((id) => exclusiveIdsSet.has(id))) return prev;
      return [...prev, dt.id];
    });
  }, [siblingCheapestInfo, discountTypes, draft]);


  // Persist discounts to localStorage (same-browser fallback)
  useEffect(() => {
    if (!lsKey) return;
    try {
      localStorage.setItem(lsKey, JSON.stringify({
        selectedDiscountIds, customDiscounts, startDateOverrides,
      }));
    } catch { /* ignore quota errors */ }
  }, [lsKey, selectedDiscountIds, customDiscounts, startDateOverrides]);

  // Persist to server (student_payment_drafts).
  // We keep a ref of the latest state so we can flush synchronously (e.g. right
  // before generating a payment link) without waiting for the debounce window.
  const draftStateRef = useRef({ selectedDiscountIds, customDiscounts, startDateOverrides, discountEnrollmentOverrides });
  useEffect(() => {
    draftStateRef.current = { selectedDiscountIds, customDiscounts, startDateOverrides, discountEnrollmentOverrides };
  }, [selectedDiscountIds, customDiscounts, startDateOverrides, discountEnrollmentOverrides]);

  const [savingDraft, setSavingDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const saveDraftNow = async (opts?: { showToast?: boolean }) => {
    if (!studentId || !yearId) return;
    const { selectedDiscountIds: s, customDiscounts: c, startDateOverrides: o, discountEnrollmentOverrides: deo } = draftStateRef.current;
    // Fallback to the last payment snapshot only when SEEDING for the first
    // time (no draft row yet). Once a draft exists it is authoritative and
    // an empty list must remain empty across devices.
    const canFallback = !draft;
    const fallbackSnapshot = canFallback ? paymentDiscountSnapshotRef.current : null;
    const customDiscountsToSave =
      canFallback && !customDiscountsTouchedRef.current && c.length === 0 && (fallbackSnapshot?.customDiscounts?.length ?? 0) > 0
        ? fallbackSnapshot!.customDiscounts
        : c;
    const selectedDiscountIdsToSave =
      canFallback && s.length === 0 && (fallbackSnapshot?.selectedDiscountIds?.length ?? 0) > 0
        ? fallbackSnapshot!.selectedDiscountIds
        : s;
    const startDateOverridesToSave =
      canFallback && Object.keys(o).length === 0 && fallbackSnapshot?.startDateOverrides && Object.keys(fallbackSnapshot.startDateOverrides).length > 0
        ? fallbackSnapshot.startDateOverrides
        : o;
    try {
      if (opts?.showToast) setSavingDraft(true);
      const { error } = await supabase.from("student_payment_drafts" as any).upsert(
        {
          student_id: studentId,
          academic_year_id: yearId,
          selected_discount_ids: selectedDiscountIdsToSave,
          custom_discounts: customDiscountsToSave as any,
          start_date_overrides: startDateOverridesToSave as any,
          discount_enrollment_overrides: deo as any,
        },
        { onConflict: "student_id,academic_year_id" },
      );
      if (error) throw error;
      setLastSavedAt(new Date());
      queryClient.invalidateQueries({ queryKey: ["priv-payments-drafts"] });
      if (opts?.showToast) toast.success("החישוב נשמר");
    } catch (e: any) {
      if (opts?.showToast) toast.error("שמירה נכשלה: " + (e?.message || "שגיאה"));
    } finally {
      if (opts?.showToast) setSavingDraft(false);
    }
  };

  useEffect(() => {
    if (!studentId || !yearId) return;
    if (draft === undefined) return; // wait for initial fetch
    const handle = setTimeout(() => { void saveDraftNow(); }, 600);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, yearId, selectedDiscountIds, customDiscounts, startDateOverrides, discountEnrollmentOverrides, draft]);

  // Best-effort flush on unmount / navigation so a fresh custom discount isn't
  // lost if the user immediately generates a link and navigates away.
  useEffect(() => {
    const flush = () => { void saveDraftNow(); };
    window.addEventListener("beforeunload", flush);

    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      void saveDraftNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, yearId]);

  const toggleDiscount = (id: string) => {
    setSelectedDiscountIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      // If this is an exclusive-group discount, drop any other exclusive one.
      if (exclusiveIdsSet.has(id)) {
        const cleaned = prev.filter((x) => !exclusiveIdsSet.has(x));
        return [...cleaned, id];
      }
      return [...prev, id];
    });
  };





  // Update enrollment end_date directly from the table.
  // If the new end_date is in the past → also deactivate enrollment, and if
  // no other active enrollments remain for the student → mark student "הפסיק".
  const endDateMutation = useMutation({
    mutationFn: async ({ enrollmentId, endDate }: { enrollmentId: string; endDate: string | null }) => {
      const today = new Date().toISOString().slice(0, 10);
      const isPast = !!endDate && endDate < today;

      const { error } = await supabase
        .from("enrollments")
        .update({
          end_date: endDate,
          ...(isPast ? { is_active: false } : {}),
        })
        .eq("id", enrollmentId);
      if (error) throw error;

      if (isPast && studentId) {
        // Check if any other active enrollment remains (any year).
        const { data: remaining } = await supabase
          .from("enrollments")
          .select("id, end_date, is_active")
          .eq("student_id", studentId)
          .eq("is_active", true);
        const stillActive = (remaining ?? []).some((r: any) => r.id !== enrollmentId && (!r.end_date || r.end_date >= today));
        if (!stillActive) {
          await supabase.from("students").update({ student_status: "הפסיק" } as any).eq("id", studentId);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calc-enrollments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["calc-student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-student-enrollments", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      toast.success("תאריך סיום עודכן");
    },
    onError: (e: any) => toast.error(`שגיאה בעדכון תאריך סיום: ${e?.message ?? ""}`),
  });

  const specialCourseMutation = useMutation({
    mutationFn: async ({ field, value }: { field: "has_music_production_course" | "has_recital_track"; value: boolean }) => {
      const { error } = await supabase.from("students").update({ [field]: value } as any).eq("id", studentId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calc-student", studentId] });
    },
    onError: (e: any) => toast.error(`שגיאה בעדכון: ${e?.message ?? ""}`),
  });




  const rows: CalcRow[] = useMemo(() => {
    if (!enrollments || !yearFull || !settings) return [];
    const prices = settings.lesson_prices ?? {};
    return enrollments.map((e: any) =>
      calcEnrollment(
        {
          id: e.id,
          duration: e.lesson_duration_minutes,
          startDate: startDateOverrides[e.id] ?? e.start_date,
          endDate: e.end_date,
          pricePerLessonOverride: e.price_per_lesson,
          instrumentName: e.instruments?.name,
          schoolName: e.schools?.name,
          teacherName: e.teachers ? `${e.teachers.first_name} ${e.teachers.last_name}` : null,
        },
        prices,
        yearFull.start_date,
        yearFull.end_date
      )
    );
  }, [enrollments, yearFull, settings, startDateOverrides]);

  const annualTotal = rows.reduce((s, r) => s + r.annualBase, 0);
  const proratedTotal = rows.reduce((s, r) => s + r.prorated, 0);
  const lessonsRemainingTotal = rows.reduce((s, r) => s + (r.lessonsRemaining || 0), 0);
  const lessonsTotalAll = rows.reduce((s, r) => s + (r.lessonsTotal || 0), 0);

  // Dynamic selected discount_types
  const selectedDiscounts = discountTypes.filter((d) => selectedDiscountIds.includes(d.id));

  const stdCompute = computeStandardDiscounts(
    rows.map((r) => ({ enrollmentId: r.enrollmentId, prorated: r.prorated })),
    selectedDiscounts,
    discountEnrollmentOverrides,
  );


  const rowsAfterStd = rows.map((r) => {
    const pct = stdCompute.perEnrollmentPct.get(r.enrollmentId) ?? 0;
    return { ...r, afterStd: Math.round(r.prorated * (1 - pct / 100) * 100) / 100 };
  });

  // ---- Special courses (music production / recital track) ----
  const specialCourses = useMemo(() => {
    if (!student || !settings) return [] as { key: "music_production" | "recital_track"; label: string; price: number }[];
    const list: { key: "music_production" | "recital_track"; label: string; price: number }[] = [];
    if (student.has_music_production_course) {
      list.push({ key: "music_production", label: "קורס הפקה מוסיקלית", price: Number(settings.music_production_price) || 0 });
    }
    if (student.has_recital_track) {
      list.push({ key: "recital_track", label: "מסלול לרסיטל", price: Number(settings.recital_track_price) || 0 });
    }
    return list;
  }, [student, settings]);

  const specialBase = specialCourses.reduce((s, c) => s + c.price, 0);
  // Discounts DO NOT apply to special courses (music production / recital) — full price always.
  const specialAfterStd = specialBase;
  const specialStdDiscountAmount = 0;


  // Per-discount additional amount on specials — always zero (discounts don't apply to specials).
  const specialDiscountByType = useMemo(() => new Map<string, number>(), []);


  const afterStdDiscount = stdCompute.afterStdDiscount + specialAfterStd;
  // For display/payload — effective overall discount % (over prorated + specials)
  const proratedPlusSpecial = proratedTotal + specialBase;
  const stdDiscountPct = proratedPlusSpecial > 0 ? ((proratedPlusSpecial - afterStdDiscount) / proratedPlusSpecial) * 100 : 0;

  // Custom discounts: each is either a percentage of afterStdDiscount, or a flat ILS amount
  const customDiscountAmount = customDiscounts.reduce((sum, c) => {
    const v = Number(c.value) || 0;
    if (c.mode === "pct") return sum + (afterStdDiscount * v) / 100;
    return sum + v;
  }, 0);

  // Malkar (Non-Profit) — no VAT charged. Kept fields zeroed for backward compatibility.
  const totalIncVat = Math.max(0, Math.round((afterStdDiscount - customDiscountAmount) * 100) / 100);
  const totalDiscountAmount = Math.round((proratedPlusSpecial - totalIncVat) * 100) / 100;
  const vatRate = 0;
  const beforeVat = totalIncVat;
  const vatAmount = 0;

  const effectivePaid = paymentsAggr?.net ?? 0;
  const balance = Math.round((totalIncVat - effectivePaid) * 100) / 100;
  const isFullyPaid = totalIncVat > 0 && balance <= 0;

  const [generatingLink, setGeneratingLink] = useState(false);
  const [generatedPaymentData, setGeneratedPaymentData] = useState<{ url: string; amount: number; paymentId: string } | null>(null);
  const [showSendMessageDialog, setShowSendMessageDialog] = useState(false);

  const buildPaylinkPayload = () => {
    const enrollmentLabels = rowsAfterStd.map((r) => {
      const e = enrollments?.find((x: any) => x.id === r.enrollmentId);
      return [
        e?.instruments?.name ?? "—",
        e?.schools?.name ? `· ${e.schools.name}` : "",
        e?.lesson_duration_minutes ? `· ${e.lesson_duration_minutes} דק׳` : "",
      ].filter(Boolean).join(" ");
    });

    // Payment links always attach to the ACTIVE academic year, never a viewed archive year.
    const linkYear = activeYear ?? year;
    const yearName = linkYear?.name ?? "";
    const hebrewYear = toHebrewYear(yearName);
    const yearSuffix = hebrewYear ? ` ${hebrewYear}` : "";

    let lines: { description: string; amount: number }[] = [];

    rowsAfterStd.forEach((r, i) => {
      lines.push({
        description: `שכר לימוד שנתי${yearSuffix} - ${enrollmentLabels[i]}`,
        amount: Math.round(r.annualBase * 100) / 100,
      });
      const prorationDeduction = r.annualBase - r.prorated;
      if (prorationDeduction > 0) {
        lines.push({
          description: `הפחתת שיעורים לפי תקופה${yearSuffix} - ${enrollmentLabels[i]} (${r.lessonsRemaining}/${r.lessonsTotal} שיעורים נותרים)`,
          amount: -(Math.round(prorationDeduction * 100) / 100),
        });
      }
    });

    // Special courses base lines
    specialCourses.forEach((c) => {
      if (c.price <= 0) return;
      lines.push({
        description: `${c.label}${yearSuffix}`,
        amount: Math.round(c.price * 100) / 100,
      });
    });

    stdCompute.lines.forEach((dl) => {
      const extra = specialDiscountByType.get(dl.discountTypeId) ?? 0;
      const totalAmt = (dl.amount || 0) + extra;
      if (totalAmt <= 0) return;
      lines.push({
        description: `${dl.label}${yearSuffix} (${dl.percentage}%)`,
        amount: -(Math.round(totalAmt * 100) / 100),
      });
    });
    customDiscounts.forEach((c) => {
      const v = Number(c.value) || 0;
      if (!v) return;
      const amt = c.mode === "pct" ? Math.round(afterStdDiscount * v) / 100 : Math.round(v * 100) / 100;
      const name = c.label?.trim() || "הנחה מותאמת";
      const suffix = c.mode === "pct" ? ` (${v}%)` : "";
      lines.push({ description: `${name}${yearSuffix}${suffix}`, amount: -amt });
    });

    const linesSum = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;
    const drift = Math.round((balance - linesSum) * 100) / 100;
    if (drift !== 0 && lines.length > 0) lines[0].amount = Math.round((lines[0].amount + drift) * 100) / 100;
    lines = lines.filter((l) => l.amount !== 0);

    if (lines.length === 0) {
      lines = [{ description: `שכר לימוד${yearSuffix}`, amount: Math.round(balance * 100) / 100 }];
    }

    return {
      studentId,
      amount: balance,
      academicYearId: linkYear?.id ?? yearId,
      academicYearName: hebrewYear ?? null,
      lines,
      discounts: {
        selectedDiscountIds,
        discountTypesSnapshot: selectedDiscounts.map((d) => ({
          id: d.id,
          label: d.label,
          percentage: d.percentage,
          applies_to: d.applies_to,
          legacy_key: d.legacy_key,
        })),
        customDiscounts,
        startDateOverrides,
        discountEnrollmentOverrides,
      },

    };
  };

  const callGeneratePaylink = async () => {
    const payload = buildPaylinkPayload();
    const { data, error } = await supabase.functions.invoke("icount-generate-student-paylink", {
      body: payload,
    });
    if (error) throw error;
    if (data?.error) throw new Error(typeof data.error === "string" ? data.error : "iCount error");
    if (!data?.url) throw new Error("no url returned");
    return data as { url: string; amount: number; paymentId: string };
  };

  const handleGenerateLink = async () => {
    if (!student || !studentId) return;
    if (balance <= 0) return;
    setGeneratingLink(true);
    try {
      // Flush the calc state (discounts, custom discounts, date overrides) to
      // the server BEFORE creating the link, so the exact snapshot the user
      // sees is preserved and can't be lost by the debounced save.
      await saveDraftNow();
      const data = await callGeneratePaylink();
      setGeneratedPaymentData(data);
      try { await navigator.clipboard.writeText(data.url); } catch { /* clipboard may be unavailable */ }
      window.open(data.url, "_blank");
      toast.success("קישור התשלום נוצר והועתק ללוח");
      queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] }); queryClient.invalidateQueries({ queryKey: ["calc-pending-payments-all-years", studentId] });
    } catch (e: any) {
      console.error("[generateICountLink]", e);
      toast.error(`שגיאה ביצירת קישור: ${e?.message ?? e}`);
    } finally {
      setGeneratingLink(false);
    }
  };

  // Active link = either just generated in this session, or an existing pending link
  const activePaymentLink = useMemo(() => {
    if (generatedPaymentData) return generatedPaymentData;
    const p = pendingPayments[0];
    if (p?.payment_link_url) {
      return { url: p.payment_link_url as string, amount: Number(p.amount || 0), paymentId: p.id as string };
    }
    return null;
  }, [generatedPaymentData, pendingPayments]);


  if (loadingStudent || loadingEnrollments || !settings || !yearFull) {
    return (
      <AdminLayout title="חשב/צור תשלום" backPath={`/admin/students/${studentId}`}>
        <PageTitle title="חישוב תשלום" />
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </AdminLayout>
    );
  }

  if (!student) {
    return (
      <AdminLayout title="חשב/צור תשלום" backPath={`/admin/students/${studentId}`}>
        <PageTitle title="חישוב תשלום" />
        <p className="text-center text-muted-foreground py-12">תלמיד לא נמצא</p>
      </AdminLayout>
    );
  }

  const hasMissing = rows.some((r) => r.source === "missing");

  return (
    <AdminLayout title="חשב/צור תשלום" backPath={`/admin/students/${studentId}`}>
      <PageTitle title={student ? `חישוב תשלום — ${student.first_name} ${student.last_name}` : "חישוב תשלום"} />
      <div className="space-y-5">

        {/* Student & Parent header */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h2 className="font-semibold text-foreground text-base mb-2">תלמיד</h2>
              <p className="text-sm"><span className="text-muted-foreground">שם:</span> {student.first_name} {student.last_name}</p>
              <p className="text-sm"><span className="text-muted-foreground">ת.ז.:</span> {student.national_id ?? "—"}</p>
              <p className="text-sm"><span className="text-muted-foreground">כיתה:</span> {student.grade ?? "—"}</p>
              <p className="text-sm"><span className="text-muted-foreground">ישוב מגורים:</span> {student.city ?? "—"}</p>
              <p className="text-sm"><span className="text-muted-foreground">כתובת:</span> {student.address ?? "—"}</p>
            </div>
            <div>
              <h2 className="font-semibold text-foreground text-base mb-2">הורה לחיוב</h2>
              <p className="text-sm"><span className="text-muted-foreground">שם:</span> {student.parent_name ?? "—"}</p>
              <p className="text-sm"><span className="text-muted-foreground">ת.ז. הורה:</span> {student.parent_national_id ?? "—"}</p>
              <div className="text-sm flex items-center gap-1"><span className="text-muted-foreground">טלפון:</span> {student.parent_phone ? <PhoneDisplay phone={student.parent_phone} /> : "—"}</div>
              <p className="text-sm"><span className="text-muted-foreground">אימייל:</span> {student.parent_email ?? "—"}</p>
            </div>
          </div>
        </div>







        {/* Enrollments */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-foreground text-base">שיוכים פעילים — {year?.name ?? "—"}</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין שיוכים פעילים לשנה זו</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">כלי</TableHead>
                    <TableHead className="text-right">מורה</TableHead>
                    <TableHead className="text-right">סניף</TableHead>
                    <TableHead className="text-right">משך</TableHead>
                    <TableHead className="text-right">תאריך התחלה</TableHead>
                    <TableHead className="text-right">תאריך סיום</TableHead>
                    <TableHead className="text-right">בסיס שנתי</TableHead>
                    
                    <TableHead className="text-right">שיעורים נותרים</TableHead>
                    <TableHead className="text-right">חישוב לפי שיעורים נותרים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const e = enrollments?.find((x: any) => x.id === r.enrollmentId);
                    return (
                      <TableRow key={r.enrollmentId}>
                        <TableCell>{e?.instruments?.name ?? "—"}</TableCell>
                        <TableCell>{e?.teachers ? `${e.teachers.first_name} ${e.teachers.last_name}` : "—"}</TableCell>
                        <TableCell>{e?.schools?.name ?? "—"}</TableCell>
                        <TableCell>{e?.lesson_duration_minutes} דק׳</TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={startDateOverrides[r.enrollmentId] ?? e?.start_date ?? ""}
                            onChange={(ev) => setStartDateOverrides({ ...startDateOverrides, [r.enrollmentId]: ev.target.value })}
                            className="h-9 rounded-lg w-36"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={e?.end_date ?? yearFull?.end_date ?? ""}
                            min={e?.start_date ?? undefined}
                            max={yearFull?.end_date ?? undefined}
                            disabled={endDateMutation.isPending}
                            onChange={(ev) => {
                              const v = ev.target.value || null;
                              endDateMutation.mutate({ enrollmentId: r.enrollmentId, endDate: v });
                            }}
                            className="h-9 rounded-lg w-36"
                          />
                        </TableCell>
                        <TableCell>
                          ₪{r.annualBase.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          {r.source === "override" && <span className="text-[10px] text-muted-foreground mr-1">(override)</span>}
                          {r.source === "missing" && <span className="text-[10px] text-destructive mr-1">(חסר מחיר)</span>}
                        </TableCell>
                        
                        <TableCell>{r.lessonsRemaining} / {r.lessonsTotal}</TableCell>
                        <TableCell className="font-medium">₪{r.prorated.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {hasMissing && (
                <p className="text-xs text-destructive mt-2">
                  ⚠ חלק מהמחירים חסרים. הזן מחיר ב<button onClick={() => navigate("/admin/payment-settings")} className="underline">הגדרות תשלום</button> או override פר-רישום.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Special courses */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-semibold text-foreground text-base">קורסים מיוחדים</h2>
            <button
              type="button"
              onClick={() => navigate("/admin/payment-settings")}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              עריכת מחירים
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/30">
              <Checkbox
                checked={!!student?.has_music_production_course}
                onCheckedChange={(c) => specialCourseMutation.mutate({ field: "has_music_production_course", value: c === true })}
              />
              <div className="flex-1">
                <div className="text-sm font-medium">קורס הפקה מוסיקלית</div>
                <div className="text-xs text-muted-foreground">
                  ₪{(Number(settings?.music_production_price) || 0).toLocaleString("he-IL")}
                  {(!settings?.music_production_price || Number(settings.music_production_price) <= 0) && (
                    <span className="text-destructive mr-1">· מחיר לא הוגדר</span>
                  )}
                </div>
              </div>
            </label>
            <label className="flex items-center gap-3 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/30">
              <Checkbox
                checked={!!student?.has_recital_track}
                onCheckedChange={(c) => specialCourseMutation.mutate({ field: "has_recital_track", value: c === true })}
              />
              <div className="flex-1">
                <div className="text-sm font-medium">מסלול לרסיטל</div>
                <div className="text-xs text-muted-foreground">
                  ₪{(Number(settings?.recital_track_price) || 0).toLocaleString("he-IL")}
                  {(!settings?.recital_track_price || Number(settings.recital_track_price) <= 0) && (
                    <span className="text-destructive mr-1">· מחיר לא הוגדר</span>
                  )}
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Discounts */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="font-semibold text-foreground text-base">הנחות</h2>
            <button
              type="button"
              onClick={() => navigate("/admin/payment-settings")}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              ניהול סוגי הנחות
            </button>
          </div>
          {(() => {
            if (!siblingCheapestInfo || siblingsList.length === 0) return null;
            const sibDt = discountTypes.find(
              (d) => d.applies_to === "sibling_cheapest" || d.legacy_key === "sibling",
            );
            if (!sibDt) return null;
            const alreadySelected = selectedDiscountIds.includes(sibDt.id);
            const blockedByOther = selectedDiscountIds.some(
              (id) => id !== sibDt.id && exclusiveIdsSet.has(id),
            );
            if (siblingCheapestInfo.isCheapest) {
              if (alreadySelected) {
                return (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-900 dark:text-emerald-100">
                    ✓ התלמיד/ה הזול/ה בקבוצת האחים — הנחת "{sibDt.label}" פעילה (סה"כ בסיס ₪{Math.round(siblingCheapestInfo.myTotal).toLocaleString("he-IL")}).
                  </div>
                );
              }
              return (
                <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 text-sm space-y-2">
                  <div>
                    התלמיד/ה הוא/היא <strong>הזול/ה ביותר</strong> בקבוצת האחים (סה"כ בסיס ₪{Math.round(siblingCheapestInfo.myTotal).toLocaleString("he-IL")}) — מומלץ להחיל את הנחת <strong>"{sibDt.label}"</strong>.
                  </div>
                  <Button
                    size="sm"
                    className="h-8 rounded-lg"
                    onClick={() => toggleDiscount(sibDt.id)}
                  >
                    החל הנחה
                  </Button>
                  {blockedByOther && (
                    <div className="text-xs text-muted-foreground">
                      שים לב: תוסר הנחת האחוזים האחרת הפעילה כרגע (אין כפל).
                    </div>
                  )}
                </div>
              );
            }
            const cheapest = siblingCheapestInfo.siblingTotals.reduce(
              (a, b) => (b.total < a.total ? b : a),
              siblingCheapestInfo.siblingTotals[0],
            );
            return (
              <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
                האח/ות הזול/ה בקבוצה: <strong className="text-foreground">{cheapest?.name}</strong> — הנחת "{sibDt.label}" תוחל בכרטיס שלו/ה, לא כאן.
              </div>
            );
          })()}

          {discountTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              לא הוגדרו סוגי הנחות לשנה זו.{" "}
              <button onClick={() => navigate("/admin/payment-settings")} className="underline">
                הגדר בהגדרות תשלום
              </button>
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {discountTypes.map((d) => {
                const checked = selectedDiscountIds.includes(d.id);
                const isExclusive = exclusiveIdsSet.has(d.id);
                const blockedByExclusive =
                  isExclusive &&
                  !checked &&
                  selectedDiscountIds.some((id) => id !== d.id && exclusiveIdsSet.has(id));
                const scopeNote =
                  d.applies_to === "cheapest_enrollment"
                    ? " · על כלים נוספים"
                    : " · על שיעורים פרטניים";
                const isPerEnrollment = d.applies_to === "cheapest_enrollment";
                const override = discountEnrollmentOverrides[d.id];
                const usingOverride = Array.isArray(override) && override.length > 0;
                const appliedIds = new Set(
                  stdCompute.lines.find((l) => l.discountTypeId === d.id)?.appliedEnrollmentIds ?? [],
                );
                return (
                  <div
                    key={d.id}
                    className={`flex flex-col gap-2 rounded-xl border border-border p-3 ${
                      blockedByExclusive ? "opacity-50" : ""
                    }`}
                    title={blockedByExclusive ? "לא ניתן לשלב עם הנחת אחוזים אחרת" : undefined}
                  >
                    <label className={`flex items-center gap-2 ${blockedByExclusive ? "cursor-not-allowed" : "cursor-pointer"}`}>
                      <Checkbox
                        checked={checked}
                        disabled={blockedByExclusive}
                        onCheckedChange={() => toggleDiscount(d.id)}
                      />
                      <span className="text-sm">
                        {d.label} ({Number(d.percentage)}%{scopeNote})
                      </span>
                    </label>
                    {checked && isPerEnrollment && rows.length >= 2 && (
                      <div className="mt-1 pr-6 space-y-1.5 border-t border-border pt-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] text-muted-foreground">בחר שיוכים להנחה:</span>
                          {usingOverride && (
                            <button
                              type="button"
                              className="text-[11px] text-primary underline"
                              onClick={() => setDiscountEnrollmentOverrides((prev) => {
                                const { [d.id]: _drop, ...rest } = prev;
                                return rest;
                              })}
                            >
                              איפוס לברירת מחדל
                            </button>
                          )}
                        </div>
                        {rows.map((r) => {
                          const e = enrollments?.find((x: any) => x.id === r.enrollmentId);
                          const label = `${e?.instruments?.name ?? "—"} · ${e?.schools?.name ?? "—"} · ${e?.lesson_duration_minutes ?? "—"} דק׳`;
                          const isOn = appliedIds.has(r.enrollmentId);
                          return (
                            <label key={r.enrollmentId} className="flex items-center gap-2 text-xs cursor-pointer">
                              <Checkbox
                                checked={isOn}
                                onCheckedChange={(c) => {
                                  setDiscountEnrollmentOverrides((prev) => {
                                    const current =
                                      Array.isArray(prev[d.id]) && prev[d.id].length > 0
                                        ? prev[d.id]
                                        : Array.from(appliedIds);
                                    const next = c === true
                                      ? Array.from(new Set([...current, r.enrollmentId]))
                                      : current.filter((id) => id !== r.enrollmentId);
                                    return { ...prev, [d.id]: next };
                                  });
                                }}
                              />
                              <span>{label}</span>
                            </label>
                          );
                        })}
                        {!usingOverride && (
                          <div className="text-[10px] text-muted-foreground">ברירת מחדל: כל השיוכים למעט היקר ביותר.</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>הנחות מותאמות</Label>
              <Button variant="outline" size="sm" className="rounded-xl h-9" onClick={() => { customDiscountsTouchedRef.current = true; setCustomDiscounts([...customDiscounts, { label: "", value: "", mode: "pct" }]); }}>
                <Plus className="h-3.5 w-3.5" /> הוסף
              </Button>
            </div>
            {customDiscounts.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_90px_44px] gap-2">
                <Input placeholder="תיאור" value={c.label} onChange={(e) => {
                  customDiscountsTouchedRef.current = true;
                  const arr = [...customDiscounts]; arr[i] = { ...arr[i], label: e.target.value }; setCustomDiscounts(arr);
                }} className="h-11 rounded-xl" />
                <Input
                  placeholder={c.mode === "pct" ? "%" : "₪"}
                  type="number"
                  min="0"
                  value={c.value}
                  onChange={(e) => {
                    customDiscountsTouchedRef.current = true;
                    const arr = [...customDiscounts]; arr[i] = { ...arr[i], value: e.target.value }; setCustomDiscounts(arr);
                  }}
                  className="h-11 rounded-xl"
                />
                <Select value={c.mode} onValueChange={(v) => {
                  customDiscountsTouchedRef.current = true;
                  const arr = [...customDiscounts]; arr[i] = { ...arr[i], mode: v as "pct" | "amount" }; setCustomDiscounts(arr);
                }}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pct">אחוזים</SelectItem>
                    <SelectItem value="amount">סכום ₪</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl text-destructive" onClick={() => { customDiscountsTouchedRef.current = true; setCustomDiscounts(customDiscounts.filter((_, idx) => idx !== i)); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {/* Summary */}
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-sm space-y-2.5">
          <h2 className="font-semibold text-foreground text-base mb-2">סיכום</h2>
          {rows.map((r) => {
            const e = enrollments?.find((x: any) => x.id === r.enrollmentId);
            const label = `${e?.instruments?.name ?? "—"} — ${e?.schools?.name ?? "—"}`;
            return <SummaryRow key={`base-${r.enrollmentId}`} label={label} value={r.annualBase} />;
          })}
          <SummaryRow label="סה״כ בסיס שנתי מלא" value={annualTotal} bold />
          {annualTotal - proratedTotal > 0 && (
            <SummaryRow
              label={`הפחתת שיעורים לפי תקופה (${lessonsTotalAll - lessonsRemainingTotal} מתוך ${lessonsTotalAll})`}
              value={-(annualTotal - proratedTotal)}
            />
          )}
          <SummaryRow label={`סה״כ אחרי קיזוז (${lessonsRemainingTotal} שיעורים נותרים)`} value={proratedTotal} bold />
          {specialCourses.map((c) => (
            <SummaryRow key={`sc-${c.key}`} label={`קורס מיוחד · ${c.label}`} value={c.price} />
          ))}
          {specialBase > 0 && (
            <SummaryRow label="סה״כ כולל קורסים מיוחדים" value={proratedPlusSpecial} bold />
          )}
          {stdCompute.lines.map((dl) => {
            const extra = specialDiscountByType.get(dl.discountTypeId) ?? 0;
            const total = (dl.amount || 0) + extra;
            return total > 0 ? (
              <SummaryRow
                key={dl.discountTypeId}
                label={`${dl.label} (${dl.percentage}% ${dl.applies_to === "cheapest_enrollment" ? "על כלים נוספים" : "על שיעורים פרטניים"})`}
                value={-(Math.round(total * 100) / 100)}
              />
            ) : null;
          })}
          {customDiscounts.map((c, i) => {
            const v = Number(c.value) || 0;
            if (!v) return null;
            const amount = c.mode === "pct" ? Math.round(afterStdDiscount * v) / 100 : Math.round(v * 100) / 100;
            const name = c.label?.trim() || "הנחה מותאמת";
            const suffix = c.mode === "pct" ? ` (${v}%)` : "";
            return <SummaryRow key={i} label={`${name}${suffix}`} value={-amount} />;
          })}
          {totalDiscountAmount > 0 && (
            <SummaryRow label="סה״כ הנחות" value={-totalDiscountAmount} bold />
          )}
          <div className="border-t border-primary/20 pt-2">
            <SummaryRow label='סה"כ לתשלום' value={totalIncVat} bold large />
          </div>

          <SummaryRow label="כבר שולם" value={paymentsAggr.paid} />
          {paymentsAggr.credit > 0 && (
            <SummaryRow label="זיכויים" value={-paymentsAggr.credit} />
          )}
          <div className="border-t border-primary/20 pt-2">
            <SummaryRow label="יתרה לתשלום" value={balance} bold large highlight={balance > 0} />
          </div>
          {balance < -0.5 ? (
            <div className="mt-2 rounded-xl bg-amber-100 border border-amber-300 px-3 py-2 text-center dark:bg-amber-900/30 dark:border-amber-700">
              <span className="text-sm font-semibold text-amber-800 dark:text-amber-200">קיים זיכוי · ₪{Math.abs(balance).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          ) : isFullyPaid ? (
            <div className="mt-2 rounded-xl bg-primary/15 border border-primary/40 px-3 py-2 text-center">
              <span className="text-sm font-semibold text-primary">✓ שולם במלואו</span>
            </div>
          ) : null}

          {/* Generate iCount link — inside summary so context is clear */}
          <div className="pt-3 border-t border-primary/20 flex flex-wrap justify-end items-center gap-2">
            {lastSavedAt && (
              <span className="text-xs text-muted-foreground ml-auto">
                נשמר {lastSavedAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              variant="outline"
              className="h-12 rounded-xl px-5"
              onClick={() => void saveDraftNow({ showToast: true })}
              disabled={savingDraft}
            >
              {savingDraft ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : null}
              {savingDraft ? "שומר..." : "שמור חישוב"}
            </Button>
            <Button
              variant="outline"
              className="h-12 rounded-xl px-5"
              onClick={() => setShowSendMessageDialog(true)}
              disabled={generatingLink || !activePaymentLink}
            >
              <Send className="h-4 w-4 ml-2" />
              שלח הודעה להורה
            </Button>
            <Button
              className="h-12 rounded-xl px-6"
              onClick={handleGenerateLink}
              disabled={(rows.length === 0 && specialBase <= 0) || balance <= 0 || generatingLink}
            >
              {generatingLink ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Send className="h-4 w-4 ml-2" />}
              {generatingLink ? "יוצר קישור..." : "צור קישור לתשלום"}
            </Button>
          </div>
        </div>

        {pendingPayments.length > 0 && (
          <div className="rounded-2xl border border-amber-400/40 bg-amber-50/60 dark:bg-amber-950/20 p-5 shadow-sm space-y-2">
            <h2 className="font-semibold text-foreground text-base">קישורי תשלום ממתינים ({pendingPayments.length})</h2>
            {pendingPayments.map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground text-sm">
                    ₪{Number(p.amount).toLocaleString()} · ממתין לתשלום
                    {p.academic_year_id && yearId && p.academic_year_id !== yearId && (
                      <span className="mr-2 inline-block rounded-md bg-amber-200/70 dark:bg-amber-900/40 px-2 py-0.5 text-[10px] font-semibold text-amber-900 dark:text-amber-200">
                        משנה אחרת
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate" dir="ltr">{p.payment_link_url || "—"}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {p.payment_link_url && (
                    <>
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="פתח קישור"
                        onClick={() => window.open(p.payment_link_url, "_blank")}>
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" title="העתק קישור"
                        onClick={async () => {
                          try { await navigator.clipboard.writeText(p.payment_link_url); toast.success("הקישור הועתק"); }
                          catch { toast.error("לא ניתן להעתיק"); }
                        }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10" title="בטל קישור ממתין"
                    onClick={async () => {
                      if (!confirm("לבטל את קישור התשלום הממתין? דף הסליקה יימחק מ-iCount.")) return;
                      if (p.payment_link_url || p.icount_payment_page_id) {
                        const { data, error } = await supabase.functions.invoke("icount-delete-student-paypage", {
                          body: { paymentId: p.id, strict: true },
                        });
                        if (error || data?.error) {
                          toast.error(`שגיאה במחיקת דף הסליקה: ${error?.message || data?.error}`);
                          return;
                        }
                      }
                      const { error } = await supabase.from("student_payments").delete().eq("id", p.id);
                      if (error) toast.error(`שגיאה: ${error.message}`);
                      else { toast.success("הקישור בוטל ודף הסליקה נמחק"); queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] }); queryClient.invalidateQueries({ queryKey: ["calc-pending-payments-all-years", studentId] }); }
                    }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <StudentPaymentsSection
          studentId={studentId!}
          payments={paymentsList as any[]}
          enrollments={enrollments ?? []}
          totalDue={totalIncVat}
          balanceDue={balance}
        />

        <SendTeacherAssignmentMessage
          open={showSendMessageDialog}
          onOpenChange={setShowSendMessageDialog}
          student={student}
          enrollments={enrollments ?? []}
          selectedYearId={yearId ?? null}
        />

      </div>
    </AdminLayout>
  );
};

const SummaryRow = ({ label, value, bold, large, highlight }: { label: string; value: number; bold?: boolean; large?: boolean; highlight?: boolean }) => (
  <div className="flex items-center justify-between">
    <span className={`${bold ? "font-semibold" : ""} ${large ? "text-base" : "text-sm"} text-foreground`}>{label}</span>
    <span className={`${bold ? "font-bold" : ""} ${large ? "text-lg" : "text-sm"} ${highlight ? "text-primary" : "text-foreground"}`}>
      ₪{value.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </span>
  </div>
);

export default AdminStudentPaymentCalc;
