import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Send, ExternalLink, Copy, X, Mail } from "lucide-react";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { calcEnrollment, type CalcRow } from "@/lib/paymentCalc";
import { computeStandardDiscounts, type DiscountType } from "@/lib/discounts";
import { toast } from "sonner";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import StudentPaymentsSection from "@/components/admin/StudentPaymentsSection";

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

  const paymentsList = useMemo(
    () => (allStudentPayments as any[]).filter((p) => (p.payment_status ?? "paid") !== "pending"),
    [allStudentPayments],
  );
  const pendingPayments = useMemo(
    () => (allStudentPayments as any[]).filter((p) => p.payment_status === "pending"),
    [allStudentPayments],
  );

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

  // localStorage key for persisting discount selections per student+year
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
  const [hydratedFromPending, setHydratedFromPending] = useState<boolean>(!!lsInitial);

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

  // Hydrate from legacy localStorage keys once discountTypes are loaded
  useEffect(() => {
    if (!lsInitial || !discountTypes.length) return;
    if (Array.isArray(lsInitial.selectedDiscountIds)) return;
    const mapped = mapLegacy(lsInitial);
    if (mapped.length) setSelectedDiscountIds(mapped);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountTypes.length]);

  useEffect(() => {
    if (!student?.is_major_student || lsInitial || !discountTypes.length) return;
    const dt = discountTypes.find((d) => d.legacy_key === "major_student");
    if (dt) setSelectedDiscountIds((prev) => (prev.includes(dt.id) ? prev : [...prev, dt.id]));
  }, [student, discountTypes]);

  // Hydrate discount state from the most recent payment (pending or paid) so
  // reopening the card shows the same discounts that were used previously.
  useEffect(() => {
    if (hydratedFromPending || !discountTypes.length) return;
    const source =
      (pendingPayments && pendingPayments[0]) ||
      ((allStudentPayments as any[]).find((p) => {
        const br = p?.enrollment_breakdown;
        return br && !Array.isArray(br) && br.discounts;
      }) as any);
    if (!source) return;
    const br = source?.enrollment_breakdown;
    const d = br && !Array.isArray(br) ? br.discounts : null;
    if (d && typeof d === "object") {
      const mapped = mapLegacy(d);
      if (mapped.length) setSelectedDiscountIds(mapped);
      if (Array.isArray(d.customDiscounts)) setCustomDiscounts(d.customDiscounts);
      if (d.startDateOverrides && typeof d.startDateOverrides === "object") {
        setStartDateOverrides(d.startDateOverrides);
      }
    }
    setHydratedFromPending(true);
  }, [pendingPayments, allStudentPayments, hydratedFromPending, discountTypes]);

  // Persist discounts whenever they change
  useEffect(() => {
    if (!lsKey) return;
    try {
      localStorage.setItem(lsKey, JSON.stringify({
        selectedDiscountIds, customDiscounts, startDateOverrides,
      }));
    } catch { /* ignore quota errors */ }
  }, [lsKey, selectedDiscountIds, customDiscounts, startDateOverrides]);

  const toggleDiscount = (id: string) => {
    setSelectedDiscountIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
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
  );

  const rowsAfterStd = rows.map((r) => {
    const pct = stdCompute.perEnrollmentPct.get(r.enrollmentId) ?? 0;
    return { ...r, afterStd: Math.round(r.prorated * (1 - pct / 100) * 100) / 100 };
  });

  const afterStdDiscount = stdCompute.afterStdDiscount;
  // For display/payload — effective overall discount %
  const stdDiscountPct = proratedTotal > 0 ? ((proratedTotal - afterStdDiscount) / proratedTotal) * 100 : 0;

  // Custom discounts: each is either a percentage of afterStdDiscount, or a flat ILS amount
  const customDiscountAmount = customDiscounts.reduce((sum, c) => {
    const v = Number(c.value) || 0;
    if (c.mode === "pct") return sum + (afterStdDiscount * v) / 100;
    return sum + v;
  }, 0);

  // Malkar (Non-Profit) — no VAT charged. Kept fields zeroed for backward compatibility.
  const totalIncVat = Math.max(0, Math.round((afterStdDiscount - customDiscountAmount) * 100) / 100);
  const totalDiscountAmount = Math.round((proratedTotal - totalIncVat) * 100) / 100;
  const vatRate = 0;
  const beforeVat = totalIncVat;
  const vatAmount = 0;

  const effectivePaid = paymentsAggr?.net ?? 0;
  const balance = Math.round((totalIncVat - effectivePaid) * 100) / 100;
  const isFullyPaid = totalIncVat > 0 && balance <= 0;

  const [generatingLink, setGeneratingLink] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [generatedPaymentData, setGeneratedPaymentData] = useState<{ url: string; amount: number; paymentId: string } | null>(null);

  const buildPaylinkPayload = () => {
    const enrollmentLabels = rowsAfterStd.map((r) => {
      const e = enrollments?.find((x: any) => x.id === r.enrollmentId);
      return [
        e?.instruments?.name ?? "—",
        e?.schools?.name ? `· ${e.schools.name}` : "",
        e?.lesson_duration_minutes ? `· ${e.lesson_duration_minutes} דק׳` : "",
      ].filter(Boolean).join(" ");
    });

    const yearName = year?.name ?? "";
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

    stdCompute.lines.forEach((dl) => {
      if (dl.amount <= 0) return;
      lines.push({
        description: `${dl.label}${yearSuffix} (${dl.percentage}%)`,
        amount: -(Math.round(dl.amount * 100) / 100),
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
      academicYearId: yearId,
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
      const data = await callGeneratePaylink();
      setGeneratedPaymentData(data);
      try { await navigator.clipboard.writeText(data.url); } catch { /* clipboard may be unavailable */ }
      window.open(data.url, "_blank");
      toast.success("קישור התשלום נוצר והועתק ללוח");
      queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] });
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
    if (p?.link_url) {
      return { url: p.link_url as string, amount: Number(p.amount || 0), paymentId: p.id as string };
    }
    return null;
  }, [generatedPaymentData, pendingPayments]);

  const handleSendByEmail = async () => {
    if (!student || !studentId) return;
    const parentEmail = student.parent_email;
    if (!parentEmail) {
      toast.error("אין מייל הורה רשום לתלמיד זה");
      return;
    }
    if (!activePaymentLink) {
      toast.error("יש ליצור קישור תשלום תחילה");
      return;
    }
    setSendingEmail(true);
    try {
      const hebrewYear = toHebrewYear(year?.name ?? "");
      const { error: emailError } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "payment-link",
          recipientEmail: parentEmail,
          templateData: {
            parentName: student.parent_name || "",
            studentName: `${student.first_name ?? ""} ${student.last_name ?? ""}`.trim(),
            yearName: hebrewYear || year?.name || "",
            amount: activePaymentLink.amount,
            paymentUrl: activePaymentLink.url,
          },
        },
      });
      if (emailError) throw emailError;
      toast.success(`קישור התשלום נשלח בהצלחה למייל ${parentEmail}`);
      queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] });
    } catch (e: any) {
      console.error("[sendPaymentLinkByEmail]", e);
      toast.error(`שגיאה בשליחת קישור למייל: ${e?.message ?? e}`);
    } finally {
      setSendingEmail(false);
    }
  };

  if (loadingStudent || loadingEnrollments || !settings || !yearFull) {
    return (
      <AdminLayout title="חשב/צור תשלום" backPath={`/admin/students/${studentId}`}>
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </AdminLayout>
    );
  }

  if (!student) {
    return (
      <AdminLayout title="חשב/צור תשלום" backPath={`/admin/students/${studentId}`}>
        <p className="text-center text-muted-foreground py-12">תלמיד לא נמצא</p>
      </AdminLayout>
    );
  }

  const hasMissing = rows.some((r) => r.source === "missing");

  return (
    <AdminLayout title="חשב/צור תשלום" backPath={`/admin/students/${studentId}`}>
      <div className="space-y-5">
        {/* Student & Parent header */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <h2 className="font-semibold text-foreground text-base mb-2">תלמיד</h2>
              <p className="text-sm"><span className="text-muted-foreground">שם:</span> {student.first_name} {student.last_name}</p>
              <p className="text-sm"><span className="text-muted-foreground">ת.ז.:</span> {student.national_id ?? "—"}</p>
              <p className="text-sm"><span className="text-muted-foreground">כיתה:</span> {student.grade ?? "—"}</p>
              <p className="text-sm"><span className="text-muted-foreground">עיר:</span> {student.city ?? "—"}</p>
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
                const scopeNote = d.applies_to === "cheapest_enrollment" ? " · על הרישום הזול ביותר" : "";
                return (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/30"
                  >
                    <Checkbox checked={checked} onCheckedChange={() => toggleDiscount(d.id)} />
                    <span className="text-sm">
                      {d.label} ({Number(d.percentage)}%{scopeNote})
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>הנחות מותאמות</Label>
              <Button variant="outline" size="sm" className="rounded-xl h-9" onClick={() => setCustomDiscounts([...customDiscounts, { label: "", value: "", mode: "pct" }])}>
                <Plus className="h-3.5 w-3.5" /> הוסף
              </Button>
            </div>
            {customDiscounts.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_110px_90px_44px] gap-2">
                <Input placeholder="תיאור" value={c.label} onChange={(e) => {
                  const arr = [...customDiscounts]; arr[i] = { ...arr[i], label: e.target.value }; setCustomDiscounts(arr);
                }} className="h-11 rounded-xl" />
                <Input
                  placeholder={c.mode === "pct" ? "%" : "₪"}
                  type="number"
                  min="0"
                  value={c.value}
                  onChange={(e) => {
                    const arr = [...customDiscounts]; arr[i] = { ...arr[i], value: e.target.value }; setCustomDiscounts(arr);
                  }}
                  className="h-11 rounded-xl"
                />
                <Select value={c.mode} onValueChange={(v) => {
                  const arr = [...customDiscounts]; arr[i] = { ...arr[i], mode: v as "pct" | "amount" }; setCustomDiscounts(arr);
                }}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pct">אחוזים</SelectItem>
                    <SelectItem value="amount">סכום ₪</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl text-destructive" onClick={() => setCustomDiscounts(customDiscounts.filter((_, idx) => idx !== i))}>
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
          {stdCompute.lines.map((dl) =>
            dl.amount > 0 ? (
              <SummaryRow
                key={dl.discountTypeId}
                label={`${dl.label} (${dl.percentage}%${dl.applies_to === "cheapest_enrollment" ? " על הרישום הזול ביותר" : ""})`}
                value={-(Math.round(dl.amount * 100) / 100)}
              />
            ) : null
          )}
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
          <div className="pt-3 border-t border-primary/20 flex flex-wrap justify-end gap-2">
            <Button
              variant="outline"
              className="h-12 rounded-xl px-5"
              onClick={handleSendByEmail}
              disabled={generatingLink || sendingEmail || !student?.parent_email || !activePaymentLink}
            >
              {sendingEmail ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Mail className="h-4 w-4 ml-2" />}
              {sendingEmail ? "שולח מייל..." : "שלח למייל ההורה"}
            </Button>
            <Button
              className="h-12 rounded-xl px-6"
              onClick={handleGenerateLink}
              disabled={rows.length === 0 || balance <= 0 || generatingLink || sendingEmail}
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
                  <p className="font-medium text-foreground text-sm">₪{Number(p.amount).toLocaleString()} · ממתין לתשלום</p>
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
                      else { toast.success("הקישור בוטל ודף הסליקה נמחק"); queryClient.invalidateQueries({ queryKey: ["calc-payments", studentId] }); }
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
