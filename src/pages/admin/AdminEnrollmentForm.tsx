import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface EnrollmentFormData {
  student_id: string;
  teacher_id: string;
  instrument_id: string;
  school_id: string;
  enrollment_role: string;
  lesson_type: string;
  lesson_duration_minutes: string;
  instrument_start_date: string;
  is_active: boolean;
}

const DURATION_OPTIONS = [
  { value: "30", label: "30 דקות" },
  { value: "45", label: "45 דקות" },
  { value: "60", label: "60 דקות" },
];

const AdminEnrollmentForm = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const presetStudentId = searchParams.get("student_id");
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, watch, reset, control, formState: { errors } } = useForm<EnrollmentFormData>({
    defaultValues: {
      student_id: presetStudentId ?? "",
      is_active: true,
      enrollment_role: "primary",
      lesson_type: "individual",
      lesson_duration_minutes: "45",
      instrument_start_date: "",
    },
  });

  const isActive = watch("is_active");
  const selectedTeacherId = watch("teacher_id");

  const { data: students = [] } = useQuery({
    queryKey: ["admin-students-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id, first_name, last_name").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["admin-teachers-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("id, first_name, last_name").order("last_name");
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

  const { data: schools = [] } = useQuery({
    queryKey: ["admin-schools-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollment } = useQuery({
    queryKey: ["admin-enrollment", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("enrollments").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (enrollment) {
      reset({
        student_id: enrollment.student_id,
        teacher_id: enrollment.teacher_id,
        instrument_id: enrollment.instrument_id,
        school_id: enrollment.school_id,
        enrollment_role: enrollment.enrollment_role,
        lesson_type: enrollment.lesson_type,
        lesson_duration_minutes: enrollment.lesson_duration_minutes.toString(),
        instrument_start_date: enrollment.instrument_start_date ?? enrollment.start_date ?? "",
        is_active: enrollment.is_active,
      });
    }
  }, [enrollment, reset]);

  const mutation = useMutation({
    mutationFn: async (data: EnrollmentFormData) => {
      const payload = {
        student_id: data.student_id,
        teacher_id: data.teacher_id,
        instrument_id: data.instrument_id,
        school_id: data.school_id,
        enrollment_role: data.enrollment_role as "primary" | "secondary",
        lesson_type: data.lesson_type as "individual" | "group",
        lesson_duration_minutes: Number(data.lesson_duration_minutes),
        start_date: data.instrument_start_date,
        instrument_start_date: data.instrument_start_date || null,
        is_active: data.is_active,
      };

      if (isEdit) {
        const { error } = await supabase.from("enrollments").update(payload).eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("enrollments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-enrollments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-student-enrollments"] });
      toast.success(isEdit ? "השיוך עודכן בהצלחה" : "השיוך נוצר בהצלחה");
      if (presetStudentId && !isEdit) {
        navigate(`/admin/students/${presetStudentId}`);
      } else if (isEdit && enrollment?.student_id) {
        navigate(`/admin/students/${enrollment.student_id}`);
      } else {
        navigate(-1 as any);
      }
    },
    onError: (err: any) => toast.error(err.message || "שגיאה בשמירת הנתונים"),
  });

  const SELECT_FIELDS: {
    name: keyof EnrollmentFormData;
    label: string;
    required: boolean;
    options: { value: string; label: string }[];
    warning?: string;
  }[] = [
    {
      name: "student_id",
      label: "תלמיד",
      required: true,
      options: students.map((s) => ({ value: s.id, label: `${s.first_name} ${s.last_name}` })),
    },
    {
      name: "teacher_id",
      label: "מורה",
      required: true,
      options: teachers.map((t) => ({ value: t.id, label: `${t.first_name} ${t.last_name}` })),
    },
    {
      name: "instrument_id",
      label: "כלי נגינה",
      required: true,
      options: filteredInstruments.map((i) => ({ value: i.id, label: i.name })),
      warning: selectedTeacherId && !hasTeacherInstruments ? "לא הוגדרו עדיין כלי נגינה למורה זה." : undefined,
    },
    {
      name: "school_id",
      label: "בית ספר",
      required: true,
      options: schools.map((s) => ({ value: s.id, label: s.name })),
    },
    {
      name: "enrollment_role",
      label: "תפקיד שיוך",
      required: true,
      options: [
        { value: "primary", label: "ראשי" },
        { value: "secondary", label: "משני" },
      ],
    },
    {
      name: "lesson_type",
      label: "סוג שיעור",
      required: true,
      options: [
        { value: "individual", label: "פרטני" },
        { value: "group", label: "קבוצתי" },
      ],
    },
    {
      name: "lesson_duration_minutes",
      label: "משך שיעור",
      required: true,
      options: DURATION_OPTIONS,
    },
  ];

  return (
    <AdminLayout title={isEdit ? "עריכת שיוך" : "שיוך חדש"} backPath={presetStudentId ? `/admin/students/${presetStudentId}` : "/admin/enrollments"}>
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5 max-w-2xl">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטי שיוך</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {SELECT_FIELDS.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label className="text-sm">{f.label}{f.required && " *"}</Label>
                <Controller
                  name={f.name}
                  control={control}
                  rules={f.required ? { required: `${f.label} שדה חובה` } : undefined}
                  render={({ field }) => (
                    <Select value={field.value?.toString() ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger className="h-12 rounded-xl">
                        <SelectValue placeholder={`בחר ${f.label}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors[f.name] && <p className="text-sm text-destructive">{errors[f.name]?.message}</p>}
                {f.warning && <p className="text-sm text-amber-600">{f.warning}</p>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">תאריך וסטטוס</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">תאריך תחילת נגינה *</Label>
              <Input type="date" {...register("instrument_start_date", { required: "תאריך תחילת נגינה שדה חובה" })} className="h-12 rounded-xl" />
              {errors.instrument_start_date && <p className="text-sm text-destructive">{errors.instrument_start_date.message}</p>}
            </div>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Switch checked={isActive} onCheckedChange={(v) => setValue("is_active", v)} />
              <Label>פעיל</Label>
            </div>
          </div>
        </div>

        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button type="submit" disabled={mutation.isPending} className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg">
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(-1 as any)} className="h-14 rounded-2xl text-base px-6">
            ביטול
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default AdminEnrollmentForm;
