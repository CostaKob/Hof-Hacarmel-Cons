import { useEffect } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface EnrollmentFormData {
  student_id: string;
  teacher_id: string;
  instrument_id: string;
  school_id: string;
  enrollment_role: string;
  lesson_type: string;
  lesson_duration_minutes: number;
  price_per_lesson: string;
  teacher_rate_per_lesson: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

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
      lesson_duration_minutes: 30,
      price_per_lesson: "",
      teacher_rate_per_lesson: "",
      end_date: "",
    },
  });

  const isActive = watch("is_active");

  // Load reference data
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

  const { data: schools = [] } = useQuery({
    queryKey: ["admin-schools-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Load existing enrollment for edit
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
        lesson_duration_minutes: enrollment.lesson_duration_minutes,
        price_per_lesson: enrollment.price_per_lesson?.toString() ?? "",
        teacher_rate_per_lesson: enrollment.teacher_rate_per_lesson?.toString() ?? "",
        start_date: enrollment.start_date,
        end_date: enrollment.end_date ?? "",
        is_active: enrollment.is_active,
      });
    }
  }, [enrollment, reset]);

  const mutation = useMutation({
    mutationFn: async (data: EnrollmentFormData) => {
      // Validate end_date > start_date
      if (data.end_date && data.end_date < data.start_date) {
        throw new Error("תאריך סיום לא יכול להיות לפני תאריך התחלה");
      }
      if (data.lesson_duration_minutes <= 0) {
        throw new Error("משך שיעור חייב להיות מספר חיובי");
      }

      const payload = {
        student_id: data.student_id,
        teacher_id: data.teacher_id,
        instrument_id: data.instrument_id,
        school_id: data.school_id,
        enrollment_role: data.enrollment_role as "primary" | "secondary",
        lesson_type: data.lesson_type as "individual" | "group",
        lesson_duration_minutes: Number(data.lesson_duration_minutes),
        price_per_lesson: data.price_per_lesson ? Number(data.price_per_lesson) : null,
        teacher_rate_per_lesson: data.teacher_rate_per_lesson ? Number(data.teacher_rate_per_lesson) : null,
        start_date: data.start_date,
        end_date: data.end_date || null,
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
      // Navigate back to student card if came from there
      if (presetStudentId && !isEdit) {
        navigate(`/admin/students/${presetStudentId}`);
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
      options: instruments.map((i) => ({ value: i.id, label: i.name })),
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
  ];

  return (
    <AdminLayout title={isEdit ? "עריכת שיוך" : "שיוך חדש"} backPath="/admin/enrollments">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-6 max-w-2xl pb-20 md:pb-0">
        <Card>
          <CardHeader><CardTitle>פרטי שיוך</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {SELECT_FIELDS.map((f) => (
              <div key={f.name} className="space-y-1">
                <Label>{f.label}{f.required && " *"}</Label>
                <Controller
                  name={f.name}
                  control={control}
                  rules={f.required ? { required: `${f.label} שדה חובה` } : undefined}
                  render={({ field }) => (
                    <Select value={field.value?.toString() ?? ""} onValueChange={field.onChange}>
                      <SelectTrigger>
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
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>פרטי שיעור</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>משך שיעור (דקות) *</Label>
              <Input
                type="number"
                min={1}
                {...register("lesson_duration_minutes", {
                  required: "משך שיעור שדה חובה",
                  valueAsNumber: true,
                  min: { value: 1, message: "משך שיעור חייב להיות חיובי" },
                })}
              />
              {errors.lesson_duration_minutes && (
                <p className="text-sm text-destructive">{errors.lesson_duration_minutes.message}</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>מחיר לשיעור</Label>
              <Input type="number" step="0.01" min={0} {...register("price_per_lesson")} />
            </div>
            <div className="space-y-1">
              <Label>תעריף מורה לשיעור</Label>
              <Input type="number" step="0.01" min={0} {...register("teacher_rate_per_lesson")} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>תאריכים וסטטוס</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>תאריך התחלה *</Label>
              <Input type="date" {...register("start_date", { required: "תאריך התחלה שדה חובה" })} />
              {errors.start_date && <p className="text-sm text-destructive">{errors.start_date.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>תאריך סיום</Label>
              <Input type="date" {...register("end_date")} />
            </div>
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch checked={isActive} onCheckedChange={(v) => setValue("is_active", v)} />
              <Label>פעיל</Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/enrollments")}>
            ביטול
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default AdminEnrollmentForm;
