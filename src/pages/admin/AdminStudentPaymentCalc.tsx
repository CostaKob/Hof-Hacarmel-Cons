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
import { Loader2, Plus, Trash2, Send } from "lucide-react";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { calcEnrollment, totalDiscountPct, type CalcRow } from "@/lib/paymentCalc";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import StudentPaymentsSection from "@/components/admin/StudentPaymentsSection";

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
        .eq("academic_year_id", yearId!)
        .eq("is_active", true);
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

  const { data: paymentsList = [] } = useQuery({
    queryKey: ["calc-payments", studentId, yearId],
    enabled: !!studentId && !!yearId,
    queryFn: async () => {
      const { data: enrs } = await supabase.from("enrollments").select("id").eq("student_id", studentId!);
      const ids = (enrs ?? []).map((e) => e.id);
      const query = supabase
        .from("student_payments")
        .select("*")
        .eq("academic_year_id", yearId!)
        .order("payment_date", { ascending: false });
      const { data, error } = ids.length > 0
        ? await query.or(`student_id.eq.${studentId},enrollment_id.in.(${ids.join(",")})`)
        : await query.eq("student_id", studentId!);
      if (error) throw error;
      return data ?? [];
    },
  });

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

  // Discount state
  const [sibling, setSibling] = useState(false);
  const [secondInstrument, setSecondInstrument] = useState(false);
  const [majorStudent, setMajorStudent] = useState(false);
  const [customDiscounts, setCustomDiscounts] = useState<{ label: string; value: string; mode: "pct" | "amount" }[]>([]);

  const [startDateOverrides, setStartDateOverrides] = useState<Record<string, string>>({});


  useEffect(() => {
    if (student?.is_major_student) setMajorStudent(true);
  }, [student]);

  const rows: CalcRow[] = useMemo(() => {
    if (!enrollments || !yearFull || !settings) return [];
    const prices = settings.lesson_prices ?? {};
    return enrollments.map((e: any) =>
      calcEnrollment(
        {
          id: e.id,
          duration: e.lesson_duration_minutes,
          startDate: startDateOverrides[e.id] ?? e.start_date,
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

  const discountRates = {
    sibling: Number(yearFull?.discount_sibling_pct ?? 0),
    secondInstrument: Number(yearFull?.discount_second_instrument_pct ?? 0),
    majorStudent: Number(yearFull?.discount_major_student_pct ?? 0),
  };

  // Discounts that apply on ALL enrollments
  const globalDiscountPct =
    (sibling ? discountRates.sibling : 0) +
    (majorStudent ? discountRates.majorStudent : 0);

  // "Second instrument" discount applies ONLY to one enrollment (the cheapest one),
  // not to all. Active only when there are 2+ enrollments.
  const secondInstrumentEnrollmentId =
    secondInstrument && rows.length >= 2
      ? [...rows].sort((a, b) => a.prorated - b.prorated)[0].enrollmentId
      : null;

  const rowsAfterStd = rows.map((r) => {
    const pct =
      globalDiscountPct +
      (r.enrollmentId === secondInstrumentEnrollmentId ? discountRates.secondInstrument : 0);
    return { ...r, afterStd: Math.round(r.prorated * (1 - pct / 100)) };
  });

  const afterStdDiscount = rowsAfterStd.reduce((s, r) => s + r.afterStd, 0);
  // For display/payload — effective overall discount %
  const stdDiscountPct = proratedTotal > 0 ? ((proratedTotal - afterStdDiscount) / proratedTotal) * 100 : 0;

  // Custom discounts: each is either a percentage of afterStdDiscount, or a flat ILS amount
  const customDiscountAmount = customDiscounts.reduce((sum, c) => {
    const v = Number(c.value) || 0;
    if (c.mode === "pct") return sum + (afterStdDiscount * v) / 100;
    return sum + v;
  }, 0);

  // Malkar (Non-Profit) — no VAT charged. Kept fields zeroed for backward compatibility.
  const totalIncVat = Math.max(0, Math.round(afterStdDiscount - customDiscountAmount));
  const totalDiscountAmount = proratedTotal - totalIncVat;
  const vatRate = 0;
  const beforeVat = totalIncVat;
  const vatAmount = 0;

  const effectivePaid = paymentsAggr?.net ?? 0;
  const balance = totalIncVat - effectivePaid;
  const isFullyPaid = totalIncVat > 0 && balance <= 0;

  const handleGenerateLink = async () => {
    if (!student) return;
    const payload = {
      customer: {
        name: student.parent_name,
        email: student.parent_email,
        phone: student.parent_phone,
        national_id: student.parent_national_id,
      },
      student: {
        name: `${student.first_name} ${student.last_name}`,
        national_id: student.national_id,
      },
      lines: rows.map((r) => {
        const e = enrollments?.find((x: any) => x.id === r.enrollmentId);
        return {
          description: `${e?.instruments?.name ?? "—"} — ${e?.schools?.name ?? "—"} (${e?.lesson_duration_minutes} דק׳)`,
          lessons: r.lessonsRemaining,
          price_per_lesson: r.pricePerLesson,
          amount: r.prorated,
        };
      }),
      discounts: {
        sibling: sibling ? discountRates.sibling : 0,
        second_instrument: secondInstrument ? discountRates.secondInstrument : 0,
        major_student: majorStudent ? discountRates.majorStudent : 0,
        custom: customDiscounts.map((c) => ({ label: c.label, mode: c.mode, value: Number(c.value) || 0 })),
        std_total_pct: stdDiscountPct,
        custom_total_amount: Math.round(customDiscountAmount),
        total_discount_amount: totalDiscountAmount,
      },
      before_vat: beforeVat,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total_inc_vat: totalIncVat,
      already_paid: effectivePaid,
      balance,
    };
    // eslint-disable-next-line no-console
    console.log("[generateICountLink] Payload:", JSON.stringify(payload, null, 2));
    toast.success("התשתית מוכנה — קישור התשלום ייווצר כאן לאחר חיבור iCount");
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
                          ₪{r.annualBase.toLocaleString()}
                          {r.source === "override" && <span className="text-[10px] text-muted-foreground mr-1">(override)</span>}
                          {r.source === "missing" && <span className="text-[10px] text-destructive mr-1">(חסר מחיר)</span>}
                        </TableCell>
                        
                        <TableCell>{r.lessonsRemaining} / {r.lessonsTotal}</TableCell>
                        <TableCell className="font-medium">₪{r.prorated.toLocaleString()}</TableCell>
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
          <h2 className="font-semibold text-foreground text-base">הנחות</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="flex items-center gap-2 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/30">
              <Checkbox checked={sibling} onCheckedChange={(v) => setSibling(!!v)} />
              <span className="text-sm">אח שני ({discountRates.sibling}%)</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/30">
              <Checkbox checked={secondInstrument} onCheckedChange={(v) => setSecondInstrument(!!v)} />
              <span className="text-sm">כלי שני ({discountRates.secondInstrument}%)</span>
            </label>
            <label className="flex items-center gap-2 rounded-xl border border-border p-3 cursor-pointer hover:bg-muted/30">
              <Checkbox checked={majorStudent} onCheckedChange={(v) => setMajorStudent(!!v)} />
              <span className="text-sm">תלמיד מגמה ({discountRates.majorStudent}%)</span>
            </label>
          </div>

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
          <div className="border-t border-primary/20 pt-2 mt-2" />
          {rows.map((r) => {
            const e = enrollments?.find((x: any) => x.id === r.enrollmentId);
            const label = `${e?.instruments?.name ?? "—"} — ${e?.schools?.name ?? "—"} (${r.lessonsRemaining}/${r.lessonsTotal})`;
            return <SummaryRow key={`pro-${r.enrollmentId}`} label={label} value={r.prorated} />;
          })}
          <SummaryRow label={`סה״כ חישוב לפי שיעורים נותרים (${lessonsRemainingTotal} מתוך ${lessonsTotalAll})`} value={proratedTotal} bold />
          {sibling && discountRates.sibling > 0 && (
            <SummaryRow label={`הנחת אחים (${discountRates.sibling}%)`} value={-Math.round(proratedTotal * discountRates.sibling / 100)} />
          )}
          {secondInstrument && discountRates.secondInstrument > 0 && (
            <SummaryRow label={`הנחת כלי שני (${discountRates.secondInstrument}%)`} value={-Math.round(proratedTotal * discountRates.secondInstrument / 100)} />
          )}
          {majorStudent && discountRates.majorStudent > 0 && (
            <SummaryRow label={`הנחת מגמה (${discountRates.majorStudent}%)`} value={-Math.round(proratedTotal * discountRates.majorStudent / 100)} />
          )}
          {customDiscounts.map((c, i) => {
            const v = Number(c.value) || 0;
            if (!v) return null;
            const amount = c.mode === "pct" ? Math.round(afterStdDiscount * v / 100) : v;
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
          {isFullyPaid && (
            <div className="mt-2 rounded-xl bg-primary/15 border border-primary/40 px-3 py-2 text-center">
              <span className="text-sm font-semibold text-primary">✓ שולם במלואו</span>
            </div>
          )}
        </div>

        <StudentPaymentsSection
          studentId={studentId!}
          payments={paymentsList as any[]}
          enrollments={enrollments ?? []}
        />

        {/* Generate iCount link */}
        <div className="flex justify-end">
          <Button className="h-12 rounded-xl px-6" onClick={handleGenerateLink} disabled={rows.length === 0 || balance <= 0}>
            <Send className="h-4 w-4 ml-2" /> צור קישור לתשלום
          </Button>
        </div>

      </div>
    </AdminLayout>
  );
};

const SummaryRow = ({ label, value, bold, large, highlight }: { label: string; value: number; bold?: boolean; large?: boolean; highlight?: boolean }) => (
  <div className="flex items-center justify-between">
    <span className={`${bold ? "font-semibold" : ""} ${large ? "text-base" : "text-sm"} text-foreground`}>{label}</span>
    <span className={`${bold ? "font-bold" : ""} ${large ? "text-lg" : "text-sm"} ${highlight ? "text-primary" : "text-foreground"}`}>
      ₪{value.toLocaleString()}
    </span>
  </div>
);

export default AdminStudentPaymentCalc;
