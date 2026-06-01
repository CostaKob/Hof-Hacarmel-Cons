import { useState, useRef, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppLogo } from "@/hooks/useAppLogo";
import AppLogo from "@/components/AppLogo";
import { CitySelect } from "@/components/CitySelect";
import { isExactDigits, isValidEmail } from "@/lib/schoolMusicValidation";

/* ── Field wrapper ── */

const Field = ({
  id, label, required, children, error, fieldRef,
}: {
  id: string; label: string; required?: boolean; children: React.ReactNode; error?: string;
  fieldRef?: React.RefObject<HTMLDivElement>;
}) => (
  <div ref={fieldRef} className="space-y-1.5">
    <Label htmlFor={id} className="text-sm font-medium">
      {label} {required && <span className="text-destructive">*</span>}
    </Label>
    {children}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
);

/* ── static data ── */

const INFO_TEXT = `הורים ותלמידים יקרים!

אנא קראו את הטופס, מלאו את השאלון הקצר ואשרו בסופו.

٭ תקופת השאלת כלי הנגינה הינה מיום מילוי טופס זה ועד המפגש האחרון של הפרויקט במהלך חודש יוני.

٭ ידוע לנו שהכלי נמצא במצב תקין וכשיר לנגינה, ושעלינו להחזירו במצב זה בתום תקופת ההשאלה.

٭ ידוע לנו שבמידה ויהיה נזק כלשהו לכלי במהלך שהותו אצל ילדנו, מכל סיבה שהיא, עלות התיקון חלה עלינו, החתומים מטה.

٭ ידוע לנו שעלות האביזרים הנלווים לשיעורי הנגינה (עלים, מיתרים, חוטרים, שמן, שרף לכלי קשת, וכו') חלה עלינו.

٭ במידה וילדנו יפסיק את לימודיו לפני תום תקופת ההשאלה, באחריותנו להחזיר את הכלי מידית לבית הספר במצב תקין וכשיר לנגינה.

אנו מתחייבים לשלם עלות משוערת של כלי על סך 1000 ש״ח במקרה של אובדן או הרס מוחלט של הכלי. (במקום צ׳ק ביטחון).`;

const GENDER_OPTIONS = [
  { value: "male", label: "זכר" },
  { value: "female", label: "נקבה" },
  { value: "other", label: "אחר" },
];

/* ── Component ── */

