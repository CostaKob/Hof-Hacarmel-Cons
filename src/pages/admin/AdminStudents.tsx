import { useState, useCallback, useMemo, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { saveListScrollPosition, useListStatePreservation } from "@/hooks/useListStatePreservation";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";

import { PhoneDisplay } from "@/components/PhoneDisplay";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { Plus, Search, FileSpreadsheet, Users, ListChecks, Music, X } from "lucide-react";
import StudentImportDialog from "@/components/admin/StudentImportDialog";
import { calcEnrollment } from "@/lib/paymentCalc";
import { computeStandardDiscounts, type DiscountType } from "@/lib/discounts";
import { isInactiveStudentStatus } from "@/lib/constants";
import { format } from "date-fns";

const AdminStudents = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [importOpen, setImportOpen] = useState(false);
  const { selectedYearId, years } = useAcademicYear();
  useListStatePreservation("/admin/students");

  useEffect(() => {
    sessionStorage.setItem("admin-students-return-url", `${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  const selectedYear = years.find((y) => y.id === selectedYearId);

  const search = searchParams.get("q") || "";
  const view = searchParams.get("view") || "enrollments"; // enrollments | all
  const statusFilter = searchParams.get("status") || "active";
  const siblingsFilter = searchParams.get("siblings") || "all";

  const getMultiFilter = useCallback((key: string): string[] => {
    const raw = searchParams.get(key);
    if (!raw) return [];
    return raw.split(",").filter(Boolean);
  }, [searchParams]);

  const teacherFilter = getMultiFilter("teacher");
  const schoolFilter = getMultiFilter("school");
  const eduSchoolFilter = getMultiFilter("edu_school");
  const durationFilter = getMultiFilter("duration");
  const cityFilter = getMultiFilter("city");
  const gradeFilter = getMultiFilter("grade");
  const levelFilter = getMultiFilter("level");
  const paymentFilter = getMultiFilter("payment");
  const linkFilter = getMultiFilter("link");
  const trackFilter = getMultiFilter("track");
  const instrumentFilter = getMultiFilter("instrument");
  const regTypeFilter = getMultiFilter("reg_type");

  const setFilter = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === "") next.delete(key);
      else if (key === "status" && value === "active") next.delete(key);
      else if (key === "view" && value === "enrollments") next.delete(key);
      else if (key !== "status" && key !== "view" && value === "all") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setMultiFilter = useCallback((key: string, values: string[]) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (values.length === 0) next.delete(key);
      else next.set(key, values.join(","));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const clearFilters = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete("q");
      next.delete("teacher");
      next.delete("school");
      next.delete("edu_school");
      next.delete("duration");
      next.delete("city");
      next.delete("grade");
      next.delete("level");
      next.delete("payment");
      next.delete("link");
      next.delete("track");
      next.delete("instrument");
      next.delete("reg_type");
      next.delete("siblings");
      next.set("status", "active");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-students-enrollments", selectedYearId],
    queryFn: async () => {
      let q = supabase
        .from("enrollments")
        .select("id, lesson_duration_minutes, is_active, academic_year_id, grade, start_date, end_date, price_per_lesson, total_lessons_allocated, students(id, first_name, last_name, city, is_active, grade, playing_level, student_status, national_id, parent_name, parent_phone, phone, is_major_student, is_junior_track, has_music_production_course, has_recital_track, educational_school), teachers(id, first_name, last_name), schools(id, name), instruments(id, name)")
        .order("created_at", { ascending: false });
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]).sort((a: any, b: any) => {
        const nameA = `${a.students?.last_name ?? ""} ${a.students?.first_name ?? ""}`;
        const nameB = `${b.students?.last_name ?? ""} ${b.students?.first_name ?? ""}`;
        return nameA.localeCompare(nameB, "he");
      });
    },
  });

  const { data: yearPayments = [] } = useQuery({
    queryKey: ["admin-year-payments", selectedYearId],
    queryFn: async () => {
      if (!selectedYearId) return [];
      const { data, error } = await supabase
        .from("student_payments")
        .select("student_id, enrollment_id, amount, transaction_type, payment_status, payment_date, created_at, enrollment_breakdown, payment_link_url")
        .eq("academic_year_id", selectedYearId)
        .order("payment_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedYearId,
  });

  const { data: paymentSettings } = useQuery({
    queryKey: ["admin-students-payment-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_settings" as any).select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: yearFull } = useQuery({
    queryKey: ["admin-students-year-billing", selectedYearId],
    enabled: !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("*").eq("id", selectedYearId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: ensembleMemberships = [] } = useQuery({
    queryKey: ["admin-students-ensembles", selectedYearId],
    queryFn: async () => {
      if (!selectedYearId) return [];
      const { data, error } = await supabase
        .from("ensemble_students")
        .select("id, student_id, enrollment_id, ensembles!inner(id, name, ensemble_type, academic_year_id)")
        .eq("ensembles.academic_year_id", selectedYearId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedYearId,
  });

  const { data: yearRegistrations = [] } = useQuery({
    queryKey: ["admin-students-registrations", selectedYearId],
    queryFn: async () => {
      if (!selectedYearId) return [];
      const { data, error } = await supabase
        .from("registrations")
        .select("existing_student_id, student_national_id, student_status, created_at")
        .eq("academic_year_id", selectedYearId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedYearId,
  });

  const { data: siblingLinks = [] } = useQuery({
    queryKey: ["admin-students-sibling-links"],
    queryFn: async () => {
      const { data, error } = await supabase.from("student_siblings" as any).select("student_a_id, student_b_id");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const siblingStudentIds = useMemo(() => {
    const set = new Set<string>();
    for (const link of siblingLinks as any[]) {
      if (link.student_a_id) set.add(link.student_a_id);
      if (link.student_b_id) set.add(link.student_b_id);
    }
    return set;
  }, [siblingLinks]);

  const normalizeRegType = (v: any): "new" | "continuing" | null => {
    const s = String(v ?? "").trim().toLowerCase();
    if (s === "new" || s === "חדש") return "new";
    if (s === "continuing" || s === "ממשיך") return "continuing";
    return null;
  };

  const registeredStudentIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of yearRegistrations as any[]) {
      if (r.existing_student_id) s.add(r.existing_student_id);
    }
    return s;
  }, [yearRegistrations]);

  const registeredNationalIds = useMemo(() => {
    const s = new Set<string>();
    for (const r of yearRegistrations as any[]) {
      if (r.student_national_id) s.add(String(r.student_national_id).trim());
    }
    return s;
  }, [yearRegistrations]);

  const regTypeByStudentId = useMemo(() => {
    const m = new Map<string, "new" | "continuing">();
    const sorted = [...(yearRegistrations as any[])].sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
    );
    for (const r of sorted) {
      const t = normalizeRegType(r.student_status);
      if (!t) continue;
      if (r.existing_student_id && !m.has(r.existing_student_id)) m.set(r.existing_student_id, t);
    }
    return m;
  }, [yearRegistrations]);

  const regTypeByNationalId = useMemo(() => {
    const m = new Map<string, "new" | "continuing">();
    const sorted = [...(yearRegistrations as any[])].sort((a, b) =>
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
    );
    for (const r of sorted) {
      const t = normalizeRegType(r.student_status);
      if (!t) continue;
      const nid = r.student_national_id ? String(r.student_national_id).trim() : "";
      if (nid && !m.has(nid)) m.set(nid, t);
    }
    return m;
  }, [yearRegistrations]);

  const getRegType = useCallback((s: any): "new" | "continuing" | null => {
    if (!s) return null;
    const byId = s.id ? regTypeByStudentId.get(s.id) : undefined;
    if (byId) return byId;
    const nid = s.national_id ? String(s.national_id).trim() : "";
    if (nid) return regTypeByNationalId.get(nid) ?? null;
    return null;
  }, [regTypeByStudentId, regTypeByNationalId]);

  const { data: discountTypes = [] } = useQuery({
    queryKey: ["discount-types", selectedYearId],
    enabled: !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_types" as any)
        .select("*")
        .eq("academic_year_id", selectedYearId!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data as any[]) as DiscountType[];
    },
  });

  // Server-side payment drafts are the single source of truth across devices.
  const { data: paymentDrafts = [] } = useQuery({
    queryKey: ["admin-students-payment-drafts", selectedYearId],
    enabled: !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_payment_drafts" as any)
        .select("student_id, selected_discount_ids, custom_discounts, start_date_overrides, discount_enrollment_overrides")
        .eq("academic_year_id", selectedYearId!);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const draftByStudent = useMemo(() => {
    const m = new Map<string, any>();
    for (const d of paymentDrafts as any[]) {
      if (d.student_id) m.set(d.student_id, d);
    }
    return m;
  }, [paymentDrafts]);


  const enrollmentRowsByStudent = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of rows as any[]) {
      const sid = r?.students?.id;
      if (!sid || !r.is_active) continue;
      map.set(sid, [...(map.get(sid) ?? []), r]);
    }
    return map;
  }, [rows]);

  const ensemblesByStudent = useMemo(() => {
    const map = new Map<string, { id: string; ensemble_id: string; name: string }[]>();
    for (const m of ensembleMemberships as any[]) {
      const sid = m.student_id;
      if (!sid) continue;
      const ens = m.ensembles;
      if (!ens) continue;
      const existing = map.get(sid) || [];
      if (existing.some((e) => e.ensemble_id === ens.id)) continue;
      existing.push({ id: m.id, ensemble_id: ens.id, name: ens.name });
      map.set(sid, existing);
    }
    return map;
  }, [ensembleMemberships]);

  const ensemblesByEnrollment = useMemo(() => {
    const map = new Map<string, { id: string; ensemble_id: string; name: string }[]>();
    for (const m of ensembleMemberships as any[]) {
      const eid = m.enrollment_id;
      if (!eid) continue;
      const ens = m.ensembles;
      if (!ens) continue;
      const existing = map.get(eid) || [];
      if (existing.some((e) => e.ensemble_id === ens.id)) continue;
      existing.push({ id: m.id, ensemble_id: ens.id, name: ens.name });
      map.set(eid, existing);
    }
    return map;
  }, [ensembleMemberships]);

  const getSavedDiscountState = useCallback((sid: string) => {
    // 1. Server draft (authoritative, cross-device).
    const draft = draftByStudent.get(sid);
    if (draft) {
      return {
        selectedDiscountIds: Array.isArray(draft.selected_discount_ids) ? draft.selected_discount_ids : [],
        customDiscounts: Array.isArray(draft.custom_discounts) ? draft.custom_discounts : [],
        startDateOverrides: draft.start_date_overrides && typeof draft.start_date_overrides === "object" ? draft.start_date_overrides : {},
        discountEnrollmentOverrides: draft.discount_enrollment_overrides && typeof draft.discount_enrollment_overrides === "object" ? draft.discount_enrollment_overrides : {},
      };
    }

    // 2. Fallback to snapshot on last generated payment link (legacy behavior).
    const fromPayment = (yearPayments as any[]).find((p) => {
      const br = p?.enrollment_breakdown;
      return p.student_id === sid && br && !Array.isArray(br) && br.discounts && p.payment_status === "pending";
    }) ?? (yearPayments as any[]).find((p) => {
      const br = p?.enrollment_breakdown;
      return br && !Array.isArray(br) && br.discounts && p.student_id === sid;
    });

    // 3. Local per-device cache (only if nothing above exists).
    let saved: any = null;
    if (selectedYearId && typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(`payment-calc-discounts:${sid}:${selectedYearId}`);
        saved = raw ? JSON.parse(raw) : null;
      } catch { /* ignore malformed local state */ }
    }

    const paymentDiscounts = fromPayment?.enrollment_breakdown?.discounts;
    return paymentDiscounts ?? saved ?? null;
  }, [selectedYearId, yearPayments, draftByStudent]);


  // Net paid summed at student level (paid/credit only; pending links do not reduce debt)
  const paidByStudent = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of yearPayments as any[]) {
      if (!p.student_id) continue;
      if (p.payment_status === "pending" || p.payment_status === "failed") continue;
      const amount = Number(p.amount || 0);
      const netAmount = amount < 0
        ? amount
        : p.transaction_type === "credit"
          ? -Math.abs(amount)
          : amount;
      map.set(p.student_id, (map.get(p.student_id) ?? 0) + netAmount);
    }
    return map;
  }, [yearPayments]);

  const balanceByStudent = useMemo(() => {
    const map = new Map<string, number>();
    if (!paymentSettings || !yearFull) return map;
    const prices = paymentSettings.lesson_prices ?? {};

    // Resolve selected discount_types for a student from saved state
    const resolveSelected = (saved: any): DiscountType[] => {
      if (!saved || !discountTypes.length) return [];
      const ids = new Set<string>(Array.isArray(saved.selectedDiscountIds) ? saved.selectedDiscountIds : []);
      // Legacy fallbacks
      const legacyMap: Record<string, string> = {
        sibling: "sibling",
        secondInstrument: "second_instrument",
        majorStudent: "major_student",
      };
      for (const k of Object.keys(legacyMap)) {
        if (saved[k] === true) {
          const dt = discountTypes.find((d) => d.legacy_key === legacyMap[k]);
          if (dt) ids.add(dt.id);
        }
      }
      return discountTypes.filter((d) => ids.has(d.id));
    };

    for (const [sid, studentRows] of enrollmentRowsByStudent.entries()) {
      const discounts = getSavedDiscountState(sid);
      const startDateOverrides = discounts?.startDateOverrides && typeof discounts.startDateOverrides === "object" ? discounts.startDateOverrides : {};
      const calcRows = studentRows.map((e: any) => calcEnrollment(
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
        yearFull.end_date,
      ));

      const proratedTotal = calcRows.reduce((sum, r) => sum + r.prorated, 0);

      // Resolve selected; auto-apply "major_student" type for is_major_student when nothing saved
      let selected = resolveSelected(discounts);
      if (!discounts && studentRows[0]?.students?.is_major_student) {
        const dt = discountTypes.find((d) => d.legacy_key === "major_student");
        if (dt) selected = [dt];
      }

      const { afterStdDiscount } = computeStandardDiscounts(
        calcRows.map((r) => ({ enrollmentId: r.enrollmentId, prorated: r.prorated })),
        selected,
      );

      // Special courses (music production / recital) — full price, discounts don't apply
      const stu = studentRows[0]?.students;
      let specialBase = 0;
      if (stu?.has_music_production_course) specialBase += Number(paymentSettings.music_production_price) || 0;
      if (stu?.has_recital_track) specialBase += Number(paymentSettings.recital_track_price) || 0;

      const afterStdWithSpecial = afterStdDiscount + specialBase;

      const customDiscountAmount = (Array.isArray(discounts?.customDiscounts) ? discounts.customDiscounts : []).reduce((sum: number, c: any) => {
        const v = Number(c.value) || 0;
        return sum + (c.mode === "pct" ? (afterStdWithSpecial * v) / 100 : v);
      }, 0);
      const totalDue = Math.max(0, Math.round(afterStdWithSpecial - customDiscountAmount));
      const paid = paidByStudent.get(sid) ?? 0;
      map.set(sid, totalDue - paid);

      if (proratedTotal <= 0 && specialBase <= 0 && paid <= 0) {
        map.set(sid, 0);
      }
    }
    return map;
  }, [paymentSettings, yearFull, discountTypes, enrollmentRowsByStudent, getSavedDiscountState, paidByStudent]);

  // Returns "full" | "partial" | "unpaid"
  // Connected to the same calculated balance used in the payment summary screen.
  const getPaymentStatus = useCallback((r: any): "full" | "partial" | "unpaid" | "credit" => {
    const sid = r?.students?.id;
    const stuPaid = sid ? (paidByStudent.get(sid) ?? 0) : 0;
    const balance = sid ? balanceByStudent.get(sid) : null;
    if (typeof balance === "number") {
      if (Math.round(balance) < 0) return "credit";
      if (Math.round(balance) <= 0) return "full";
      return stuPaid > 0.5 ? "partial" : "unpaid";
    }
    if (stuPaid > 0.5) return "partial";
    return "unpaid";
  }, [paidByStudent, balanceByStudent]);

  // Students with an active (pending) payment link that was generated for them
  const activeLinkByStudent = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of yearPayments as any[]) {
      if (!p.student_id) continue;
      if (p.payment_status !== "pending") continue;
      if (!p.payment_link_url) continue;
      // Keep the most recent link creation date
      const existing = map.get(p.student_id);
      const created = p.created_at || p.payment_date;
      if (!existing || new Date(created) > new Date(existing)) {
        map.set(p.student_id, created);
      }
    }
    return map;
  }, [yearPayments]);

  // Family-level links: shown for every sibling of the paying family
  const activeLinkByFamily = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of yearPayments as any[]) {
      const fam = p.family_parent_national_id ? String(p.family_parent_national_id).trim() : "";
      if (!fam) continue;
      if (p.payment_status !== "pending") continue;
      if (!p.payment_link_url) continue;
      const existing = map.get(fam);
      const created = p.created_at || p.payment_date;
      if (!existing || new Date(created) > new Date(existing)) {
        map.set(fam, created);
      }
    }
    return map;
  }, [yearPayments]);

  const getActiveLinkCreated = useCallback((r: any): string | null => {
    const s = r?.students;
    if (!s?.id) return null;
    const dates: string[] = [];
    const own = activeLinkByStudent.get(s.id);
    if (own) dates.push(own);
    [s.parent_national_id, s.parent_national_id_2].forEach((nid: string | null) => {
      const key = nid ? String(nid).trim() : "";
      const d = key ? activeLinkByFamily.get(key) : undefined;
      if (d) dates.push(d);
    });
    if (!dates.length) return null;
    return dates.sort((a, b) => +new Date(b) - +new Date(a))[0];
  }, [activeLinkByStudent, activeLinkByFamily]);

  const hasActiveLink = useCallback((r: any) => !!getActiveLinkCreated(r), [getActiveLinkCreated]);

  const getActiveLinkDate = useCallback((r: any) => {
    const created = getActiveLinkCreated(r);
    if (!created) return null;
    try {
      return format(new Date(created), "dd/MM/yyyy");
    } catch {
      return null;
    }
  }, [getActiveLinkCreated]);


  const getPaymentBalance = useCallback((r: any) => {
    const sid = r?.students?.id;
    const balance = sid ? balanceByStudent.get(sid) : null;
    return typeof balance === "number" ? Math.max(0, Math.round(balance)) : null;
  }, [balanceByStudent]);

  /** Positive number when the student is over-paid (has a credit). */
  const getCreditAmount = useCallback((r: any) => {
    const sid = r?.students?.id;
    const balance = sid ? balanceByStudent.get(sid) : null;
    return typeof balance === "number" && Math.round(balance) < 0 ? Math.abs(Math.round(balance)) : null;
  }, [balanceByStudent]);

  const renderEnsembleBadges = (items: { id: string; ensemble_id: string; name: string }[]) => {
    if (!items.length) return null;
    return (
      <div className="grid grid-cols-2 gap-1.5">
        {items.map((e) => (
          <Badge
            key={e.id}
            variant="secondary"
            className="rounded-lg text-[10px] px-1.5 py-0 gap-1 cursor-pointer hover:bg-accent w-full truncate"
            onClick={(ev) => {
              ev.stopPropagation();
              navigate(`/admin/ensembles/${e.ensemble_id}`);
            }}
            title={e.name}
          >
            <Music className="h-3 w-3 shrink-0" />
            <span className="truncate">{e.name}</span>
          </Badge>
        ))}
      </div>
    );
  };

  const { data: allStudents = [], isLoading: loadingAll } = useQuery({
    queryKey: ["admin-all-students-raw", selectedYearId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, national_id, phone, parent_name, parent_phone, city, grade, student_status, is_active, created_at, is_major_student, is_junior_track, has_music_production_course, has_recital_track");
      if (error) throw error;
      return (data ?? []).sort((a: any, b: any) =>
        `${a.last_name ?? ""} ${a.first_name ?? ""}`.localeCompare(`${b.last_name ?? ""} ${b.first_name ?? ""}`, "he")
      );
    },
  });

  const getRegStatus = (s: any): "enrolled" | "registered" | "not_registered" => {
    if (selectedYearId && (enrollmentRowsByStudent.get(s.id)?.length ?? 0) > 0) return "enrolled";
    if (registeredStudentIds.has(s.id)) return "registered";
    if (s.national_id && registeredNationalIds.has(String(s.national_id).trim())) return "registered";
    return "not_registered";
  };

  const activeStudentsCount = allStudents.filter((s: any) => s.is_active && !isInactiveStudentStatus(s.student_status) && getRegStatus(s) === "enrolled").length;
  const registeredCount = allStudents.filter((s: any) => s.is_active && !isInactiveStudentStatus(s.student_status) && getRegStatus(s) === "registered").length;
  const notRegisteredCount = allStudents.filter((s: any) => s.is_active && !isInactiveStudentStatus(s.student_status) && getRegStatus(s) === "not_registered").length;
  const stoppedCount = allStudents.filter((s: any) => !s.is_active || isInactiveStudentStatus(s.student_status)).length;
  const siblingsCount = allStudents.filter((s: any) => siblingStudentIds.has(s.id)).length;

  const filteredAll = allStudents.filter((s: any) => {
    if (search) {
      const normalize = (str: string) => (str ?? "").toLowerCase().replace(/['"׳״']/g, "").trim();
      const q = normalize(search);
      const haystack = normalize(`${s.first_name ?? ""} ${s.last_name ?? ""} ${s.national_id ?? ""} ${s.parent_name ?? ""} ${s.parent_phone ?? ""} ${s.phone ?? ""} ${s.city ?? ""} ${s.grade ?? ""}`);
      if (!haystack.includes(q)) return false;
    }
    if (cityFilter.length > 0 && !cityFilter.includes(s.city)) return false;
    if (gradeFilter.length > 0) {
      const stripMarks = (str: string) => (str ?? "").replace(/['"׳״']/g, "").trim();
      const wanted = gradeFilter.map(stripMarks);
      if (!wanted.includes(stripMarks(s.grade ?? ""))) return false;
    }
    const stopped = !s.is_active || isInactiveStudentStatus(s.student_status);
    const regStatus = getRegStatus(s);
    if (statusFilter === "active" && (stopped || regStatus !== "enrolled")) return false;
    if (statusFilter === "registered" && (stopped || regStatus !== "registered")) return false;
    if (statusFilter === "not_registered" && (stopped || regStatus !== "not_registered")) return false;
    if (statusFilter === "stopped" && !stopped) return false;
    if (trackFilter.length > 0) {
      const map: Record<string, string> = {
        music_production: "has_music_production_course",
        recital: "has_recital_track",
        major: "is_major_student",
        junior: "is_junior_track",
      };
      if (!trackFilter.some((t) => {
        const f = map[t];
        return f && s[f];
      })) return false;
    }
    if (regTypeFilter.length > 0) {
      const rt = getRegType(s);
      if (!regTypeFilter.includes(rt ?? "unknown")) return false;
    }
    if (siblingsFilter === "with" && !siblingStudentIds.has(s.id)) return false;
    return true;
  });


  const { data: allTeachers = [] } = useQuery({
    queryKey: ["admin-students-all-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, first_name, last_name")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const teachers = [...allTeachers].sort((a: any, b: any) =>
    `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "he")
  );
  const schools = [...new Map(rows.map((r: any) => [r.schools?.id, r.schools] as [string, any]).filter(([id]) => id)).values()]
    .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? "", "he"));
  const eduSchools = [...new Set(rows.map((r: any) => r.students?.educational_school).filter(Boolean))]
    .sort((a, b) => (a as string).localeCompare(b as string, "he"));
  const cities = [...new Set(rows.map((r: any) => r.students?.city).filter(Boolean))].sort((a, b) => (a as string).localeCompare(b as string, "he"));
  const durations = [...new Set(rows.map((r: any) => r.lesson_duration_minutes))].sort((a, b) => a - b);
  const instrumentOptions = [...new Set(rows.map((r: any) => r.instruments?.name).filter(Boolean))].sort((a, b) => (a as string).localeCompare(b as string, "he"));

  const filtered = rows.filter((r: any) => {
    if (search) {
      const normalize = (s: string) => s.toLowerCase().replace(/['"׳״']/g, "").trim();
      const q = normalize(search);
      const searchStr = normalize(`${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""} ${r.students?.national_id ?? ""} ${r.students?.parent_name ?? ""} ${r.students?.parent_phone ?? ""} ${r.students?.phone ?? ""} ${r.grade ?? ""} ${r.students?.grade ?? ""} ${r.students?.city ?? ""} ${r.teachers?.first_name ?? ""} ${r.teachers?.last_name ?? ""} ${r.schools?.name ?? ""} ${r.instruments?.name ?? ""} ${r.students?.playing_level ?? ""} ${r.lesson_duration_minutes ?? ""}`);
      if (!searchStr.includes(q)) return false;
    }
    if (teacherFilter.length > 0 && !teacherFilter.includes(r.teachers?.id)) return false;
    if (schoolFilter.length > 0 && !schoolFilter.includes(r.schools?.id)) return false;
    if (eduSchoolFilter.length > 0 && !eduSchoolFilter.includes(r.students?.educational_school)) return false;
    if (durationFilter.length > 0 && !durationFilter.includes(String(r.lesson_duration_minutes))) return false;
    if (cityFilter.length > 0 && !cityFilter.includes(r.students?.city)) return false;
    if (gradeFilter.length > 0) {
      const stripMarks = (s: string) => (s ?? "").replace(/['"׳״']/g, "").trim();
      const wanted = gradeFilter.map(stripMarks);
      const rowGrade = stripMarks(r.students?.grade ?? "");
      if (!wanted.includes(rowGrade)) return false;
    }
    if (levelFilter.length > 0 && !levelFilter.includes(r.students?.playing_level)) return false;
    if (statusFilter === "active" && (!r.is_active || isInactiveStudentStatus(r.students?.student_status))) return false;
    if (statusFilter === "stopped" && (r.is_active && !isInactiveStudentStatus(r.students?.student_status))) return false;
    if (paymentFilter.length > 0 && !paymentFilter.includes(getPaymentStatus(r))) return false;
    if (linkFilter.length > 0 && !linkFilter.includes(hasActiveLink(r) ? "sent" : "not_sent")) return false;
    if (trackFilter.length > 0) {
      const map: Record<string, string> = {
        music_production: "has_music_production_course",
        recital: "has_recital_track",
        major: "is_major_student",
        junior: "is_junior_track",
      };
      if (!trackFilter.some((t) => {
        const f = map[t];
        return f && r.students?.[f];
      })) return false;
    }
    if (instrumentFilter.length > 0 && !instrumentFilter.includes(r.instruments?.name)) return false;
    if (regTypeFilter.length > 0) {
      const rt = getRegType(r.students);
      if (!regTypeFilter.includes(rt ?? "unknown")) return false;
    }
    if (siblingsFilter === "with" && !siblingStudentIds.has(r.students?.id)) return false;
    return true;
  });

  return (
    <AdminLayout title="תלמידים" backPath="/admin">
      <PageTitle title="ניהול תלמידים" />
      {/* Search + New */}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:flex-1 lg:max-w-sm">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש: שם, ת.ז, הורה, טלפון, מורה, שלוחה, ישוב מגורים, כלי..."
            value={search}
            onChange={(e) => setFilter("q", e.target.value)}
            className="pr-9 h-12 rounded-xl w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:flex lg:w-auto">
          <Button variant="outline" className="h-12 rounded-xl text-base w-full lg:w-auto" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            ייבוא מאקסל
          </Button>
          <Button className="h-12 rounded-xl text-base w-full lg:w-auto" onClick={() => navigate("/admin/students/new")}>
            <Plus className="h-4 w-4" />
            תלמיד חדש
          </Button>
        </div>
      </div>

      {/* View toggle */}
      <div className="mb-4 grid w-full grid-cols-2 rounded-xl border border-border bg-card p-1 shadow-sm lg:inline-flex lg:w-auto">
        <button
          onClick={() => setFilter("view", "enrollments")}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === "enrollments" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <ListChecks className="h-4 w-4" />
          לפי שיוכים
        </button>
        <button
          onClick={() => setFilter("view", "all")}
          className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${view === "all" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Users className="h-4 w-4" />
          כל התלמידים
        </button>

      </div>

      <StudentImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Filters */}
      <div className="mb-4 grid grid-cols-2 md:grid-cols-5 lg:flex lg:flex-wrap gap-2">
        {view === "enrollments" && (
          <>
            <MultiSelectFilter
              className="w-full lg:w-40"
              allLabel="מורים"
              options={teachers.map((t: any) => t.id)}
              renderLabel={(id) => {
                const t = teachers.find((x: any) => x.id === id);
                return t ? `${t.first_name} ${t.last_name}` : id;
              }}
              value={teacherFilter}
              onChange={(v) => setMultiFilter("teacher", v)}
            />

            <MultiSelectFilter
              className="w-full lg:w-40"
              allLabel="שלוחה"
              options={schools.map((s: any) => s.id)}
              renderLabel={(id) => schools.find((s: any) => s.id === id)?.name ?? id}
              value={schoolFilter}
              onChange={(v) => setMultiFilter("school", v)}
            />

            <MultiSelectFilter
              className="w-full lg:w-40"
              allLabel="בית ספר"
              options={eduSchools as string[]}
              value={eduSchoolFilter}
              onChange={(v) => setMultiFilter("edu_school", v)}
            />

            <MultiSelectFilter
              className="w-full lg:w-36"
              allLabel="משך שיעור"
              options={durations.map(String)}
              renderLabel={(d) => `${d} דק׳`}
              value={durationFilter}
              onChange={(v) => setMultiFilter("duration", v)}
            />

            <MultiSelectFilter
              className="w-full lg:w-32"
              allLabel="רמת לימוד"
              options={["א","ב","ג"]}
              renderLabel={(l) => `רמה ${l}`}
              value={levelFilter}
              onChange={(v) => setMultiFilter("level", v)}
            />

            <MultiSelectFilter
              className="w-full lg:w-36"
              allLabel="תשלומים"
              options={["full", "partial", "unpaid", "credit"]}
              renderLabel={(k) => ({ full: "שולם במלואו", partial: "שולם חלקית", unpaid: "לא שולם", credit: "קיים זיכוי" })[k]}
              value={paymentFilter}
              onChange={(v) => setMultiFilter("payment", v)}
            />

            <MultiSelectFilter
              className="w-full lg:w-40"
              allLabel="לינק לתשלום"
              options={["sent", "not_sent"]}
              renderLabel={(k) => ({ sent: "🔗 נוצר לינק", not_sent: "ללא לינק" })[k]}
              value={linkFilter}
              onChange={(v) => setMultiFilter("link", v)}
            />
          </>
        )}

        <MultiSelectFilter
          className="w-full lg:w-36"
          allLabel="ישוב מגורים"
          options={cities as string[]}
          value={cityFilter}
          onChange={(v) => setMultiFilter("city", v)}
        />

        <MultiSelectFilter
          className="w-full lg:w-32"
          allLabel="כיתה"
          options={["א","ב","ג","ד","ה","ו","ז","ח","ט","י","יא","יב","בוגר"]}
          renderLabel={(g) => `כיתה ${g}`}
          value={gradeFilter}
          onChange={(v) => setMultiFilter("grade", v)}
        />

        <MultiSelectFilter
          className="w-full col-span-2 md:col-span-1 lg:w-44"
          allLabel="קורסים ומסלולים"
          options={["music_production", "recital", "major", "junior"]}
          renderLabel={(k) => ({ music_production: "🎚️ הפקה מוסיקלית", recital: "🎼 רסיטל י״ב", major: "🎓 מגמת המוסיקה", junior: "📘 מסלול חטיבה" })[k]}
          value={trackFilter}
          onChange={(v) => setMultiFilter("track", v)}
        />

        <MultiSelectFilter
          className="w-full lg:w-40"
          allLabel="כלי נגינה"
          options={instrumentOptions as string[]}
          value={instrumentFilter}
          onChange={(v) => setMultiFilter("instrument", v)}
        />

        <MultiSelectFilter
          className="w-full lg:w-40"
          allLabel="סוג רישום"
          options={["new", "continuing", "unknown"]}
          renderLabel={(k) => ({ new: "🆕 חדש", continuing: "🔄 ממשיך", unknown: "ללא סימון" })[k]}
          value={regTypeFilter}
          onChange={(v) => setMultiFilter("reg_type", v)}
        />

        {(teacherFilter.length > 0 || schoolFilter.length > 0 || eduSchoolFilter.length > 0 || durationFilter.length > 0 || cityFilter.length > 0 || gradeFilter.length > 0 || levelFilter.length > 0 || paymentFilter.length > 0 || linkFilter.length > 0 || trackFilter.length > 0 || instrumentFilter.length > 0 || regTypeFilter.length > 0 || siblingsFilter === "with" || statusFilter !== "active" || search) && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-11 rounded-xl gap-1 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
            נקה סינון
          </Button>
        )}

        {/* Status filter buttons */}
        <div className={`col-span-2 md:col-span-5 grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 shadow-sm lg:inline-flex lg:w-auto lg:flex-wrap lg:items-center ${view === "all" ? "md:grid-cols-4" : "md:grid-cols-2"}`}>
          {view === "all" ? (
            <>
              <button
                onClick={() => setFilter("status", "active")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition lg:flex-initial ${statusFilter === "active" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                פעילים
                <Badge variant={statusFilter === "active" ? "secondary" : "outline"} className="rounded-md text-[10px] px-1.5 py-0">
                  {activeStudentsCount}
                </Badge>
              </button>
              <button
                onClick={() => setFilter("status", "registered")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition lg:flex-initial ${statusFilter === "registered" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                נרשם - טרם שויך
                <Badge variant={statusFilter === "registered" ? "secondary" : "outline"} className="rounded-md text-[10px] px-1.5 py-0">
                  {registeredCount}
                </Badge>
              </button>
              <button
                onClick={() => setFilter("status", "not_registered")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition lg:flex-initial ${statusFilter === "not_registered" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                טרם נרשם
                <Badge variant={statusFilter === "not_registered" ? "secondary" : "outline"} className="rounded-md text-[10px] px-1.5 py-0">
                  {notRegisteredCount}
                </Badge>
              </button>
              <button
                onClick={() => setFilter("status", "stopped")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition lg:flex-initial ${statusFilter === "stopped" ? "bg-destructive text-destructive-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                הפסיקו / לא ימשיכו
                <Badge variant={statusFilter === "stopped" ? "secondary" : "outline"} className="rounded-md text-[10px] px-1.5 py-0">
                  {stoppedCount}
                </Badge>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setFilter("status", "active")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition lg:flex-initial ${statusFilter === "active" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                פעילים
              </button>
              <button
                onClick={() => setFilter("status", "stopped")}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition lg:flex-initial ${statusFilter === "stopped" ? "bg-destructive text-destructive-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                הפסיקו / לא ימשיכו
              </button>
            </>
          )}
        </div>

        {/* Siblings filter */}
        <div className="col-span-2 md:col-span-5 flex">
          <button
            onClick={() => setFilter("siblings", siblingsFilter === "with" ? "all" : "with")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition lg:flex-initial lg:w-auto ${
              siblingsFilter === "with"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            משפחות עם אחים
            <Badge variant={siblingsFilter === "with" ? "secondary" : "outline"} className="rounded-md text-[10px] px-1.5 py-0">
              {siblingsCount}
            </Badge>
          </button>
        </div>
      </div>

      {/* Card-based list */}
      {view === "all" ? (
        loadingAll ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filteredAll.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">לא נמצאו תלמידים</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-2">
              {filteredAll.length} תלמידים · {activeStudentsCount} פעילים בסך הכול
            </p>
            <div className="space-y-2">
              {filteredAll.map((s: any, index: number) => {
                const stopped = !s.is_active || isInactiveStudentStatus(s.student_status);
                const hasActiveEnrollment = selectedYearId && (enrollmentRowsByStudent.get(s.id)?.length ?? 0) > 0;
                const isRegistered = hasActiveEnrollment || registeredStudentIds.has(s.id) || (s.national_id && registeredNationalIds.has(String(s.national_id).trim()));
                return (
                  <div
                    key={s.id}
                    onClick={() => {
                      saveListScrollPosition("/admin/students");
                      navigate(`/admin/students/${s.id}`, {
                        state: { returnTo: `${location.pathname}${location.search}` },
                      });
                    }}
                    className={`flex flex-col sm:flex-row sm:items-stretch gap-3 rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99] ${stopped ? "opacity-60" : ""}`}
                  >
                    {/* Right half — name + details */}
                    <div className="flex items-start gap-3 sm:basis-1/2 sm:min-w-0">
                      <span className="text-xs text-muted-foreground w-6 shrink-0 text-center pt-0.5">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                          <span>{s.first_name} {s.last_name}</span>
                          {(() => {
                            const rt = getRegType(s);
                            if (rt === "new") return <Badge variant="outline" className="rounded-lg text-[10px] px-1.5 py-0 text-emerald-700 border-emerald-400 bg-emerald-50">🆕 חדש</Badge>;
                            if (rt === "continuing") return <Badge variant="outline" className="rounded-lg text-[10px] px-1.5 py-0 text-sky-700 border-sky-400 bg-sky-50">🔄 ממשיך</Badge>;
                            return null;
                          })()}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                          {s.national_id && <span>ת.ז {s.national_id}</span>}
                          {s.grade && (<><span>·</span><span>כיתה {s.grade}</span></>)}
                          {s.city && (<><span>·</span><span>{s.city}</span></>)}
                          {s.parent_name && (<><span>·</span><span>{s.parent_name}</span></>)}
                          {s.parent_phone && (<><span>·</span><PhoneDisplay phone={s.parent_phone} stopPropagation textClassName="text-sm text-muted-foreground" /></>)}
                        </div>
                      </div>
                    </div>

                    {/* Left half — split: ensembles (right) + status/tracks (left) */}
                    <div className="flex flex-col sm:flex-row gap-2 w-full sm:basis-1/2 sm:min-w-0">
                      <div className="flex flex-col items-start sm:items-end gap-1.5 sm:basis-1/2 sm:min-w-0">
                        {renderEnsembleBadges(ensemblesByStudent.get(s.id) || [])}
                      </div>
                      <div className="flex flex-col items-start sm:items-end gap-1.5 sm:basis-1/2 sm:min-w-0">
                        <div className="flex flex-wrap items-start justify-start sm:justify-end content-start gap-1.5 w-full">
                          {s.is_major_student && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">🎓 מגמת המוסיקה</Badge>}
                          {s.is_junior_track && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">📘 מסלול חטיבה</Badge>}
                          {s.has_music_production_course && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">🎚️ הפקה</Badge>}
                          {s.has_recital_track && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">🎼 רסיטל י״ב</Badge>}
                        </div>
                        <div className="flex flex-wrap items-start justify-start sm:justify-end content-start gap-1.5 w-full">
                          {(() => {
                            if (isInactiveStudentStatus(s.student_status)) {
                              return <Badge variant="outline" className="rounded-lg text-destructive border-destructive">{s.student_status}</Badge>;
                            }
                            if (!s.is_active) {
                              return <Badge variant="outline" className="rounded-lg">לא פעיל</Badge>;
                            }
                            if (hasActiveEnrollment) {
                              return <Badge variant="default" className="rounded-lg">פעיל</Badge>;
                            }
                            if (isRegistered) {
                              return <Badge variant="outline" className="rounded-lg text-sky-600 border-sky-400">נרשם - טרם שויך</Badge>;
                            }
                            return <Badge variant="outline" className="rounded-lg text-amber-600 border-amber-400">טרם נרשם</Badge>;
                          })()}
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          </>
        )
      ) : isLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {rows.length === 0 && selectedYear
            ? `אין נתונים לשנת ${selectedYear.name}`
            : "לא נמצאו תלמידים"}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-2">{filtered.length} תלמידים</p>
          <div className="space-y-2">
            {filtered.map((r: any, index: number) => {
              const payStatus = getPaymentStatus(r);
              const payBalance = getPaymentBalance(r);
              const payCredit = getCreditAmount(r);
              const payLabel = payStatus === "credit"
                ? `קיים זיכוי · ₪${(payCredit ?? 0).toLocaleString()}`
                : payStatus === "full"
                ? "שולם"
                : payStatus === "partial"
                ? `שולם חלקית${payBalance ? ` · יתרה ₪${payBalance.toLocaleString()}` : ""}`
                : payBalance ? `לא שולם · יתרה ₪${payBalance.toLocaleString()}` : "לא שולם";
              const payClass = payStatus === "credit"
                ? "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700"
                : payStatus === "full"
                ? "bg-green-500/10 text-green-700 border-green-500/30"
                : payStatus === "partial"
                ? "bg-amber-500/10 text-amber-700 border-amber-500/30"
                : "bg-destructive/10 text-destructive border-destructive/30";
              return (
                <div
                  key={r.id}
                  onClick={() => {
                    saveListScrollPosition("/admin/students");
                    navigate(`/admin/students/${r.students?.id}`, {
                      state: { returnTo: `${location.pathname}${location.search}` },
                    });
                  }}
                  className={`flex flex-col sm:flex-row sm:items-stretch gap-3 rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99] ${!r.students?.is_active ? "opacity-50" : ""}`}
                >
                  {/* Right half — name + details */}
                  <div className="flex items-start gap-3 sm:basis-1/2 sm:min-w-0">
                    <span className="text-xs text-muted-foreground w-6 shrink-0 text-center pt-0.5">{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground flex items-center gap-1.5 flex-wrap">
                        <span>{r.students?.first_name} {r.students?.last_name}</span>
                        {(() => {
                          const rt = getRegType(r.students);
                          if (rt === "new") return <Badge variant="outline" className="rounded-lg text-[10px] px-1.5 py-0 text-emerald-700 border-emerald-400 bg-emerald-50">🆕 חדש</Badge>;
                          if (rt === "continuing") return <Badge variant="outline" className="rounded-lg text-[10px] px-1.5 py-0 text-sky-700 border-sky-400 bg-sky-50">🔄 ממשיך</Badge>;
                          return null;
                        })()}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
                        <span>{r.instruments?.name}</span>
                        <span>·</span>
                        <span>{r.schools?.name}</span>
                        <span>·</span>
                        <span>{r.lesson_duration_minutes} דק׳</span>
                        {r.teachers && (
                          <>
                            <span>·</span>
                            <span>{r.teachers.first_name} {r.teachers.last_name}</span>
                          </>
                        )}
                        {(r.grade ?? r.students?.grade) && (
                          <>
                            <span>·</span>
                            <span className={r.students?.grade === "יב" || r.students?.grade === "בוגר" ? "font-bold text-amber-600 dark:text-amber-400" : ""}>
                              כיתה {r.students?.grade}
                            </span>
                            {r.grade && r.grade !== r.students?.grade && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600 dark:text-amber-400">
                                שיוך: {r.grade}
                              </Badge>
                            )}
                          </>
                        )}
                        {r.students?.playing_level && (
                          <>
                            <span>·</span>
                            <span>רמה {r.students.playing_level}</span>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-muted-foreground">
                        {r.students?.parent_name && <span>{r.students.parent_name}</span>}
                        {r.students?.parent_phone && (
                          <>
                            <span>·</span>
                            <PhoneDisplay phone={r.students.parent_phone} stopPropagation textClassName="text-sm text-muted-foreground" />
                          </>
                        )}
                        {r.students?.city && (
                          <>
                            <span>·</span>
                            <span>{r.students.city}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Left half — split: ensembles (right) + status/payment (left) */}
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:basis-1/2 sm:min-w-0">
                    {/* Ensembles */}
                    <div className="flex flex-col items-start sm:items-end gap-1.5 sm:basis-1/2 sm:min-w-0">
                      {renderEnsembleBadges(ensemblesByEnrollment.get(r.id) || [])}
                    </div>
                    {/* Status + payment + tracks */}
                    <div className="flex flex-col items-start sm:items-end gap-1.5 sm:basis-1/2 sm:min-w-0">
                      <div className="flex flex-wrap items-start justify-start sm:justify-end content-start gap-1.5 w-full">
                        {r.students?.is_major_student && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">🎓 מגמת המוסיקה</Badge>}
                        {r.students?.is_junior_track && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">📘 מסלול חטיבה</Badge>}
                        {r.students?.has_music_production_course && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">🎚️ הפקה</Badge>}
                        {r.students?.has_recital_track && <Badge variant="secondary" className="rounded-lg text-[10px] px-1.5 py-0">🎼 רסיטל י״ב</Badge>}
                      </div>
                      <div className="flex flex-wrap items-start justify-start sm:justify-end content-start gap-1.5 w-full">
                        <Badge variant="outline" className={`rounded-lg text-xs ${payClass}`}>
                          {payLabel}
                        </Badge>
                        <Badge variant={(!r.is_active || isInactiveStudentStatus(r.students?.student_status)) ? "outline" : "default"} className={`rounded-lg ${(!r.is_active || isInactiveStudentStatus(r.students?.student_status)) ? "text-destructive border-destructive" : ""}`}>
                          {!r.is_active ? "רישום לא פעיל" : isInactiveStudentStatus(r.students?.student_status) ? r.students?.student_status : "פעיל"}
                        </Badge>
                      </div>
                      {hasActiveLink(r) && (
                        <div className="flex flex-wrap items-start justify-start sm:justify-end content-start gap-1.5 w-full">
                          <Badge variant="outline" className="rounded-lg text-[10px] px-1.5 py-0 bg-sky-500/10 text-sky-700 border-sky-500/30">
                            🔗 נוצר לינק לתשלום ונשלח להורה
                            {getActiveLinkDate(r) && ` · ${getActiveLinkDate(r)}`}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminStudents;
