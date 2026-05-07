import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus, Trash2, Send } from "lucide-react";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { calcEnrollment, totalDiscountPct, type CalcRow } from "@/lib/paymentCalc";
import { toast } from "sonner";

const AdminStudentPaymentCalc = () => {
  const { studentId } = useParams<{ studentId: string }>();
  const navigate = useNavigate();
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

  const { data: paymentsAggr } = useQuery({
    queryKey: ["calc-payments", studentId, yearId],
    enabled: !!studentId && !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_payments")
        .select("amount, transaction_type")
        .eq("student_id", studentId!)
        .eq("academic_year_id", yearId!);
      if (error) throw error;
      let paid = 0;
      let credit = 0;
      for (const r of data ?? []) {
        if ((r as any).transaction_type === "payment") paid += Number((r as any).amount);
        else if ((r as any).transaction_type === "credit") credit += Number((r as any).amount);
      }
      return { net: paid - credit, paid, credit };
    },
  });

  // Discount state
  const [sibling, setSibling] = useState(false);
  const [secondInstrument, setSecondInstrument] = useState(false);
  const [majorStudent, setMajorStudent] = useState(false);
  const [customDiscounts, setCustomDiscounts] = useState<{ label: string; pct: string }[]>([]);

  const [paidOverride, setPaidOverride] = useState<string>("");
  const [paidOverrideEnabled, setPaidOverrideEnabled] = useState(false);

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
          startDate: e.start_date,
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
  }, [enrollments, yearFull, settings]);

  const annualTotal = rows.reduce((s, r) => s + r.annualBase, 0);
  const proratedTotal = rows.reduce((s, r) => s + r.prorated, 0);

  const discountRates = {
    sibling: Number(yearFull?.discount_sibling_pct ?? 0),
    secondInstrument: Number(yearFull?.discount_second_instrument_pct ?? 0),
    majorStudent: Number(yearFull?.discount_major_student_pct ?? 0),
  };

  const totalDiscount = totalDiscountPct(
    {
      sibling,
      secondInstrument,
      majorStudent,
      custom: customDiscounts.map((c) => ({ label: c.label, pct: Number(c.pct) || 0 })),
    },
    discountRates
  );

  const afterDiscounts = Math.round(proratedTotal * (1 - totalDiscount / 100));
  const vatRate = Number(settings?.vat_rate ?? 18);
  const vatAmount = Math.round(afterDiscounts * (vatRate / 100));
  const totalIncVat = afterDiscounts + vatAmount;

  const autoPaid = paymentsAggr?.net ?? 0;
  const effectivePaid = paidOverrideEnabled ? Number(paidOverride) || 0 : autoPaid;
  const balance = totalIncVat - effectivePaid;

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
          months: r.monthsRemaining,
          amount: r.prorated,
        };
      }),
      discounts: {
        sibling: sibling ? discountRates.sibling : 0,
        second_instrument: secondInstrument ? discountRates.secondInstrument : 0,
        major_student: majorStudent ? discountRates.majorStudent : 0,
        custom: customDiscounts.map((c) => ({ label: c.label, pct: Number(c.pct) || 0 })),
        total_pct: totalDiscount,
      },
      after_discounts: afterDiscounts,
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
      <AdminLayout title="חישוב תשלום" backPath={`/admin/students/${studentId}`}>
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </AdminLayout>
    );
  }

  if (!student) {
    return (
      <AdminLayout title="חישוב תשלום" backPath={`/admin/students/${studentId}`}>
        <p className="text-center text-muted-foreground py-12">תלמיד לא נמצא</p>
      </AdminLayout>
    );
  }

  const hasMissing = rows.some((r) => r.source === "missing");

  return (
    <AdminLayout title="חישוב תשלום" backPath={`/admin/students/${studentId}`}>
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
              <p className="text-sm"><span className="text-muted-foreground">טלפון:</span> {student.parent_phone ?? "—"}</p>
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
                    <TableHead className="text-right">חודשים נותרים</TableHead>
                    <TableHead className="text-right">פרו-ראטה</TableHead>
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
                        <TableCell>{e?.start_date ?? "—"}</TableCell>
                        <TableCell>
                          ₪{r.annualBase.toLocaleString()}
                          {r.source === "override" && <span className="text-[10px] text-muted-foreground mr-1">(override)</span>}
                          {r.source === "missing" && <span className="text-[10px] text-destructive mr-1">(חסר מחיר)</span>}
                        </TableCell>
                        <TableCell>{r.monthsRemaining} / {r.monthsTotal}</TableCell>
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
              <Button variant="outline" size="sm" className="rounded-xl h-9" onClick={() => setCustomDiscounts([...customDiscounts, { label: "", pct: "" }])}>
                <Plus className="h-3.5 w-3.5" /> הוסף
              </Button>
            </div>
            {customDiscounts.map((c, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_44px] gap-2">
                <Input placeholder="תיאור" value={c.label} onChange={(e) => {
                  const arr = [...customDiscounts]; arr[i] = { ...arr[i], label: e.target.value }; setCustomDiscounts(arr);
                }} className="h-11 rounded-xl" />
                <Input placeholder="%" type="number" min="0" max="100" value={c.pct} onChange={(e) => {
                  const arr = [...customDiscounts]; arr[i] = { ...arr[i], pct: e.target.value }; setCustomDiscounts(arr);
                }} className="h-11 rounded-xl" />
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
          <SummaryRow label="בסיס שנתי מלא" value={annualTotal} />
          <SummaryRow label="לפי פרו-ראטה (מתאריך התחלה עד סוף שנה)" value={proratedTotal} />
          <SummaryRow label={`אחרי הנחות (${totalDiscount}%)`} value={afterDiscounts} bold />
          <SummaryRow label={`מע"מ (${vatRate}%)`} value={vatAmount} />
          <div className="border-t border-primary/20 pt-2">
            <SummaryRow label='סה"כ כולל מע"מ' value={totalIncVat} bold large />
          </div>

          <div className="mt-3 pt-3 border-t border-primary/20 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Label className="flex items-center gap-2 cursor-pointer">
                <Checkbox checked={paidOverrideEnabled} onCheckedChange={(v) => setPaidOverrideEnabled(!!v)} />
                <span className="text-sm">הזן כבר שולם ידנית</span>
              </Label>
              <span className="text-xs text-muted-foreground">אוטומטי: ₪{autoPaid.toLocaleString()}</span>
            </div>
            {paidOverrideEnabled && (
              <Input type="number" min="0" placeholder="סכום ששולם" value={paidOverride} onChange={(e) => setPaidOverride(e.target.value)} className="h-11 rounded-xl" />
            )}
          </div>

          <SummaryRow label="כבר שולם" value={effectivePaid} />
          <div className="border-t border-primary/20 pt-2">
            <SummaryRow label="יתרה לתשלום" value={balance} bold large highlight={balance > 0} />
          </div>
        </div>

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