const SchoolMusicRegister = () => {
  const { logoUrl } = useAppLogo();
  const [searchParams] = useSearchParams();
  const urlYearParam = searchParams.get("year");
  const urlYearId = searchParams.get("yearId");
  const urlSchoolIdParam = searchParams.get("school_id");
  const urlSchoolSlug = searchParams.get("school");
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const initialSchoolIdGuess = urlSchoolIdParam && UUID_RE.test(urlSchoolIdParam) ? urlSchoolIdParam : "";
  const slugCandidate = urlSchoolSlug || (urlSchoolIdParam && !UUID_RE.test(urlSchoolIdParam) ? urlSchoolIdParam : "");
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [submissionResult, setSubmissionResult] = useState<{
    student_id: string;
    payment_id?: string;
    amount: number;
    student_name: string;
    school_name: string;
    class_name: string;
    instrument_name: string;
    teacher_name?: string;
    inventory_label?: string;
  } | null>(null);
  const [payUrl, setPayUrl] = useState<string | null>(null);
  const [payStatus, setPayStatus] = useState<"preparing" | "redirecting" | "manual">("preparing");
  const [countdown, setCountdown] = useState(10);

  const { data: slugResolved } = useQuery({
    queryKey: ["school-music-school-by-slug", slugCandidate, urlYearId],
    enabled: !!slugCandidate,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_public_school_music_school_by_slug" as any, { _slug: slugCandidate });
      if (error) throw error;
      if (!data || (data as any[]).length === 0) return null;
      const rows = (data as any[]).map((d) => ({
        id: d.id,
        academic_year_id: d.academic_year_id,
        academic_years: {
          is_active: d.is_active,
          registration_open: d.registration_open,
          start_date: d.start_date,
        },
      }));
      if (urlYearId) {
        const match = rows.find((d: any) => d.academic_year_id === urlYearId);
        if (match) return match;
      }
      const sorted = [...rows].sort((a: any, b: any) => {
        const aY = a.academic_years, bY = b.academic_years;
        if (aY.is_active !== bY.is_active) return aY.is_active ? -1 : 1;
        if (aY.registration_open !== bY.registration_open) return aY.registration_open ? -1 : 1;
        return (bY.start_date || "").localeCompare(aY.start_date || "");
      });
      return sorted[0];
    },
  });
  const urlSchoolId = initialSchoolIdGuess || slugResolved?.id || "";

  const [form, setForm] = useState({
    school_music_school_id: "",
    school_music_class_id: "",
    student_first_name: "",
    student_last_name: "",
    student_national_id: "",
    gender: "",
    city: "",
    parent_name: "",
    parent_national_id: "",
    parent_phone: "",
    parent_email: "",
    instrument_id: "",
    inventory_instrument_id: "",
  });

  useEffect(() => {
    if (urlSchoolId && !form.school_music_school_id) {
      setForm((f) => ({ ...f, school_music_school_id: urlSchoolId }));
    }
  }, [urlSchoolId]);

  const fieldRefs: Record<string, React.RefObject<HTMLDivElement>> = {
    school_music_school_id: useRef<HTMLDivElement>(null!),
    school_music_class_id: useRef<HTMLDivElement>(null!),
    student_first_name: useRef<HTMLDivElement>(null!),
    student_last_name: useRef<HTMLDivElement>(null!),
    student_national_id: useRef<HTMLDivElement>(null!),
    gender: useRef<HTMLDivElement>(null!),
    parent_name: useRef<HTMLDivElement>(null!),
    parent_national_id: useRef<HTMLDivElement>(null!),
    parent_phone: useRef<HTMLDivElement>(null!),
    parent_email: useRef<HTMLDivElement>(null!),
    instrument_id: useRef<HTMLDivElement>(null!),
    approval: useRef<HTMLDivElement>(null!),
  };

  const { data: resolvedYear, isLoading: yearLoading } = useQuery({
    queryKey: ["school-music-year", urlYearParam, urlYearId, urlSchoolId],
    queryFn: async () => {
      if (urlSchoolId) {
        const { data: schoolYearId } = await supabase
          .rpc("get_school_music_school_year" as any, { _school_id: urlSchoolId });
        if (schoolYearId) {
          const { data } = await supabase
            .from("academic_years")
            .select("id, name, registration_open")
            .eq("id", schoolYearId as any)
            .maybeSingle();
          if (data) return data;
        }
      }
      if (urlYearParam) {
        const { data } = await supabase
          .from("academic_years")
          .select("id, name, registration_open")
          .eq("name", urlYearParam)
          .maybeSingle();
        if (data) return data;
      }
      if (urlYearId) {
        const { data } = await supabase
          .from("academic_years")
          .select("id, name, registration_open")
          .eq("id", urlYearId)
          .maybeSingle();
        if (data) return data;
      }
      const { data: openYear } = await supabase
        .from("academic_years")
        .select("id, name, registration_open")
        .eq("registration_open", true)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openYear) return openYear;
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, name, registration_open")
        .eq("is_active", true)
        .single();
      if (error) return null;
      return data;
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["school-music-schools-public", resolvedYear?.id],
    enabled: !!resolvedYear?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("list_public_school_music_schools" as any, { _year_id: resolvedYear!.id });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["school-music-classes-public", form.school_music_school_id],
    enabled: !!form.school_music_school_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("list_public_school_music_classes" as any, { _school_id: form.school_music_school_id });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: classGroups = [] } = useQuery({
    queryKey: ["school-music-class-groups-public", form.school_music_class_id],
    enabled: !!form.school_music_class_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("list_public_class_groups" as any, { _class_id: form.school_music_class_id });
      if (error) throw error;
      return (data ?? []).map((g: any) => ({
        id: g.id,
        instrument_id: g.instrument_id,
        teacher_id: g.teacher_id,
        instruments: { id: g.instrument_id, name: g.instrument_name },
        teachers: { id: g.teacher_id, first_name: g.teacher_first_name, last_name: g.teacher_last_name },
      }));
    },
  });

  const { data: availableInventory = [] } = useQuery({
    queryKey: ["school-music-available-inventory", form.instrument_id],
    enabled: !!form.instrument_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("list_public_available_inventory" as any, { _instrument_id: form.instrument_id });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const instruments = (() => {
    const seen = new Set<string>();
    return classGroups
      .map((g: any) => g.instruments)
      .filter((i: any) => i && !seen.has(i.id) && seen.add(i.id))
      .sort((a: any, b: any) => a.name.localeCompare(b.name));
  })();

  const validateField = useCallback((key: string, value: string): string | null => {
    switch (key) {
      case "school_music_school_id":
      case "school_music_class_id":
      case "instrument_id":
        return !value ? "שדה חובה" : null;
      case "student_first_name":
      case "student_last_name":
      case "parent_name":
        return !value.trim() ? "שדה חובה" : null;
      case "student_national_id":
        if (!value.trim()) return "שדה חובה";
        return !isExactDigits(value, 9) ? "תעודת זהות חייבת להיות 9 ספרות" : null;
      case "parent_national_id":
        if (!value.trim()) return "שדה חובה";
        return !isExactDigits(value, 9) ? "תעודת זהות חייבת להיות 9 ספרות" : null;
      case "parent_phone":
        if (!value.trim()) return "שדה חובה";
        return !isExactDigits(value, 10) ? "מספר טלפון חייב להיות 10 ספרות" : null;
      case "parent_email":
        if (!value.trim()) return "שדה חובה";
        return !isValidEmail(value) ? "יש להזין אימייל תקין" : null;
      default:
        return null;
    }
  }, []);

  const handleBlur = useCallback((key: string) => {
    const value = (form as any)[key] ?? "";
    const err = validateField(key, value);
    setErrors((prev) => {
      const next = { ...prev };
      if (err) { next[key] = err; } else { delete next[key]; }
      return next;
    });
  }, [form, validateField]);

  const updateField = useCallback((key: string, value: string) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "school_music_school_id") {
        next.school_music_class_id = "";
        next.instrument_id = "";
        next.inventory_instrument_id = "";
      }
      if (key === "school_music_class_id") {
        next.instrument_id = "";
        next.inventory_instrument_id = "";
      }
      if (key === "instrument_id") {
        next.inventory_instrument_id = "";
      }
      return next;
    });
    if (errors[key]) {
      const err = validateField(key, value);
      if (!err) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
    }
  }, [errors, validateField]);

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    const fieldsToValidate = [
      "school_music_school_id", "school_music_class_id",
      "student_first_name", "student_last_name", "student_national_id",
      "parent_name", "parent_phone", "parent_email",
      "instrument_id",
    ];
    fieldsToValidate.forEach((key) => {
      const err = validateField(key, (form as any)[key] ?? "");
      if (err) e[key] = err;
    });
    if (!approvalChecked) e.approval = "יש לאשר את התנאים";

    setErrors(e);

    const firstKey = Object.keys(e)[0];
    if (firstKey && fieldRefs[firstKey]?.current) {
      fieldRefs[firstKey].current.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const matchingGroup = classGroups.find(
        (g: any) => g.instrument_id === form.instrument_id
      );

      const phone = form.parent_phone.replace(/[^\d]/g, "");
      const studentNid = form.student_national_id.replace(/[^\d]/g, "");

      if (studentNid && resolvedYear?.id) {
        const { data: dup } = await supabase
          .from("school_music_students")
          .select("id, student_first_name, student_last_name")
          .eq("student_national_id", studentNid)
          .eq("academic_year_id", resolvedYear.id)
          .maybeSingle();
        if (dup) {
          toast.error(`כבר קיימת הרשמה לתלמיד עם ת"ז זו השנה (${dup.student_first_name} ${dup.student_last_name}). אם זו טעות, בדקו את הת"ז.`);
          setSubmitting(false);
          return;
        }
      }

      const payload = {
        school_music_school_id: form.school_music_school_id,
        school_music_class_id: form.school_music_class_id,
        school_music_class_group_id: matchingGroup?.id || null,
        academic_year_id: resolvedYear?.id || null,
        student_first_name: form.student_first_name.trim(),
        student_last_name: form.student_last_name.trim(),
        student_national_id: studentNid,
        gender: form.gender || null,
        class_name: classes.find((c) => c.id === form.school_music_class_id)?.class_name || "",
        city: form.city.trim() || null,
        parent_name: form.parent_name.trim(),
        parent_national_id: "",
        parent_phone: phone,
        parent_email: form.parent_email.trim(),
        instrument_id: form.instrument_id,
        approval_checked: true,
      };

      const { data, error } = await supabase.rpc("register_school_music_student_with_loan" as any, {
        _payload: payload,
        _inventory_instrument_id: form.inventory_instrument_id || null,
      });
      if (error) throw error;

      const result = (data as any) || {};
      const selectedInventory = availableInventory.find((i: any) => i.id === form.inventory_instrument_id);
      const instrumentName = instruments.find((i: any) => i.id === form.instrument_id)?.name || "";
      const teacher: any = matchingGroup ? (matchingGroup as any).teachers : null;
      const teacherName = teacher
        ? `${teacher.first_name ?? ""} ${teacher.last_name ?? ""}`.trim()
        : "";

      setSubmissionResult({
        student_id: result.student_id,
        payment_id: result.payment_id,
        amount: Number(result.amount || 0),
        student_name: `${form.student_first_name} ${form.student_last_name}`.trim(),
        school_name: schools.find((s) => s.id === form.school_music_school_id)?.school_name || "",
        class_name: classes.find((c) => c.id === form.school_music_class_id)?.class_name || "",
        instrument_name: instrumentName,
        teacher_name: teacherName,
        inventory_label: selectedInventory
          ? `#${selectedInventory.serial_number}${selectedInventory.brand ? ` — ${selectedInventory.brand}` : ""}`
          : undefined,
      });
      setSubmitted(true);
      void generatePayLink(result.student_id, result.payment_id);
    } catch (err) {
      console.error(err);
      toast.error("שגיאה בשליחת הטופס, נסו שנית");
    } finally {
      setSubmitting(false);
    }
  };

  const generatePayLink = async (studentId: string, paymentId?: string) => {
    setPayStatus("preparing");
    setPayUrl(null);
    try {
      const { data, error } = await supabase.functions.invoke("icount-generate-paylink", {
        body: { studentId, paymentId },
      });
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error("לא התקבל קישור תשלום");
      setPayUrl(url);
      setPayStatus("redirecting");
      setTimeout(() => { window.location.href = url; }, 600);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "שגיאה ביצירת קישור התשלום");
      setPayStatus("manual");
    }
  };

  useEffect(() => {
    if (!submitted || !payUrl) return;
    setCountdown(10);
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { clearInterval(t); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [submitted, payUrl]);

  if (submitted && submissionResult) {
    const r = submissionResult;
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-xl w-full">
          <CardContent className="py-10 space-y-6">
            <div className="text-center space-y-2">
              <div className="text-5xl">🎉</div>
              <h2 className="text-2xl font-bold">ההרשמה התקבלה בהצלחה!</h2>
              <p className="text-muted-foreground">פרטי השיבוץ של {r.student_name}:</p>
            </div>

            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-sm">
              {r.school_name && <div><span className="text-muted-foreground">בית ספר: </span><span className="font-medium">{r.school_name}</span></div>}
              {r.class_name && <div><span className="text-muted-foreground">כיתה: </span><span className="font-medium">{r.class_name}</span></div>}
              {r.instrument_name && <div><span className="text-muted-foreground">כלי נגינה: </span><span className="font-medium">{r.instrument_name}</span></div>}
              {r.teacher_name && <div><span className="text-muted-foreground">מורה: </span><span className="font-medium">{r.teacher_name}</span></div>}
              {r.inventory_label && <div><span className="text-muted-foreground">כלי מהמלאי: </span><span className="font-medium">{r.inventory_label}</span></div>}
            </div>

            {r.amount > 0 ? (
              <>
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-5 text-center space-y-1">
                  <p className="text-sm text-muted-foreground">דמי לימוד שנתיים</p>
                  <p className="text-3xl font-bold text-primary">₪{r.amount.toLocaleString()}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="rounded-xl bg-muted/40 border border-border p-4 text-center text-sm font-medium">
                    {payStatus === "preparing" && "מכין את עמוד התשלום המאובטח..."}
                    {payStatus === "redirecting" && "הינך מועבר לעמוד התשלום..."}
                    {payStatus === "manual" && "לא הצלחנו להעביר אותך אוטומטית — לחצו על הכפתור למטה."}
                  </div>
                  <Button
                    onClick={() => { if (payUrl) window.location.href = payUrl; }}
                    disabled={!payUrl || countdown > 0}
                    className="h-12 text-base"
                  >
                    {!payUrl
                      ? "ממתין לקישור..."
                      : countdown > 0
                        ? `למעבר ידני לעמוד התשלום (${countdown})`
                        : "למעבר ידני לעמוד התשלום לחץ כאן"}
                  </Button>
                  <Button variant="outline" onClick={() => { window.location.href = "/"; }} className="h-11">
                    אשלם בהמשך
                  </Button>
                  <p className="text-xs text-center text-muted-foreground mt-1">
                    אם תבחרו "אשלם בהמשך" נשלח אליכם קישור תשלום בנפרד.
                  </p>
                </div>
              </>
            ) : (
              <p className="text-center text-muted-foreground">לא נקבעו דמי לימוד לבית הספר הזה. ניצור קשר בהמשך.</p>
            )}

            <div className="pt-4 border-t border-border">
              <Button
                variant="secondary"
                className="w-full h-11"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    school_music_class_id: "",
                    student_first_name: "",
                    student_last_name: "",
                    student_national_id: "",
                    gender: "",
                    instrument_id: "",
                    inventory_instrument_id: "",
                  }));
                  setErrors({});
                  setApprovalChecked(false);
                  setSubmissionResult(null);
                  setSubmitted(false);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                ➕ הרשמת ילד/ה נוסף/ת
              </Button>
              <p className="text-xs text-center text-muted-foreground mt-2">
                פרטי ההורה ובית הספר יישמרו, תצטרכו למלא רק את פרטי הילד/ה.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (yearLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-4">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!resolvedYear) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <CardContent className="py-12 space-y-4">
            <div className="text-4xl">⚠️</div>
            <h2 className="text-xl font-bold">הרישום לשנת לימודים זו אינו פעיל כרגע.</h2>
            <p className="text-muted-foreground">אנא פנו למזכירות לפרטים נוספים.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!resolvedYear.registration_open) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <CardContent className="py-12 space-y-4">
            <div className="text-4xl">🔒</div>
            <h2 className="text-xl font-bold">הרישום לשנה {resolvedYear.name} טרם נפתח.</h2>
            <p className="text-muted-foreground">אנא פנו למזכירות לפרטים נוספים.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="text-center space-y-3">
          {logoUrl && <div className="flex justify-center"><AppLogo size="lg" /></div>}
          <h1 className="text-xl font-bold">טופס השאלת כלי נגינה — {resolvedYear.name}</h1>
        </div>

        <Card>
          <CardContent className="pt-6">
            <div className="whitespace-pre-line text-sm leading-relaxed">{INFO_TEXT}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div ref={fieldRefs.approval} className="flex items-start gap-3">
              <Checkbox
                id="approval"
                checked={approvalChecked}
                onCheckedChange={(c) => {
                  setApprovalChecked(c === true);
                  if (errors.approval) setErrors((p) => { const n = { ...p }; delete n.approval; return n; });
                }}
              />
              <Label htmlFor="approval" className="text-sm font-medium leading-relaxed cursor-pointer">
                אני ההורה מאשר/ת כי קראתי טופס זה ומקבל/ת את תנאיו <span className="text-destructive">*</span>
              </Label>
            </div>
            {errors.approval && <p className="text-xs text-destructive mt-1">{errors.approval}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">פרטי הרישום</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="school" label="בית ספר" required error={errors.school_music_school_id} fieldRef={fieldRefs.school_music_school_id}>
              {urlSchoolId ? (
                <div className="h-11 px-3 rounded-xl border border-input bg-muted/40 flex items-center font-medium text-foreground">
                  {schools.find((s) => s.id === urlSchoolId)?.school_name ?? "טוען..."}
                </div>
              ) : (
                <Select value={form.school_music_school_id} onValueChange={(v) => updateField("school_music_school_id", v)}>
                  <SelectTrigger id="school"><SelectValue placeholder="בחרו בית ספר" /></SelectTrigger>
                  <SelectContent>
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.school_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {urlSchoolId && <p className="text-xs text-muted-foreground mt-1">בית הספר נבחר אוטומטית מתוך הקישור שקיבלת.</p>}
            </Field>

            <Field id="class" label="כיתה" required error={errors.school_music_class_id} fieldRef={fieldRefs.school_music_class_id}>
              <Select
                value={form.school_music_class_id}
                onValueChange={(v) => updateField("school_music_class_id", v)}
                disabled={!form.school_music_school_id}
              >
                <SelectTrigger id="class">
                  <SelectValue placeholder={form.school_music_school_id ? "בחרו כיתה" : "בחרו קודם בית ספר"} />
                </SelectTrigger>
                <SelectContent>
                  {classes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.class_name}{c.homeroom_teacher_name ? ` - ${c.homeroom_teacher_name}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="instrument" label="כלי נגינה" required error={errors.instrument_id} fieldRef={fieldRefs.instrument_id}>
              <Select
                value={form.instrument_id}
                onValueChange={(v) => updateField("instrument_id", v)}
                disabled={!form.school_music_class_id}
              >
                <SelectTrigger id="instrument">
                  <SelectValue placeholder={form.school_music_class_id ? "בחרו כלי נגינה" : "בחרו קודם כיתה"} />
                </SelectTrigger>
                <SelectContent>
                  {instruments.map((i: any) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="inventory" label="כלי מהמלאי" error={errors.inventory_instrument_id}>
              {(() => {
                const selected = availableInventory.find((it: any) => it.id === form.inventory_instrument_id);
                const formatLabel = (it: any) =>
                  `#${it.serial_number}${it.size ? ` (${it.size})` : ""}${(it.brand || it.model) ? ` — ${[it.brand, it.model].filter(Boolean).join(" ")}` : ""}`;
                const disabled = !form.instrument_id || availableInventory.length === 0;
                const placeholder = !form.instrument_id
                  ? "בחרו קודם כלי נגינה"
                  : availableInventory.length === 0
                  ? "אין כלים זמינים מסוג זה"
                  : "בחרו או הקלידו מספר כלי (אופציונלי)";
                return (
                  <Popover open={inventoryOpen} onOpenChange={setInventoryOpen}>
                    <div className="relative">
                      <PopoverTrigger asChild>
                        <Button
                          id="inventory"
                          type="button"
                          variant="outline"
                          role="combobox"
                          disabled={disabled}
                          className="w-full justify-between font-normal h-10 pl-16"
                        >
                          <span className={cn("truncate", !selected && "text-muted-foreground")}>
                            {selected ? formatLabel(selected) : placeholder}
                          </span>
                          <ChevronsUpDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      {selected && !disabled && (
                        <button
                          type="button"
                          aria-label="נקה בחירת כלי מהמלאי"
                          className="absolute left-9 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            updateField("inventory_instrument_id", "");
                            setInventoryOpen(false);
                          }}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command
                        filter={(value, search) => {
                          if (!search) return 1;
                          return value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="הקלידו מספר כלי..." />
                        <CommandList>
                          <CommandEmpty>לא נמצא כלי תואם</CommandEmpty>
                          <CommandGroup>
                            {availableInventory.map((it: any) => (
                              <CommandItem
                                key={it.id}
                                value={`${it.serial_number} ${it.brand || ""} ${it.model || ""} ${it.size || ""}`}
                                onSelect={() => {
                                  updateField("inventory_instrument_id", it.id);
                                  setInventoryOpen(false);
                                }}
                              >
                                <Check className={cn("ml-2 h-4 w-4", form.inventory_instrument_id === it.id ? "opacity-100" : "opacity-0")} />
                                {formatLabel(it)}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                );
              })()}
              <p className="text-xs text-muted-foreground mt-1">בחירת כלי מהמלאי תיצור השאלה אוטומטית לתלמיד.</p>
            </Field>

            <hr className="my-2" />

            <div className="grid grid-cols-2 gap-4">
              <Field id="first_name" label="שם פרטי תלמיד" required error={errors.student_first_name} fieldRef={fieldRefs.student_first_name}>
                <Input id="first_name" value={form.student_first_name} onChange={(e) => updateField("student_first_name", e.target.value)} onBlur={() => handleBlur("student_first_name")} />
              </Field>
              <Field id="last_name" label="שם משפחה תלמיד" required error={errors.student_last_name} fieldRef={fieldRefs.student_last_name}>
                <Input id="last_name" value={form.student_last_name} onChange={(e) => updateField("student_last_name", e.target.value)} onBlur={() => handleBlur("student_last_name")} />
              </Field>
            </div>

            <Field id="national_id" label="תעודת זהות תלמיד (9 ספרות)" required error={errors.student_national_id} fieldRef={fieldRefs.student_national_id}>
              <Input id="national_id" dir="ltr" inputMode="numeric" maxLength={9} value={form.student_national_id} onChange={(e) => updateField("student_national_id", e.target.value)} onBlur={() => handleBlur("student_national_id")} />
            </Field>

            <Field id="gender" label="לשון פנייה" fieldRef={fieldRefs.gender}>
              <Select value={form.gender} onValueChange={(v) => updateField("gender", v)}>
                <SelectTrigger id="gender"><SelectValue placeholder="בחרו" /></SelectTrigger>
                <SelectContent>
                  {GENDER_OPTIONS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="city" label="ישוב מגורים">
              <CitySelect id="city" value={form.city} onChange={(v) => updateField("city", v)} />
            </Field>

            <hr className="my-2" />

            <Field id="parent_name" label="שם מלא של הורה" required error={errors.parent_name} fieldRef={fieldRefs.parent_name}>
              <Input id="parent_name" value={form.parent_name} onChange={(e) => updateField("parent_name", e.target.value)} onBlur={() => handleBlur("parent_name")} />
            </Field>

            <Field id="parent_phone" label="טלפון הורה (10 ספרות)" required error={errors.parent_phone} fieldRef={fieldRefs.parent_phone}>
              <Input id="parent_phone" type="tel" dir="ltr" inputMode="numeric" maxLength={10} value={form.parent_phone} onChange={(e) => updateField("parent_phone", e.target.value)} onBlur={() => handleBlur("parent_phone")} />
            </Field>

            <Field id="parent_email" label='דוא"ל הורה' required error={errors.parent_email} fieldRef={fieldRefs.parent_email}>
              <Input id="parent_email" type="email" dir="ltr" value={form.parent_email} onChange={(e) => updateField("parent_email", e.target.value)} onBlur={() => handleBlur("parent_email")} />
            </Field>
          </CardContent>
        </Card>

        <Button onClick={handleSubmit} disabled={submitting} className="w-full h-12 text-base">
          {submitting ? "שולח..." : "שלח טופס"}
        </Button>
      </div>
    </div>
  );
};

export default SchoolMusicRegister;
