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
import { normalizePhone } from "@/lib/phoneValidation";

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

// Strict validation helpers (consistent with school_music_students forms)
function validateNationalId(val: string): string | null {
  const digits = val.replace(/\D/g, "");
  if (digits.length !== 9) return "ת.ז. חייבת להכיל 9 ספרות בדיוק";
  return null;
}

function validateMobilePhone(val: string): string | null {
  const digits = val.replace(/\D/g, "");
  if (digits.length !== 10) return "מספר טלפון נייד חייב להכיל 10 ספרות בדיוק";
  if (!/^05\d{8}$/.test(digits)) return "מספר טלפון נייד חייב להתחיל ב-05";
  return null;
}

function validateEmail(val: string): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim())) return 'כתובת דוא"ל לא תקינה';
  return null;
}

// Educational schools will be loaded from DB

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
  const [branchOtherMode, setBranchOtherMode] = useState(false);
  const [eduSchoolOtherMode, setEduSchoolOtherMode] = useState(false);
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

  // Load schools (for branch/study branch select)
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

  // Fetch last enrollment's school for returning students (pre-fill branch)
  const fetchLastEnrollmentBranch = useCallback(async (studentId: string) => {
    const { data } = await supabase
      .from("enrollments")
      .select("school_id, schools(name)")
      .eq("student_id", studentId)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && (data as any).schools?.name) {
      setFormValues((prev) => {
        // Only set if not already set by user
        if (!prev["branch_school_name"]) {
          return { ...prev, branch_school_name: (data as any).schools.name };
        }
        return prev;
      });
    }
  }, []);

  const checkEnrollmentHistory = useCallback(async (nationalId: string) => {
    if (!nationalId || nationalId.length < 5) {
      setHasEnrollmentHistory(false);
      return;
    }
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
      if ((count || 0) > 0) {
        fetchLastEnrollmentBranch(student.id);
      }
    } else {
      setHasEnrollmentHistory(false);
    }
  }, [fetchLastEnrollmentBranch]);

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
        if (tokenData.branch_school_name) updated["branch_school_name"] = tokenData.branch_school_name;
        if ((tokenData as any).educational_school) updated["educational_school"] = (tokenData as any).educational_school;
        return updated;
      });
      setExistingStudent({ first_name: tokenData.student_first_name, last_name: tokenData.student_last_name });
      setLookupDone(true);
      if (tokenData.student_national_id) {
        checkEnrollmentHistory(tokenData.student_national_id);
      }
    }
  }, [tokenData, tokenRegistration, checkEnrollmentHistory]);

  // Helper: is 30-min option allowed for this student?
  const is30MinAllowed = useCallback(() => {
    const grade = formValues["grade"];
    if (!grade) return true;
    const allowedGrades = ["א", "ב", "ג", "ד"];
    if (!allowedGrades.includes(grade)) return false;
    if (hasEnrollmentHistory) return false;
    return true;
  }, [formValues, hasEnrollmentHistory]);

  const getOptionsForField = (field: FieldDef) => {
    if (field.data_source === "instruments") return instruments.map((i) => ({ value: i.name, label: i.name }));
    // Branch/study branch field: use schools table
    if (field.field_key === "branch_school_name" || field.data_source === "schools") {
      return [
        ...schools.map((s) => ({ value: s.name, label: s.name })),
        { value: "__other__", label: "אחר" },
      ];
    }
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

  // Determine field type override
  const getFieldTypeOverride = (field: FieldDef): string => {
    if (field.field_key === "student_status") return "__hidden__";
    // student_school_text is now replaced by branch_school_name (select) — hide it
    if (field.field_key === "student_school_text") return "__hidden__";
    // branch_school_name: force select
    if (field.field_key === "branch_school_name") return "select";
    return field.field_type;
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

    // Handle branch "Other" mode
    if (key === "branch_school_name") {
      if (value === "__other__") {
        setBranchOtherMode(true);
        setFormValues((prev) => ({ ...prev, branch_school_name: "" }));
        return;
      }
    }

    // Handle educational school "Other" mode
    if (key === "educational_school") {
      if (value === "__other__") {
        setEduSchoolOtherMode(true);
        setFormValues((prev) => ({ ...prev, educational_school: "" }));
        return;
      }
    }

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
      const allowedGrades = ["א", "ב", "ג", "ד"];
      if (!allowedGrades.includes(value) && formValues["requested_lesson_duration"] === "30") {
        setFormValues((prev) => ({ ...prev, requested_lesson_duration: "" }));
      }
    }
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    for (const field of fields) {
      if (field.field_key === "student_status") continue;
      if (field.field_key === "student_school_text") continue; // replaced by branch_school_name

      const val = formValues[field.field_key];

      if (field.is_required) {
        if (val === undefined || val === null || val === "" || (Array.isArray(val) && val.length === 0)) {
          errors[field.field_key] = "שדה חובה";
          continue;
        }
      }

      if (!val) continue;

      if (field.field_key === "student_national_id" || field.field_key === "parent_national_id") {
        const err = validateNationalId(String(val));
        if (err) errors[field.field_key] = err;
      }

      if (field.field_type === "phone" && val) {
        const err = validateMobilePhone(String(val));
        if (err) errors[field.field_key] = err;
      }

      if (field.field_type === "email" && val) {
        const err = validateEmail(String(val));
        if (err) errors[field.field_key] = err;
      }
    }

    // Validate educational_school (injected field, not from DB fields)
    // It's optional, no required validation needed

    // Validate branch_school_name is required
    if (!formValues["branch_school_name"]) {
      errors["branch_school_name"] = "שדה חובה";
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
        const errorKeys = Object.keys(validationErrors);
        if (errorKeys.length > 0) {
          setTimeout(() => {
            const firstErrorKey = Object.keys(validationErrors)[0];
            if (firstErrorKey) {
              const el = document.querySelector(`[data-field-key="${firstErrorKey}"]`);
              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
          }, 50);
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
        if (field.field_key === "student_status") continue;
        if (field.field_key === "student_school_text") continue;

        const val = formValues[field.field_key];
        if (val === undefined || val === null) continue;

        if (field.field_key === "student_full_name") {
          const parts = String(val).trim().split(/\s+/);
          knownMap.student_first_name = parts[0];
          knownMap.student_last_name = parts.slice(1).join(" ") || parts[0];
        } else if (KNOWN_KEYS_SET.has(field.field_key)) {
          if (field.field_type === "phone" && val) {
            knownMap[field.field_key] = normalizePhone(val);
          } else {
            knownMap[field.field_key] = val;
          }
        } else {
          customData[field.field_key] = val;
        }
      }

      // Auto-determine student_status
      const isReturning = !!(tokenRegistration?.existing_student_id || existingStudent);
      const autoStatus = isReturning ? "ממשיך" : "חדש";

      const row: any = {
        academic_year_id: activeYear?.id || null,
        registration_page_id: page?.id || null,
        student_first_name: knownMap.student_first_name || "",
        student_last_name: knownMap.student_last_name || "",
        student_national_id: knownMap.student_national_id || "",
        gender: knownMap.gender || null,
        student_status: autoStatus,
        branch_school_name: formValues["branch_school_name"] || "",
        student_school_text: formValues["branch_school_name"] || "", // keep sync for backward compat
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
        existing_student_id: tokenRegistration?.existing_student_id || null,
        educational_school: formValues["educational_school"] || null,
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
                setBranchOtherMode(false);
                setEduSchoolOtherMode(false);
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

  // Separate fields into groups, injecting educational_school and branch_school_name
  const visibleFields = fields.filter((f) => getFieldTypeOverride(f) !== "__hidden__");

  // Find insertion points: grade field (for edu school), and requested_instruments/requested_lesson_duration (for branch)
  const gradeFieldIdx = visibleFields.findIndex((f) => f.field_key === "grade");
  const instrumentFieldIdx = visibleFields.findIndex(
    (f) => f.field_key === "requested_instruments" || f.field_key === "requested_lesson_duration"
  );
  // Find last instrument-related field
  const lastInstrumentIdx = visibleFields.reduce((last, f, i) => {
    if (f.field_key === "requested_instruments" || f.field_key === "requested_lesson_duration") return i;
    return last;
  }, instrumentFieldIdx);

  // Build ordered field keys with injected fields
  type RenderItem = { type: "db_field"; field: FieldDef } | { type: "injected"; key: string };
  const renderItems: RenderItem[] = [];

  for (let i = 0; i < visibleFields.length; i++) {
    renderItems.push({ type: "db_field", field: visibleFields[i] });

    // After grade field: inject educational_school
    if (i === gradeFieldIdx && gradeFieldIdx >= 0) {
      renderItems.push({ type: "injected", key: "educational_school" });
    }

    // After last instrument/duration field: inject branch_school_name
    if (i === lastInstrumentIdx && lastInstrumentIdx >= 0) {
      renderItems.push({ type: "injected", key: "branch_school_name" });
    }
  }

  // If no grade field found, add educational_school at end
  if (gradeFieldIdx < 0) {
    renderItems.push({ type: "injected", key: "educational_school" });
  }
  // If no instrument field found, add branch at end
  if (lastInstrumentIdx < 0) {
    renderItems.push({ type: "injected", key: "branch_school_name" });
  }

  // Group by section_title
  const fieldGroups: { title: string; items: RenderItem[] }[] = [];
  for (const item of renderItems) {
    const sectionTitle = item.type === "db_field" ? (item.field.section_title || "") : "";
    if (sectionTitle || fieldGroups.length === 0) {
      fieldGroups.push({ title: sectionTitle, items: [item] });
    } else {
      fieldGroups[fieldGroups.length - 1].items.push(item);
    }
  }

  // Render educational school field
  const renderEducationalSchool = () => {
    if (eduSchoolOtherMode) {
      return (
        <div className="space-y-1.5" data-field-key="educational_school">
          <Label className="text-sm font-medium">בית ספר ללימודי בוקר</Label>
          <div className="flex gap-2">
            <Input
              value={formValues["educational_school"] || ""}
              onChange={(e) => setFieldValue("educational_school", e.target.value)}
              placeholder="הקלידו שם בית ספר..."
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setEduSchoolOtherMode(false);
                setFormValues((prev) => ({ ...prev, educational_school: "" }));
              }}
            >
              חזרה לרשימה
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="space-y-1.5" data-field-key="educational_school">
        <Label className="text-sm font-medium">בית ספר ללימודי בוקר</Label>
        <Select
          dir="rtl"
          value={formValues["educational_school"] || ""}
          onValueChange={(v) => setFieldValue("educational_school", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="בחרו בית ספר..." />
          </SelectTrigger>
          <SelectContent>
            {EDUCATIONAL_SCHOOLS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
            <SelectItem value="__other__">אחר</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  };

  // Render branch/study-branch field
  const renderBranchField = () => {
    if (branchOtherMode) {
      return (
        <div className="space-y-1.5" data-field-key="branch_school_name">
          <Label className="text-sm font-medium">
            שלוחת לימודים
            <span className="text-destructive mr-1">*</span>
          </Label>
          <div className="flex gap-2">
            <Input
              value={formValues["branch_school_name"] || ""}
              onChange={(e) => setFieldValue("branch_school_name", e.target.value)}
              placeholder="הקלידו שם שלוחה..."
              className="flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setBranchOtherMode(false);
                setFormValues((prev) => ({ ...prev, branch_school_name: "" }));
              }}
            >
              חזרה לרשימה
            </Button>
          </div>
          {validationErrors["branch_school_name"] && (
            <p className="text-sm text-destructive">{validationErrors["branch_school_name"]}</p>
          )}
        </div>
      );
    }
    return (
      <div className="space-y-1.5" data-field-key="branch_school_name">
        <Label className="text-sm font-medium">
          שלוחת לימודים
          <span className="text-destructive mr-1">*</span>
        </Label>
        <Select
          dir="rtl"
          value={formValues["branch_school_name"] || ""}
          onValueChange={(v) => setFieldValue("branch_school_name", v)}
        >
          <SelectTrigger>
            <SelectValue placeholder="בחרו שלוחה..." />
          </SelectTrigger>
          <SelectContent>
            {schools.map((s) => (
              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
            ))}
            <SelectItem value="__other__">אחר</SelectItem>
          </SelectContent>
        </Select>
        {validationErrors["branch_school_name"] && (
          <p className="text-sm text-destructive">{validationErrors["branch_school_name"]}</p>
        )}
      </div>
    );
  };

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
                      נמצא תלמיד/ה קיים/ת במערכת — סטטוס: ממשיך
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
                {group.items.map((item, ii) => {
                  if (item.type === "injected") {
                    if (item.key === "educational_school") return <div key="edu_school">{renderEducationalSchool()}</div>;
                    if (item.key === "branch_school_name") return <div key="branch">{renderBranchField()}</div>;
                    return null;
                  }

                  const field = item.field;
                  const typeOverride = getFieldTypeOverride(field);

                  return (
                    <DynamicField
                      key={field.id}
                      field={{ ...field, field_type: typeOverride }}
                      value={formValues[field.field_key]}
                      onChange={(val) => setFieldValue(field.field_key, val)}
                      error={validationErrors[field.field_key]}
                      options={getOptionsForField(field)}
                    />
                  );
                })}
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
        return <Input type="tel" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "05XXXXXXXX"} />;
      case "textarea":
        return <Textarea value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir="rtl" />;
      case "select":
        return (
          <Select dir="rtl" value={value || ""} onValueChange={(v) => {
            const opt = options.find((o) => o.value === v);
            if ((opt as any)?.disabled) return;
            onChange(v);
          }}>
            <SelectTrigger>
              <SelectValue placeholder={placeholder || "בחרו..."} />
            </SelectTrigger>
            <SelectContent>
              {options.map((opt) => (
                <SelectItem
                  key={opt.value}
                  value={opt.value}
                  disabled={(opt as any)?.disabled}
                  className={(opt as any)?.disabled ? "opacity-50" : ""}
                >
                  {opt.label}
                </SelectItem>
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
