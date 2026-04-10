import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, UserCheck } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { KNOWN_KEYS_SET } from "@/lib/registrationFieldKeys";
import { isValidIsraeliPhone, normalizePhone } from "@/lib/phoneValidation";

interface FieldDef {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  options: { value: string; label: string }[];
  sort_order: number;
  is_active: boolean;
  help_text: string;
  section_title: string;
  placeholder: string;
  data_source: string;
}

interface Section {
  id: string;
  title: string;
  content: string;
  sort_order: number;
}

// Map from student record fields to registration field keys
const STUDENT_TO_FIELD_MAP: Record<string, string> = {
  first_name: "__student_first_name",
  last_name: "__student_last_name",
  national_id: "student_national_id",
  parent_phone: "parent_phone",
  parent_phone_2: "__parent_phone_2",
  parent_name: "parent_name",
  parent_email: "parent_email",
  phone: "student_phone",
  city: "city",
  grade: "grade",
  gender: "gender",
  address: "__address",
};

const PublicRegistration = () => {
  const { token } = useParams<{ token?: string }>();
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [existingStudent, setExistingStudent] = useState<any>(null);
  const [lookupDone, setLookupDone] = useState(false);
  const [tokenRegistration, setTokenRegistration] = useState<any>(null);
  const approvalRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load active year
  const { data: activeYear, isLoading: yearLoading } = useQuery({
    queryKey: ["public-active-year"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("id, name").eq("is_active", true).single();
      if (error) return null;
      return data;
    },
  });

  // Load active registration page
  const { data: page, isLoading: pageLoading } = useQuery({
    queryKey: ["public-registration-page", activeYear?.id],
    queryFn: async () => {
      if (!activeYear?.id) return null;
      const { data, error } = await supabase
        .from("registration_pages")
        .select("*")
        .eq("academic_year_id", activeYear.id)
        .eq("is_open", true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!activeYear?.id,
  });

  // Load sections
  const { data: sections = [] } = useQuery({
    queryKey: ["public-registration-sections", page?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registration_page_sections")
        .select("*")
        .eq("page_id", page!.id)
        .order("sort_order");
      if (error) throw error;
      return data as Section[];
    },
    enabled: !!page?.id,
  });

  // Load fields
  const { data: fields = [] } = useQuery({
    queryKey: ["public-registration-fields", page?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registration_page_fields")
        .select("*")
        .eq("page_id", page!.id)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return (data as any[]).map((f) => ({
        ...f,
        options: Array.isArray(f.options) ? f.options : [],
      })) as FieldDef[];
    },
    enabled: !!page?.id,
  });

  // Load instruments (for data_source)
  const { data: instruments = [] } = useQuery({
    queryKey: ["public-instruments"],
    queryFn: async () => {
      const { data } = await supabase.from("instruments").select("id, name").order("name");
      return data || [];
    },
  });

  // Load schools (for data_source)
  const { data: schools = [] } = useQuery({
    queryKey: ["public-schools"],
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("id, name").eq("is_active", true).order("name");
      return data || [];
    },
  });

  // Load registration by token for pre-fill
  const { data: tokenData } = useQuery({
    queryKey: ["registration-token", token],
    queryFn: async () => {
      if (!token) return null;
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .eq("registration_token", token)
        .maybeSingle();
      if (error) return null;
      return data;
    },
    enabled: !!token,
  });

  // Check if student has enrollment history (for 30-min restriction)
  const [hasEnrollmentHistory, setHasEnrollmentHistory] = useState(false);

  const checkEnrollmentHistory = useCallback(async (nationalId: string) => {
    if (!nationalId || nationalId.length < 5) {
      setHasEnrollmentHistory(false);
      return;
    }
    // Find student by national_id, then check enrollments
    const { data: student } = await supabase
      .from("students")
      .select("id")
      .eq("national_id", nationalId.trim())
      .maybeSingle();
    if (student) {
      const { count } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("student_id", student.id);
      setHasEnrollmentHistory((count || 0) > 0);
    } else {
      setHasEnrollmentHistory(false);
    }
  }, []);

  // Pre-fill form from token registration
  useEffect(() => {
    if (tokenData && !tokenRegistration) {
      setTokenRegistration(tokenData);
      setFormValues((prev) => {
        const updated = { ...prev };
        const fullName = `${tokenData.student_first_name || ""} ${tokenData.student_last_name || ""}`.trim();
        if (fullName) updated["student_full_name"] = fullName;
        if (tokenData.student_national_id) updated["student_national_id"] = tokenData.student_national_id;
        if (tokenData.parent_phone) updated["parent_phone"] = tokenData.parent_phone;
        if (tokenData.parent_name) updated["parent_name"] = tokenData.parent_name;
        if (tokenData.parent_email) updated["parent_email"] = tokenData.parent_email;
        if (tokenData.parent_national_id) updated["parent_national_id"] = tokenData.parent_national_id;
        if (tokenData.student_phone) updated["student_phone"] = tokenData.student_phone;
        if (tokenData.city) updated["city"] = tokenData.city;
        if (tokenData.grade) updated["grade"] = tokenData.grade;
        if (tokenData.gender) updated["gender"] = tokenData.gender;
        return updated;
      });
      setExistingStudent({ first_name: tokenData.student_first_name, last_name: tokenData.student_last_name });
      setLookupDone(true);
      // Check enrollment history for 30-min restriction
      if (tokenData.student_national_id) {
        checkEnrollmentHistory(tokenData.student_national_id);
      }
    }
  }, [tokenData, tokenRegistration, checkEnrollmentHistory]);

  // Helper: is 30-min option allowed for this student?
  const is30MinAllowed = useCallback(() => {
    const grade = formValues["grade"];
    if (!grade) return true; // unknown grade, allow
    const allowedGrades = ["א", "ב", "ג", "ד"];
    if (!allowedGrades.includes(grade)) return false;
    if (hasEnrollmentHistory) return false;
    return true;
  }, [formValues, hasEnrollmentHistory]);

  const getOptionsForField = (field: FieldDef) => {
    if (field.data_source === "instruments") return instruments.map((i) => ({ value: i.name, label: i.name }));
    if (field.data_source === "schools") return schools.map((s) => ({ value: s.name, label: s.name }));
    // Filter 30-min option for lesson duration fields
    if (field.field_key === "requested_lesson_duration") {
      return field.options.map((opt) => {
        if (opt.value === "30" && !is30MinAllowed()) {
          return { ...opt, label: `${opt.label} (כיתה ד׳ ומטה, שנה ראשונה בלבד)`, disabled: true };
        }
        return opt;
      });
    }
    return field.options;
  };

  // Lookup student by national ID via secure RPC
  const lookupStudent = useCallback(async (nationalId: string) => {
    const trimmed = nationalId.trim();
    if (trimmed.length < 5) {
      setExistingStudent(null);
      setLookupDone(false);
      return;
    }

    const { data: rawData } = await supabase
      .rpc("lookup_student_by_national_id", { _national_id: trimmed });

    const student = rawData as any;

    if (student) {
      setExistingStudent(student);
      setLookupDone(true);

      // Prefill form values from student record
      setFormValues((prev) => {
        const updated = { ...prev };
        const fullName = `${student.first_name || ""} ${student.last_name || ""}`.trim();
        if (fullName) updated["student_full_name"] = fullName;
        if (student.national_id) updated["student_national_id"] = student.national_id;
        if (student.parent_phone) updated["parent_phone"] = student.parent_phone;
        if (student.parent_name) updated["parent_name"] = student.parent_name;
        if (student.parent_email) updated["parent_email"] = student.parent_email;
        if (student.phone) updated["student_phone"] = student.phone;
        if (student.city) updated["city"] = student.city;
        if (student.grade) updated["grade"] = student.grade;
        if (student.gender) updated["gender"] = student.gender;
        if (student.parent_national_id) updated["parent_national_id"] = student.parent_national_id;
        return updated;
      });
    } else {
      setExistingStudent(null);
      setLookupDone(true);
    }
  }, []);

  const setFieldValue = (key: string, value: any) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
    setValidationErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    // Trigger student lookup when national ID changes
    if (key === "student_national_id") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        lookupStudent(value || "");
        checkEnrollmentHistory(value || "");
      }, 600);
    }

    // Re-check 30-min validity when grade changes
    if (key === "grade") {
      const nationalId = formValues["student_national_id"];
      if (nationalId) checkEnrollmentHistory(nationalId);
      // Reset lesson duration if 30 is no longer allowed
      const allowedGrades = ["א", "ב", "ג", "ד"];
      if (!allowedGrades.includes(value) && formValues["requested_lesson_duration"] === "30") {
        setFormValues((prev) => ({ ...prev, requested_lesson_duration: "" }));
      }
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (!field.is_required) continue;
      const val = formValues[field.field_key];
      if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
        errors[field.field_key] = "שדה חובה";
      }
      if (field.field_type === "email" && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
        errors[field.field_key] = 'כתובת דוא"ל לא תקינה';
      }
      // Phone validation for Israeli numbers
      if (field.field_type === "phone" && val) {
        const normalized = normalizePhone(val);
        if (normalized && !isValidIsraeliPhone(normalized)) {
          errors[field.field_key] = "יש להזין מספר טלפון ישראלי תקין";
        }
      }
    }
    if (!approvalChecked) {
      errors["__approval"] = "יש לאשר את תנאי ההרשמה";
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      if (!approvalChecked && approvalRef.current) {
        approvalRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        const firstErrorKey = Object.keys(validationErrors)[0];
        if (firstErrorKey) {
          const el = document.querySelector(`[data-field-key="${firstErrorKey}"]`);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    try {
      const knownMap: Record<string, any> = {};
      const customData: Record<string, any> = {};

      for (const field of fields) {
        const val = formValues[field.field_key];
        if (val === undefined || val === null) continue;

        if (field.field_key === "student_full_name") {
          const parts = String(val).trim().split(/\s+/);
          knownMap.student_first_name = parts[0];
          knownMap.student_last_name = parts.slice(1).join(" ") || parts[0];
        } else if (KNOWN_KEYS_SET.has(field.field_key)) {
          // Normalize phone values before saving
          if (field.field_type === "phone" && val) {
            knownMap[field.field_key] = normalizePhone(val);
          } else {
            knownMap[field.field_key] = val;
          }
        } else {
          customData[field.field_key] = val;
        }
      }

      const row: any = {
        academic_year_id: activeYear?.id || null,
        registration_page_id: page?.id || null,
        student_first_name: knownMap.student_first_name || "",
        student_last_name: knownMap.student_last_name || "",
        student_national_id: knownMap.student_national_id || "",
        gender: knownMap.gender || null,
        student_status: knownMap.student_status || null,
        branch_school_name: knownMap.branch_school_name || "",
        student_school_text: knownMap.student_school_text || "",
        grade: knownMap.grade || "",
        city: knownMap.city || "",
        student_phone: knownMap.student_phone || null,
        requested_instruments: knownMap.requested_instruments || [],
        requested_lesson_duration: knownMap.requested_lesson_duration || "",
        parent_name: knownMap.parent_name || "",
        parent_national_id: knownMap.parent_national_id || "",
        parent_phone: knownMap.parent_phone || "",
        parent_email: knownMap.parent_email || "",
        notes: knownMap.notes || null,
        approval_checked: true,
        status: "new",
        custom_data: Object.keys(customData).length > 0 ? customData : {},
      };

      const { error } = await supabase.from("registrations").insert(row);
      if (error) throw error;
      setSubmitted(true);
    } catch (err: any) {
      console.error("Registration error:", err);
      setSubmitError("אירעה שגיאה בשליחת הטופס. אנא נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  // Success screen
  if (submitted) {
    const msg = page?.success_message || "ההרשמה נקלטה בהצלחה! ניצור קשר לאחר בדיקת הפרטים.";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="pt-10 pb-10 space-y-6">
            <AppLogo size="lg" />
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-2xl font-bold text-foreground">ההרשמה נקלטה בהצלחה!</h2>
            <p className="text-muted-foreground text-lg whitespace-pre-line">{msg}</p>
            <Button
              onClick={() => {
                setSubmitted(false);
                setFormValues({});
                setApprovalChecked(false);
                setExistingStudent(null);
                setLookupDone(false);
              }}
              variant="outline"
              className="mt-2"
            >
              מילוי טופס הרשמה נוסף
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Loading
  if (yearLoading || pageLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  // Closed
  if (!page) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
        <Card className="w-full max-w-lg text-center">
          <CardContent className="pt-10 pb-10 space-y-4">
            <AlertCircle className="h-16 w-16 text-muted-foreground mx-auto" />
            <h2 className="text-2xl font-bold text-foreground">ההרשמה סגורה כרגע</h2>
            <p className="text-muted-foreground text-lg">טופס ההרשמה אינו פעיל בתקופה זו.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Group fields by section_title
  const fieldGroups: { title: string; fields: FieldDef[] }[] = [];
  for (const field of fields) {
    if (field.section_title || fieldGroups.length === 0) {
      fieldGroups.push({ title: field.section_title || "", fields: [field] });
    } else {
      fieldGroups[fieldGroups.length - 1].fields.push(field);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 py-6 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center">
            <AppLogo size="lg" />
          </div>
          {page.title && (
            <h1 className="text-xl sm:text-2xl font-bold text-foreground leading-snug whitespace-pre-line">
              {page.title}
            </h1>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          {/* Info sections */}
          {sections.length > 0 && (
            <Card>
              <CardContent className="pt-6 space-y-5 text-sm leading-relaxed text-foreground">
                {sections.map((section) => (
                  <InfoSectionBlock key={section.id} section={section} />
                ))}
              </CardContent>
            </Card>
          )}

          {/* Approval checkbox */}
          <Card ref={approvalRef}>
            <CardContent className="pt-6 space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="approval"
                  checked={approvalChecked}
                  onCheckedChange={(c) => {
                    setApprovalChecked(c === true);
                    setValidationErrors((prev) => { const n = { ...prev }; delete n["__approval"]; return n; });
                  }}
                  className="mt-0.5"
                />
                <Label htmlFor="approval" className="text-sm font-bold cursor-pointer leading-snug">
                  {page.approval_text || "קראתי את המידע ואני מאשר/ת את תנאי ההרשמה והלימודים"}
                </Label>
              </div>
              {validationErrors["__approval"] && (
                <p className="text-sm text-destructive">{validationErrors["__approval"]}</p>
              )}
            </CardContent>
          </Card>

          {/* Existing student banner */}
          {existingStudent && lookupDone && (
            <Card className="border-green-300 bg-green-50 dark:bg-green-950/20 dark:border-green-800">
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center gap-3">
                  <UserCheck className="h-6 w-6 text-green-600 dark:text-green-400 shrink-0" />
                  <div>
                    <p className="font-semibold text-green-800 dark:text-green-300 text-sm">
                      נמצא תלמיד/ה קיים/ת במערכת
                    </p>
                    <p className="text-green-700 dark:text-green-400 text-xs mt-0.5">
                      הפרטים מולאו אוטומטית. אנא עיינו ועדכנו פרטים שהשתנו.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Dynamic form fields grouped by section */}
          {fieldGroups.map((group, gi) => (
            <Card key={gi}>
              {group.title && (
                <CardHeader>
                  <CardTitle className="text-lg">{group.title}</CardTitle>
                </CardHeader>
              )}
              <CardContent className="space-y-4">
                {group.fields.map((field) => (
                  <DynamicField
                    key={field.id}
                    field={field}
                    value={formValues[field.field_key]}
                    onChange={(val) => setFieldValue(field.field_key, val)}
                    error={validationErrors[field.field_key]}
                    options={getOptionsForField(field)}
                  />
                ))}
              </CardContent>
            </Card>
          ))}

          {/* Submit */}
          {submitError && (
            <div className="text-sm text-destructive text-center bg-destructive/10 p-3 rounded-lg">{submitError}</div>
          )}

          <Button type="submit" size="lg" className="w-full text-lg h-14" disabled={submitting}>
            {submitting ? "שולח..." : "שליחת הרשמה"}
          </Button>
        </form>
      </div>
    </div>
  );
};

/* Dynamic field renderer */
const DynamicField = ({
  field,
  value,
  onChange,
  error,
  options,
}: {
  field: FieldDef;
  value: any;
  onChange: (val: any) => void;
  error?: string;
  options: { value: string; label: string }[];
}) => {
  const { field_type, label, is_required, placeholder, help_text } = field;

  const renderInput = () => {
    switch (field_type) {
      case "text":
      case "number":
        return <Input type={field_type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
      case "email":
        return <Input type="email" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir="ltr" className="text-left" />;
      case "phone":
        return <Input type="tel" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
      case "textarea":
        return <Textarea value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir="rtl" />;
      case "select":
        return (
          <Select dir="rtl" value={value || ""} onValueChange={onChange}>
            <SelectTrigger>
              <SelectValue placeholder={placeholder || "בחרו..."} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "multiselect": {
        const selected: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {options.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-2 rounded-lg border p-3 cursor-pointer transition-colors ${
                  selected.includes(opt.value) ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
              >
                <Checkbox
                  checked={selected.includes(opt.value)}
                  onCheckedChange={() => {
                    const updated = selected.includes(opt.value)
                      ? selected.filter((v) => v !== opt.value)
                      : [...selected, opt.value];
                    onChange(updated);
                  }}
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        );
      }
      case "radio":
        return (
          <div className="flex flex-col gap-2">
            {options.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input type="radio" checked={value === opt.value} onChange={() => onChange(opt.value)} className="accent-primary" />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        );
      default:
        return <Input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />;
    }
  };

  return (
    <div className="space-y-1.5" data-field-key={field.field_key}>
      <Label className="text-sm font-medium">
        {label}
        {is_required && <span className="text-destructive mr-1">*</span>}
      </Label>
      {renderInput()}
      {help_text && <p className="text-xs text-muted-foreground">{help_text}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
};

/* Info section block */
const InfoSectionBlock = ({ section }: { section: Section }) => {
  const lines = section.content.split("\n").filter((l) => l.trim());
  return (
    <div>
      {section.title && <h3 className="font-bold text-base mb-2">{section.title}</h3>}
      <div className="space-y-1.5 pr-1">
        {lines.map((line, i) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("•") || trimmed.startsWith("-")) {
            return <p key={i} className="pr-3">{trimmed}</p>;
          }
          return <p key={i}>{trimmed}</p>;
        })}
      </div>
    </div>
  );
};

export default PublicRegistration;
