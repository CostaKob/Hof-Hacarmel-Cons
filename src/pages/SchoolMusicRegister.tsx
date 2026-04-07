import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { isValidIsraeliPhone, normalizePhone } from "@/lib/phoneValidation";
import { useAppLogo } from "@/hooks/useAppLogo";
import AppLogo from "@/components/AppLogo";

const Field = ({ id, label, required, children, error }: { id: string; label: string; required?: boolean; children: React.ReactNode; error?: string }) => (
  <div className="space-y-1.5">
    <Label htmlFor={id} className="text-sm font-medium">
      {label} {required && <span className="text-destructive">*</span>}
    </Label>
    {children}
    {error && <p className="text-xs text-destructive">{error}</p>}
  </div>
);

const INFO_TEXT = `הורים ותלמידים יקרים!

אנא קראו את הטופס, מלאו את השאלון הקצר ואשרו בסופו.

٭ תקופת השאלת כלי הנגינה הינה מיום מילוי טופס זה ועד המפגש האחרון של הפרויקט במהלך חודש יוני.

٭ ידוע לנו שהכלי נמצא במצב תקין וכשיר לנגינה, ושעלינו להחזירו במצב זה בתום תקופת ההשאלה.

٭ ידוע לנו שבמידה ויהיה נזק כלשהו לכלי במהלך שהותו אצל ילדנו, מכל סיבה שהיא, עלות התיקון חלה עלינו, החתומים מטה.

٭ ידוע לנו שעלות האביזרים הנלווים לשיעורי הנגינה (עלים, מיתרים, חוטרים, שמן, שרף לכלי קשת, וכו') חלה עלינו.

٭ במידה וילדנו יפסיק את לימודיו לפני תום תקופת ההשאלה, באחריותנו להחזיר את הכלי מידית לבית הספר במצב תקין וכשיר לנגינה.

אנו מתחייבים לשלם עלות משוערת של כלי על סך 1000 ש״ח במקרה של אובדן או הרס מוחלט של הכלי. (במקום צ׳ק ביטחון).`;

const CLASS_OPTIONS = ["ד1", "ד2", "ד3", "ד4", "ד5", "ד6"];
const GENDER_OPTIONS = [
  { value: "male", label: "זכר" },
  { value: "female", label: "נקבה" },
  { value: "other", label: "אחר" },
];

