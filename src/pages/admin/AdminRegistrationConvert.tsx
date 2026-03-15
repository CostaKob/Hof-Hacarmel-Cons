import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
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

interface ConvertFormData {
  // Student fields
  first_name: string;
  last_name: string;
  national_id: string;
  gender: string;
  grade: string;
  city: string;
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

const AdminRegistrationConvert = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [useExisting, setUseExisting] = useState<boolean | null>(null);

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
    queryKey: ["existing-student-detail", registration?.existing_student_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .eq("id", registration.existing_student_id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!registration?.existing_student_id,
  });

  const { data: activeYear } = useQuery({
    queryKey: ["active-year"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, name")
        .eq("is_active", true)
        .single();
      if (error) return null;
      return data;
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["admin-teachers-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, first_name, last_name")
        .eq("is_active", true)
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: instruments = [] } = useQuery({
    queryKey: ["admin-instruments-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["admin-schools-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").eq("is_active", true).order("name");
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

  const { data: teacherInstruments = [] } = useQuery({
    queryKey: ["admin-teacher-instruments", selectedTeacherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_instruments")
        .select("instrument_id")
        .eq("teacher_id", selectedTeacherId!);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedTeacherId,
  });

  const teacherInstrumentIds = new Set(teacherInstruments.map((ti) => ti.instrument_id));
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
      const d = r.requested_lesson_duration.replace(/[^\\d]/g, "");
      if (["30", "45", "60"].includes(d)) duration = d;
    }

    // Try to match school by name
    const matchedSchool = schools.find(
      (s) => s.name === r.branch_school_name
    );

    reset({
      first_name: r.student_first_name || "",
      last_name: r.student_last_name || "",
      national_id: r.student_national_id || "",
      gender: r.gender || "__none__",
      grade: r.grade || "__none__",
      city: r.city || "",
      phone: r.student_phone || "",
      parent_name: r.parent_name || "",
      parent_national_id: r.parent_national_id || "",
      parent_phone: r.parent_phone || "",
      parent_email: r.parent_email || "",
      teacher_id: "",
      instrument_id: "",
      school_id: matchedSchool?.id || "",
      lesson_duration_minutes: duration,
      lesson_type: "individual",
      instrument_start_date: "",
    });

    // Auto-decide existing student usage
    if (r.existing_student_id && r.match_type === "id_match") {
      setUseExisting(true);
    } else if (!r.existing_student_id) {
      setUseExisting(false);
    }
    // name_match: leave null for admin to decide
  }, [registration, schools, reset]);

  const convertMutation = useMutation({
    mutationFn: async (data: ConvertFormData) => {
      const r = registration;
      let studentId: string;

      if (useExisting && r.existing_student_id) {
        // Use existing student — optionally update missing fields
        studentId = r.existing_student_id;
        const updates: Record<string, any> = {};
        if (data.national_id && !existingStudent?.national_id) updates.national_id = data.national_id;
        if (data.phone && !existingStudent?.phone) updates.phone = data.phone;
        if (data.parent_phone && !existingStudent?.parent_phone) updates.parent_phone = data.parent_phone;
        if (data.parent_email && !existingStudent?.parent_email) updates.parent_email = data.parent_email;
        if (data.grade && data.grade !== "__none__") updates.grade = data.grade;

        if (Object.keys(updates).length > 0) {
          await supabase.from("students").update(updates).eq("id", studentId);
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
            phone: data.phone || null,
            parent_name: data.parent_name || null,
            parent_phone: data.parent_phone || null,
            parent_email: data.parent_email || null,
            is_active: true,
          })
          .select("id")
          .single();
        if (studentErr) throw studentErr;
        studentId = newStudent.id;
      }

      // Create enrollment
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
      });
      if (enrollErr) throw enrollErr;

      // Update registration status to converted
      const { error: regErr } = await supabase
        .from("registrations" as any)
        .update({
          status: "converted",
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
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      toast.success("ההרשמה הומרה בהצלחה — תלמיד ושיוך נוצרו");
      navigate(`/admin/students/${studentId}`);
    },
    onError: (err: any) => toast.error(err.message || "שגיאה בהמרת ההרשמה"),
  });

  if (regLoading) {
    return (
      <AdminLayout title="טוען..." backPath={`/admin/registrations/${id}`}>
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      </AdminLayout>
    );
  }

  if (!registration) {
    return (
      <AdminLayout title="הרשמה" backPath="/admin/registrations">
        <p className="text-center text-muted-foreground py-8">ההרשמה לא נמצאה</p>
      </AdminLayout>
    );
  }

  const r = registration;
  const isIdMatch = r.match_type === "id_match";
  const isNameMatch = r.match_type === "name_match";
  const requestedInstruments = (r.requested_instruments as string[]) || [];

  return (
    <AdminLayout
      title={`טיפול בהרשמה — ${r.student_first_name} ${r.student_last_name}`}
      backPath={`/admin/registrations/${id}`}
    >
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
            <CardContent>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">ת.ז.: </span>{existingStudent.national_id || "—"}</div>
                <div><span className="text-muted-foreground">כיתה: </span>{existingStudent.grade || "—"}</div>
                <div><span className="text-muted-foreground">ישוב: </span>{existingStudent.city || "—"}</div>
                <div><span className="text-muted-foreground">טלפון: </span>{existingStudent.phone || "—"}</div>
              </div>
            </CardContent>
          </Card>
        )}

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
            <CardTitle className="text-base">פרטי שיוך (למילוי ע״י המזכירה)</CardTitle>
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
                        {teachers.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.teacher_id && <p className="text-sm text-destructive">{errors.teacher_id.message}</p>}
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
