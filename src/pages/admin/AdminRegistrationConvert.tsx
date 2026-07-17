import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { UserCheck, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { GRADES } from "@/lib/constants";
import { computeDefaultInstrumentStartDate } from "@/lib/enrollmentDefaults";

interface ConvertFormData {
  // Student fields
  first_name: string;
  last_name: string;
  national_id: string;
  gender: string;
  grade: string;
  city: string;
  educational_school: string;
  phone: string;
  parent_name: string;
  parent_national_id: string;
  parent_phone: string;
  parent_email: string;
  // Enrollment fields
  teacher_id: string;
  instrument_id: string;
  school_id: string;
  lesson_duration_minutes: string;
  lesson_type: string;
  instrument_start_date: string;
}

const DURATION_OPTIONS = [
  { value: "30", label: "30 דקות" },
  { value: "45", label: "45 דקות" },
  { value: "60", label: "60 דקות" },
];

type MergeDecision = "keep" | "replace" | "both";

const COMPARE_FIELDS: { key: string; label: string; display?: (v: any) => string }[] = [
  { key: "national_id", label: "ת.ז. תלמיד/ה" },
  { key: "gender", label: "מגדר", display: (v) => (v === "male" ? "זכר" : v === "female" ? "נקבה" : v || "") },
  { key: "grade", label: "כיתה" },
  { key: "city", label: "ישוב" },
  { key: "educational_school", label: "בית הספר" },
  { key: "phone", label: "טלפון תלמיד/ה" },
  { key: "parent_name", label: "שם הורה" },
  { key: "parent_national_id", label: "ת.ז. הורה" },
  { key: "parent_phone", label: "טלפון הורה" },
  { key: "parent_email", label: "אימייל הורה" },
];
const SECONDARY_FIELDS = new Set(["parent_name", "parent_national_id", "parent_phone", "parent_email"]);

const normalizeCompare = (v: any) => {
  if (v === null || v === undefined || v === "__none__") return "";
  return String(v).trim().toLowerCase().replace(/[\u200E\u200F\uFEFF]/g, "");
};


const AdminRegistrationConvert = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [useExisting, setUseExisting] = useState<boolean | null>(null);
  const [showAllTeachers, setShowAllTeachers] = useState(false);
  const [mergeDecisions, setMergeDecisions] = useState<Record<string, MergeDecision>>({});

  const { data: registration, isLoading: regLoading } = useQuery({
    queryKey: ["admin-registration", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations" as any)
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const { data: existingStudent } = useQuery({
    queryKey: ["admin-student", registration?.existing_student_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("id", registration.existing_student_id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!registration?.existing_student_id,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  // Target year = registration's year (fallback to active year)
  const { data: targetYear } = useQuery({
    queryKey: ["target-year-for-registration", registration?.academic_year_id],
    enabled: !!registration,
    queryFn: async () => {
      if (registration?.academic_year_id) {
        const { data } = await supabase
          .from("academic_years")
          .select("id, name, start_date")
          .eq("id", registration.academic_year_id)
          .single();
        if (data) return data;
      }
      const { data } = await supabase
        .from("academic_years")
        .select("id, name, start_date")
        .eq("is_active", true)
        .single();
      return data;
    },
  });
  const activeYear = targetYear; // alias to minimize diff

  const { data: teachers = [] } = useQuery({
    queryKey: ["admin-teachers-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, first_name, last_name")
        .eq("is_active", true);
      if (error) throw error;
      return [...(data || [])].sort((a, b) =>
        `${a.last_name || ""} ${a.first_name || ""}`.localeCompare(`${b.last_name || ""} ${b.first_name || ""}`, "he")
      );
    },
  });

  const { data: instruments = [] } = useQuery({
    queryKey: ["admin-instruments-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name");
      if (error) throw error;
      return [...(data || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "", "he"));
    },
  });

  const { data: educationalSchools = [] } = useQuery({
    queryKey: ["educational-schools-active"],
    queryFn: async () => {
      const { data } = await supabase.from("educational_schools").select("id, name").eq("is_active", true);
      return [...(data || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "", "he"));
    },
  });

  const { data: allTeacherInstruments = [] } = useQuery({
    queryKey: ["admin-all-teacher-instruments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_instruments")
        .select("teacher_id, instrument_id");
      if (error) throw error;
      return data;
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["admin-schools-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").eq("is_active", true);
      if (error) throw error;
      return [...(data || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "", "he"));
    },
  });

  // Existing student's enrollments in active year (to warn about duplicates)
  const { data: existingEnrollments = [] } = useQuery({
    queryKey: ["existing-enrollments-year", registration?.existing_student_id, activeYear?.id],
    enabled: !!registration?.existing_student_id && !!activeYear?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, is_active, instrument_id, instruments(name), teachers(first_name, last_name), schools(name), lesson_duration_minutes")
        .eq("student_id", registration!.existing_student_id)
        .eq("academic_year_id", activeYear!.id);
      if (error) throw error;
      return data;
    },
  });

  const { register, handleSubmit, reset, control, watch, formState: { errors } } = useForm<ConvertFormData>({
    defaultValues: {
      lesson_duration_minutes: "45",
      lesson_type: "individual",
      gender: "__none__",
      grade: "__none__",
    },
  });

  const selectedTeacherId = watch("teacher_id");

  // Determine requested instrument IDs from registration
  const requestedInstrumentNames = (registration?.requested_instruments as string[]) || [];
  const requestedInstrumentIds = new Set(
    instruments
      .filter((i) => requestedInstrumentNames.some((name) => i.name === name))
      .map((i) => i.id)
  );

  // Filter teachers: show only those who teach at least one requested instrument
  const relevantTeacherIds = new Set(
    allTeacherInstruments
      .filter((ti) => requestedInstrumentIds.has(ti.instrument_id))
      .map((ti) => ti.teacher_id)
  );
  const canFilterTeachers = requestedInstrumentIds.size > 0 && relevantTeacherIds.size > 0;
  const filteredTeachers = canFilterTeachers && !showAllTeachers
    ? teachers.filter((t) => relevantTeacherIds.has(t.id))
    : teachers;

  // Filter instruments by selected teacher
  const teacherInstrumentIds = new Set(
    allTeacherInstruments
      .filter((ti) => ti.teacher_id === selectedTeacherId)
      .map((ti) => ti.instrument_id)
  );
  const hasTeacherInstruments = selectedTeacherId && teacherInstrumentIds.size > 0;
  const filteredInstruments = hasTeacherInstruments
    ? instruments.filter((i) => teacherInstrumentIds.has(i.id))
    : instruments;

  // Prefill form from registration data
  useEffect(() => {
    if (!registration) return;
    const r = registration;

    // Determine duration from registration
    let duration = "45";
    if (r.requested_lesson_duration) {
      const d = String(r.requested_lesson_duration).replace(/\D/g, "");
      if (["30", "45", "60"].includes(d)) duration = d;
    }

    // Try to match school by name
    const matchedSchool = schools.find(
      (s) => s.name === r.branch_school_name
    );

    const es: any = existingStudent || {};
    const pick = (esVal: any, rVal: any) => {
      const e = esVal === null || esVal === undefined ? "" : String(esVal).trim();
      return e ? esVal : (rVal || "");
    };

    reset({
      first_name: pick(es.first_name, r.student_first_name) || "",
      last_name: pick(es.last_name, r.student_last_name) || "",
      national_id: pick(es.national_id, r.student_national_id) || "",
      gender: es.gender || r.gender || "__none__",
      grade: es.grade || r.grade || "__none__",
      city: pick(es.city, r.city) || "",
      educational_school: pick(es.educational_school, r.educational_school) || "",
      phone: pick(es.phone, r.student_phone) || "",
      parent_name: pick(es.parent_name, r.parent_name) || "",
      parent_national_id: pick(es.parent_national_id, r.parent_national_id) || "",
      parent_phone: pick(es.parent_phone, r.parent_phone) || "",
      parent_email: pick(es.parent_email, r.parent_email) || "",
      teacher_id: "",
      instrument_id: "",
      school_id: matchedSchool?.id || "",
      lesson_duration_minutes: duration,
      lesson_type: "individual",
      instrument_start_date: computeDefaultInstrumentStartDate(targetYear),
    });

    // Auto-decide existing student usage
    if (r.existing_student_id && r.match_type === "id_match") {
      setUseExisting(true);
    } else if (!r.existing_student_id) {
      setUseExisting(false);
    }
    // name_match: leave null for admin to decide
  }, [registration, schools, reset, targetYear, existingStudent]);


  const convertMutation = useMutation({
    mutationFn: async (data: ConvertFormData) => {
      const r = registration;
      let studentId: string;

      if (useExisting && r.existing_student_id) {
        // Use existing student — per-field merge based on admin decisions
        studentId = r.existing_student_id;
        const updates: Record<string, any> = {};
        const newVals: Record<string, any> = {
          national_id: data.national_id,
          gender: data.gender === "__none__" ? null : data.gender,
          grade: data.grade === "__none__" ? null : data.grade,
          city: data.city,
          educational_school: data.educational_school,
          phone: data.phone,
          parent_name: data.parent_name,
          parent_national_id: data.parent_national_id,
          parent_phone: data.parent_phone,
          parent_email: data.parent_email,
        };
        for (const key of Object.keys(newVals)) {
          const raw = newVals[key];
          const newV = raw === null || raw === undefined ? "" : String(raw).trim();
          if (!newV) continue;
          const oldRaw = (existingStudent as any)?.[key];
          const oldV = oldRaw === null || oldRaw === undefined ? "" : String(oldRaw).trim();
          if (!oldV) {
            // Fill missing field — safe, no data loss
            updates[key] = newV;
            continue;
          }
          if (newV === oldV) continue;
          const dec = mergeDecisions[key] || "keep";
          if (dec === "replace") {
            updates[key] = newV;
          } else if (dec === "both" && SECONDARY_FIELDS.has(key)) {
            const sec = (existingStudent as any)?.[`${key}_2`];
            if (!sec || String(sec).trim() === "") {
              updates[`${key}_2`] = newV;
            }
          }
          // 'keep' → do nothing
        }
        if ((r as any).wants_music_production) updates.has_music_production_course = true;
        if ((r as any).wants_recital_track) updates.has_recital_track = true;
        // If student was previously stopped/inactive — reactivate on re-registration
        if ((existingStudent as any)?.student_status === "הפסיק") updates.student_status = "פעיל";
        if (existingStudent && (existingStudent as any).is_active === false) updates.is_active = true;

        if (Object.keys(updates).length > 0) {
          await supabase.from("students").update(updates as any).eq("id", studentId);
        }
      } else {
        // Create new student
        const { data: newStudent, error: studentErr } = await supabase
          .from("students")
          .insert({
            first_name: data.first_name,
            last_name: data.last_name,
            national_id: data.national_id || null,
            gender: data.gender === "__none__" ? null : data.gender || null,
            grade: data.grade === "__none__" ? null : data.grade || null,
            city: data.city || null,
            educational_school: data.educational_school || null,
            phone: data.phone || null,
            parent_name: data.parent_name || null,
            parent_national_id: data.parent_national_id || null,
            parent_phone: data.parent_phone || null,
            parent_email: data.parent_email || null,
            is_active: true,
            has_music_production_course: !!(r as any).wants_music_production,
            has_recital_track: !!(r as any).wants_recital_track,
          } as any)
          .select("id")
          .single();
        if (studentErr) throw studentErr;
        studentId = newStudent.id;
      }

      // Create enrollment
      const enrollGrade = data.grade === "__none__" ? null : data.grade || null;
      const { error: enrollErr } = await supabase.from("enrollments").insert({
        student_id: studentId,
        teacher_id: data.teacher_id,
        instrument_id: data.instrument_id,
        school_id: data.school_id,
        lesson_duration_minutes: Number(data.lesson_duration_minutes),
        lesson_type: data.lesson_type as "individual" | "group",
        start_date: data.instrument_start_date,
        instrument_start_date: data.instrument_start_date || null,
        academic_year_id: activeYear?.id || r.academic_year_id || null,
        is_active: true,
        grade: enrollGrade,
      });
      if (enrollErr) throw enrollErr;

      // Determine if fully converted or only partially, based on requested slots vs existing enrollments
      const requestedNames = (r.requested_instruments as string[] | null) || [];
      let guitarSeen = false, bassSeen = false, slots = 0;
      for (const raw of requestedNames) {
        const name = (raw ?? "").trim();
        if (!name) continue;
        if (name.includes("בס")) { if (!bassSeen) { slots++; bassSeen = true; } continue; }
        if (name.includes("גיטרה")) { if (!guitarSeen) { slots++; guitarSeen = true; } continue; }
        slots++;
      }
      const yearId = activeYear?.id || r.academic_year_id || null;
      const { count: enrollCount } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("student_id", studentId)
        .eq("academic_year_id", yearId as string);
      const newStatus = slots > 0 && (enrollCount ?? 0) < slots ? "partially_converted" : "converted";

      // Update registration status
      const { error: regErr } = await supabase
        .from("registrations" as any)
        .update({
          status: newStatus,
          existing_student_id: studentId,
          match_type: "id_match",
        })
        .eq("id", r.id);
      if (regErr) throw regErr;

      return studentId;
    },
    onSuccess: (studentId) => {
      queryClient.invalidateQueries({ queryKey: ["admin-registration", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      queryClient.invalidateQueries({ queryKey: ["admin-student", studentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      toast.success("ההרשמה הומרה בהצלחה — תלמיד ושיוך נוצרו");
      navigate(`/admin/students/${studentId}`);
    },
    onError: (err: any) => {
      const msg = String(err?.message || "");
      if (msg.includes("enrollments_student_instrument_year_unique") || (err?.code === "23505" && msg.includes("enrollments"))) {
        toast.error("לתלמיד כבר קיים שיוך לכלי הזה בשנה הנוכחית. ערוך את השיוך הקיים או בחר כלי נגינה אחר.");
      } else {
        toast.error(msg || "שגיאה בהמרת ההרשמה");
      }
    },
  });

  if (regLoading) {
    return (
      <AdminLayout title="טוען..." backPath={`/admin/registrations/${id}`}>
        <PageTitle title="שיוך הרשמה" />
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      </AdminLayout>
    );
  }

  if (!registration) {
    return (
      <AdminLayout title="הרשמה" backPath="/admin/registrations">
        <PageTitle title="שיוך הרשמה" />
        <p className="text-center text-muted-foreground py-8">ההרשמה לא נמצאה</p>
      </AdminLayout>
    );
  }

  const r = registration;
  const isIdMatch = r.match_type === "id_match";
  const isNameMatch = r.match_type === "name_match";
  const requestedInstruments = (r.requested_instruments as string[]) || [];
  const formValues = watch();
  const visibleExistingStudentPhone = existingStudent?.phone || formValues.phone || r.student_phone;
  const visibleExistingStudentNationalId = existingStudent?.national_id || r.student_national_id;


  return (
    <AdminLayout
      title={`טיפול בהרשמה — ${r.student_first_name} ${r.student_last_name}`}
      backPath={`/admin/registrations/${id}`}

    >
      <PageTitle title={`שיוך הרשמה — ${r.student_first_name} ${r.student_last_name}`} />
      <form onSubmit={handleSubmit((d) => convertMutation.mutate(d))} className="space-y-5 max-w-2xl">


        {/* Existing student decision */}
        {r.existing_student_id && (
          <Card>
            <CardContent className="pt-5 space-y-4">
              {isIdMatch && (
                <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                  <UserCheck className="h-5 w-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-800 dark:text-green-200">
                      נמצא תלמיד קיים לפי ת.ז. — ישתמש בתלמיד הקיים
                    </p>
                    {existingStudent && (
                      <p className="text-xs text-green-600">
                        {existingStudent.first_name} {existingStudent.last_name}
                        {existingStudent.national_id ? ` (ת.ז. ${existingStudent.national_id})` : ""}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {isNameMatch && (
                <div className="space-y-3">
                  <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700 rounded-lg p-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                        נמצא תלמיד קיים עם אותו שם. יש לבדוק האם זו אותה הרשמה.
                      </p>
                      {existingStudent && (
                        <p className="text-xs text-amber-700 mt-1">
                          {existingStudent.first_name} {existingStudent.last_name}
                          {existingStudent.national_id ? ` (ת.ז. ${existingStudent.national_id})` : ""}
                          {existingStudent.grade ? ` · כיתה ${existingStudent.grade}` : ""}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={useExisting === true ? "default" : "outline"}
                      onClick={() => setUseExisting(true)}
                    >
                      <UserCheck className="h-4 w-4 ml-1" />
                      השתמש בתלמיד קיים
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={useExisting === false ? "default" : "outline"}
                      onClick={() => setUseExisting(false)}
                    >
                      צור כתלמיד חדש
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Registration info summary */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">מידע מההרשמה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">כלים מבוקשים: </span>
                <span className="font-medium">{requestedInstruments.join(", ") || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">משך שיעור: </span>
                <span className="font-medium">{r.requested_lesson_duration || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">שלוחה: </span>
                <span className="font-medium">{r.branch_school_name || "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground">סטטוס: </span>
                <span className="font-medium">
                  {r.student_status === "new" ? "תלמיד/ה חדש/ה" : r.student_status === "continuing" ? "ממשיך/ה" : "—"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Student details - editable, prefilled */}
        {useExisting !== true && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">פרטי תלמיד/ה (ייווצר תלמיד חדש)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">שם פרטי *</Label>
                  <Input {...register("first_name", { required: "שדה חובה" })} className="h-12 rounded-xl" />
                  {errors.first_name && <p className="text-sm text-destructive">{errors.first_name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">שם משפחה *</Label>
                  <Input {...register("last_name", { required: "שדה חובה" })} className="h-12 rounded-xl" />
                  {errors.last_name && <p className="text-sm text-destructive">{errors.last_name.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">ת.ז.</Label>
                  <Input {...register("national_id")} className="h-12 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">מגדר</Label>
                  <Controller
                    name="gender"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">ללא</SelectItem>
                          <SelectItem value="male">זכר</SelectItem>
                          <SelectItem value="female">נקבה</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">כיתה</Label>
                  <Controller
                    name="grade"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">ללא</SelectItem>
                          {GRADES.map((g) => (
                            <SelectItem key={g} value={g}>{g}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">ישוב</Label>
                  <Input {...register("city")} className="h-12 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">בית הספר</Label>
                  <Controller
                    name="educational_school"
                    control={control}
                    render={({ field }) => {
                      const val = field.value || "";
                      const inList = !val || educationalSchools.some((s) => s.name === val);
                      const isOther = !!val && !inList;
                      if (isOther) {
                        return (
                          <div className="flex gap-2">
                            <Input
                              value={val}
                              onChange={(e) => field.onChange(e.target.value)}
                              placeholder="שם בית ספר"
                              className="h-12 rounded-xl flex-1"
                            />
                            <Button type="button" variant="outline" className="h-12 rounded-xl" onClick={() => field.onChange("")}>
                              בחר מהרשימה
                            </Button>
                          </div>
                        );
                      }
                      return (
                        <Select
                          value={val || "__none__"}
                          onValueChange={(v) => {
                            if (v === "__other__") { field.onChange("אחר"); return; }
                            field.onChange(v === "__none__" ? "" : v);
                          }}
                        >
                          <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="בחר בית ספר" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">ללא</SelectItem>
                            {educationalSchools.map((s) => (
                              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                            ))}
                            <SelectItem value="__other__">אחר (הקלד ידנית)</SelectItem>
                          </SelectContent>
                        </Select>
                      );
                    }}
                  />

                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">טלפון תלמיד/ה</Label>
                  <Input {...register("phone")} type="tel" className="h-12 rounded-xl" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {useExisting === true && existingStudent && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">תלמיד קיים — {existingStudent.first_name} {existingStudent.last_name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">ת.ז.: </span>
                  <span>{visibleExistingStudentNationalId || "—"}</span>
                  {!existingStudent.national_id && visibleExistingStudentNationalId && (
                    <span className="text-xs text-muted-foreground">מההרשמה</span>
                  )}
                </div>
                <div><span className="text-muted-foreground">כיתה: </span>{existingStudent.grade || "—"}</div>
                <div><span className="text-muted-foreground">ישוב: </span>{existingStudent.city || "—"}</div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">טלפון: </span>
                  {visibleExistingStudentPhone ? <PhoneDisplay phone={visibleExistingStudentPhone} /> : "—"}
                  {!existingStudent.phone && visibleExistingStudentPhone && (
                    <span className="text-xs text-muted-foreground">מההרשמה</span>
                  )}
                </div>
              </div>


              {/* Existing enrollments in active year */}
              {existingEnrollments.length > 0 && (
                <div className="space-y-2 border-t pt-3">
                  <p className="text-sm font-medium">
                    שיוכים קיימים לשנה {activeYear?.name || "הפעילה"}:
                  </p>
                  <div className="space-y-1.5">
                    {existingEnrollments.map((e: any) => (
                      <div
                        key={e.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 p-2.5 text-sm"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">
                            {e.instruments?.name}
                            {!e.is_active && <span className="text-xs text-muted-foreground"> (לא פעיל)</span>}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {e.teachers?.first_name} {e.teachers?.last_name} · {e.schools?.name} · {e.lesson_duration_minutes} דק׳
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="shrink-0 h-9 rounded-lg"
                          onClick={() => navigate(`/admin/enrollments/${e.id}/edit`)}
                        >
                          ערוך
                        </Button>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-amber-600">
                    שים לב: לא ניתן ליצור שיוך נוסף לאותו כלי באותה שנה. ערוך שיוך קיים או בחר כלי אחר.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Per-field merge UI — shown only when reusing existing student and there are conflicts */}
        {useExisting === true && existingStudent && (() => {
          const conflicts = COMPARE_FIELDS.filter((f) => {
            const nv = normalizeCompare((watch() as any)[f.key]);
            const ovs = normalizeCompare((existingStudent as any)[f.key]);
            return nv && ovs && nv !== ovs;
          });

          if (conflicts.length === 0) return null;
          return (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">מיזוג נתונים — נתונים שונים בהרשמה החדשה</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  זוהו שדות עם ערכים שונים בין התלמיד הקיים לבין ההרשמה החדשה. ברירת המחדל היא לשמור את הקיים. ניתן להחליף, או — בשדות הורה — לשמור את שני הערכים.
                </p>
                {conflicts.map((f) => {
                  const disp = f.display || ((v: any) => (v === null || v === undefined ? "" : String(v)));
                  const oldV = disp((existingStudent as any)[f.key]);
                  const rawNew = (watch() as any)[f.key];
                  const newV = disp(rawNew === "__none__" ? "" : rawNew);
                  const hasSecondary = SECONDARY_FIELDS.has(f.key);
                  const secondaryVal = hasSecondary ? (existingStudent as any)?.[`${f.key}_2`] : null;
                  const secondaryFilled = hasSecondary && secondaryVal && String(secondaryVal).trim() !== "";
                  const decision = mergeDecisions[f.key] || "keep";
                  return (
                    <div key={f.key} className="rounded-lg border border-border p-3 space-y-2">
                      <p className="text-sm font-medium">{f.label}</p>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="rounded bg-muted/40 p-2">
                          <p className="text-xs text-muted-foreground">קיים</p>
                          <p className="font-medium break-words">{oldV}</p>
                          {hasSecondary && secondaryFilled && (
                            <p className="text-xs text-muted-foreground mt-1">משני: {secondaryVal}</p>
                          )}
                        </div>
                        <div className="rounded bg-muted/40 p-2">
                          <p className="text-xs text-muted-foreground">חדש מההרשמה</p>
                          <p className="font-medium break-words">{newV}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" size="sm" variant={decision === "keep" ? "default" : "outline"}
                          onClick={() => setMergeDecisions((p) => ({ ...p, [f.key]: "keep" }))}>
                          שמור קיים
                        </Button>
                        <Button type="button" size="sm" variant={decision === "replace" ? "default" : "outline"}
                          onClick={() => setMergeDecisions((p) => ({ ...p, [f.key]: "replace" }))}>
                          החלף בחדש
                        </Button>
                        {hasSecondary && (
                          <Button type="button" size="sm" variant={decision === "both" ? "default" : "outline"}
                            disabled={!!secondaryFilled}
                            onClick={() => setMergeDecisions((p) => ({ ...p, [f.key]: "both" }))}>
                            שמור את שניהם{secondaryFilled ? " (שדה משני תפוס)" : ""}
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })()}



        {/* Parent details - prefilled */}
        {useExisting !== true && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">פרטי הורה</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-sm">שם הורה</Label>
                  <Input {...register("parent_name")} className="h-12 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">ת.ז. הורה</Label>
                  <Input {...register("parent_national_id")} className="h-12 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">טלפון הורה</Label>
                  <Input {...register("parent_phone")} type="tel" className="h-12 rounded-xl" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm">אימייל הורה</Label>
                  <Input {...register("parent_email")} type="email" className="h-12 rounded-xl" />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Enrollment details - admin fills */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">פרטי שיוך</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-sm">מורה *</Label>
                <Controller
                  name="teacher_id"
                  control={control}
                  rules={{ required: "שדה חובה" }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="בחר מורה" /></SelectTrigger>
                      <SelectContent>
                        {filteredTeachers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.teacher_id && <p className="text-sm text-destructive">{errors.teacher_id.message}</p>}
                {canFilterTeachers && (
                  <div className="flex items-center gap-2 mt-1">
                    {!showAllTeachers ? (
                      <>
                        <p className="text-xs text-muted-foreground">מציג רק מורים המלמדים: {requestedInstrumentNames.join(", ")}</p>
                        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowAllTeachers(true)}>כל המורים</button>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">מציג את כל המורים</p>
                        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setShowAllTeachers(false)}>סנן לפי כלים מבוקשים</button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">כלי נגינה *</Label>
                <Controller
                  name="instrument_id"
                  control={control}
                  rules={{ required: "שדה חובה" }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="בחר כלי נגינה" /></SelectTrigger>
                      <SelectContent>
                        {filteredInstruments.map((i) => (
                          <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.instrument_id && <p className="text-sm text-destructive">{errors.instrument_id.message}</p>}
                {selectedTeacherId && !hasTeacherInstruments && (
                  <p className="text-sm text-amber-600">לא הוגדרו עדיין כלי נגינה למורה זה.</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">שלוחה / בית ספר *</Label>
                <Controller
                  name="school_id"
                  control={control}
                  rules={{ required: "שדה חובה" }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="בחר שלוחה" /></SelectTrigger>
                      <SelectContent>
                        {schools.map((s) => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.school_id && <p className="text-sm text-destructive">{errors.school_id.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">משך שיעור *</Label>
                <Controller
                  name="lesson_duration_minutes"
                  control={control}
                  rules={{ required: "שדה חובה" }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {DURATION_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">סוג שיעור *</Label>
                <Controller
                  name="lesson_type"
                  control={control}
                  rules={{ required: "שדה חובה" }}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="individual">פרטני</SelectItem>
                        <SelectItem value="group">קבוצתי</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">תאריך תחילת נגינה *</Label>
                <Controller
                  name="instrument_start_date"
                  control={control}
                  rules={{ required: "שדה חובה" }}
                  render={({ field }) => (
                    <DateInput value={field.value} onChange={field.onChange} placeholder="תאריך תחילת נגינה" />
                  )}
                />
                {errors.instrument_start_date && <p className="text-sm text-destructive">{errors.instrument_start_date.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Name match requires decision */}
        {isNameMatch && useExisting === null && (
          <div className="text-center text-sm text-amber-600 font-medium py-2">
            ⚠️ יש לבחור אם להשתמש בתלמיד הקיים או ליצור חדש לפני שמירה
          </div>
        )}

        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button
            type="submit"
            disabled={convertMutation.isPending || (isNameMatch && useExisting === null)}
            className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg"
          >
            {convertMutation.isPending ? (
              <><Loader2 className="h-5 w-5 ml-2 animate-spin" /> שומר...</>
            ) : useExisting ? (
              "צור שיוך לתלמיד קיים"
            ) : (
              "צור תלמיד ושיוך"
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(`/admin/registrations/${id}`)}
            className="h-14 rounded-2xl text-base px-6"
          >
            ביטול
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default AdminRegistrationConvert;