const SchoolMusicRegister = () => {
  const { logoUrl } = useAppLogo();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    school_music_school_id: "",
    student_first_name: "",
    student_last_name: "",
    student_national_id: "",
    gender: "",
    class_name: "",
    city: "",
    parent_name: "",
    parent_national_id: "",
    parent_phone: "",
    parent_email: "",
    instrument_id: "",
    instrument_serial_number: "",
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["school-music-schools-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_schools")
        .select("id, school_name")
        .eq("is_active", true)
        .order("school_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: instruments = [] } = useQuery({
    queryKey: ["instruments-for-school", form.school_music_school_id],
    enabled: !!form.school_music_school_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_groups")
        .select("instrument_id, instruments(id, name)")
        .eq("school_music_school_id", form.school_music_school_id);
      if (error) throw error;
      const seen = new Set<string>();
      return (data || [])
        .map((g: any) => g.instruments)
        .filter((i: any) => i && !seen.has(i.id) && seen.add(i.id))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
    },
  });

  const { data: activeYear } = useQuery({
    queryKey: ["active-academic-year-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id")
        .eq("is_active", true)
        .single();
      if (error) return null;
      return data;
    },
  });

  const updateField = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    if (key === "school_music_school_id") {
      setForm((prev) => ({ ...prev, instrument_id: "" }));
    }
    if (errors[key]) setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.school_music_school_id) e.school_music_school_id = "שדה חובה";
    if (!form.student_first_name.trim()) e.student_first_name = "שדה חובה";
    if (!form.student_last_name.trim()) e.student_last_name = "שדה חובה";
    if (!form.student_national_id.trim()) e.student_national_id = "שדה חובה";
    if (!form.gender) e.gender = "שדה חובה";
    if (!form.class_name) e.class_name = "שדה חובה";
    if (!form.parent_name.trim()) e.parent_name = "שדה חובה";
    if (!form.parent_national_id.trim()) e.parent_national_id = "שדה חובה";
    if (!form.parent_phone.trim()) {
      e.parent_phone = "שדה חובה";
    } else if (!isValidIsraeliPhone(form.parent_phone)) {
      e.parent_phone = "מספר טלפון לא תקין";
    }
    if (!form.parent_email.trim()) e.parent_email = "שדה חובה";
    if (!form.instrument_id) e.instrument_id = "שדה חובה";
    if (!approvalChecked) e.approval = "יש לאשר את התנאים";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from("school_music_students" as any).insert({
        school_music_school_id: form.school_music_school_id,
        academic_year_id: activeYear?.id || null,
        student_first_name: form.student_first_name.trim(),
        student_last_name: form.student_last_name.trim(),
        student_national_id: form.student_national_id.trim(),
        gender: form.gender,
        class_name: form.class_name,
        city: form.city.trim() || null,
        parent_name: form.parent_name.trim(),
        parent_national_id: form.parent_national_id.trim(),
        parent_phone: normalizePhone(form.parent_phone),
        parent_email: form.parent_email.trim(),
        instrument_id: form.instrument_id,
        instrument_serial_number: form.instrument_serial_number.trim() || null,
        approval_checked: true,
      } as any);
      if (error) throw error;
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      toast.error("שגיאה בשליחת הטופס, נסו שנית");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <CardContent className="py-12 space-y-4">
            <div className="text-4xl">✅</div>
            <h2 className="text-xl font-bold">הטופס נשלח בהצלחה!</h2>
            <p className="text-muted-foreground">תודה על מילוי הטופס. נעדכן אתכם בהמשך.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          {logoUrl && <AppLogo size="lg" />}
          <h1 className="text-xl font-bold">טופס השאלת כלי נגינה - תשפ״ז (2026-2027)</h1>
        </div>

        {/* Info text */}
        <Card>
          <CardContent className="pt-6">
            <div className="whitespace-pre-line text-sm leading-relaxed">{INFO_TEXT}</div>
          </CardContent>
        </Card>

        {/* Approval */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
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

        {/* Form fields */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">פרטי הרישום</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="school" label="בית ספר" required error={errors.school_music_school_id}>
              <Select value={form.school_music_school_id} onValueChange={(v) => updateField("school_music_school_id", v)}>
                <SelectTrigger id="school"><SelectValue placeholder="בחרו בית ספר" /></SelectTrigger>
                <SelectContent>
                  {schools.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.school_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field id="first_name" label="שם פרטי תלמיד" required error={errors.student_first_name}>
                <Input id="first_name" value={form.student_first_name} onChange={(e) => updateField("student_first_name", e.target.value)} />
              </Field>
              <Field id="last_name" label="שם משפחה תלמיד" required error={errors.student_last_name}>
                <Input id="last_name" value={form.student_last_name} onChange={(e) => updateField("student_last_name", e.target.value)} />
              </Field>
            </div>

            <Field id="national_id" label="תעודת זהות תלמיד" required error={errors.student_national_id}>
              <Input id="national_id" value={form.student_national_id} onChange={(e) => updateField("student_national_id", e.target.value)} />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field id="gender" label="לשון פנייה" required error={errors.gender}>
                <Select value={form.gender} onValueChange={(v) => updateField("gender", v)}>
                  <SelectTrigger id="gender"><SelectValue placeholder="בחרו" /></SelectTrigger>
                  <SelectContent>
                    {GENDER_OPTIONS.map((g) => (
                      <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="class" label="כיתה" required error={errors.class_name}>
                <Select value={form.class_name} onValueChange={(v) => updateField("class_name", v)}>
                  <SelectTrigger id="class"><SelectValue placeholder="בחרו כיתה" /></SelectTrigger>
                  <SelectContent>
                    {CLASS_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field id="city" label="ישוב מגורים">
              <Input id="city" value={form.city} onChange={(e) => updateField("city", e.target.value)} />
            </Field>

            <hr className="my-2" />

            <Field id="parent_name" label="שם מלא של הורה" required error={errors.parent_name}>
              <Input id="parent_name" value={form.parent_name} onChange={(e) => updateField("parent_name", e.target.value)} />
            </Field>

            <Field id="parent_nid" label="מספר תעודת זהות הורה" required error={errors.parent_national_id}>
              <Input id="parent_nid" value={form.parent_national_id} onChange={(e) => updateField("parent_national_id", e.target.value)} />
            </Field>

            <Field id="parent_phone" label="טלפון הורה" required error={errors.parent_phone}>
              <Input id="parent_phone" type="tel" dir="ltr" value={form.parent_phone} onChange={(e) => updateField("parent_phone", e.target.value)} />
            </Field>

            <Field id="parent_email" label='דוא"ל הורה' required error={errors.parent_email}>
              <Input id="parent_email" type="email" dir="ltr" value={form.parent_email} onChange={(e) => updateField("parent_email", e.target.value)} />
            </Field>

            <hr className="my-2" />

            <Field id="instrument" label="כלי נגינה" required error={errors.instrument_id}>
              <Select value={form.instrument_id} onValueChange={(v) => updateField("instrument_id", v)}>
                <SelectTrigger id="instrument"><SelectValue placeholder="בחרו כלי נגינה" /></SelectTrigger>
                <SelectContent>
                  {instruments.map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field id="serial" label="מספר סידורי של כלי הנגינה">
              <Input id="serial" value={form.instrument_serial_number} onChange={(e) => updateField("instrument_serial_number", e.target.value)} />
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
