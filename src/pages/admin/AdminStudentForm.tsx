import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { DateInput } from "@/components/ui/date-input";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { GRADES, PLAYING_LEVELS } from "@/lib/constants";

interface StudentFormData {
  first_name: string;
  last_name: string;
  national_id: string;
  date_of_birth: string;
  address: string;
  city: string;
  grade: string;
  playing_level: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  parent_name_2: string;
  parent_phone_2: string;
  parent_email_2: string;
  is_active: boolean;
}

const AdminStudentForm = () => {
  const { studentId } = useParams();
  const isEdit = !!studentId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, watch, reset, control, formState: { errors } } = useForm<StudentFormData>({
    defaultValues: { is_active: true, grade: "__none__", playing_level: "__none__" },
  });

  const isActive = watch("is_active");

  const { data: student } = useQuery({
    queryKey: ["admin-student", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", studentId!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (student) {
      reset({
        first_name: student.first_name,
        last_name: student.last_name,
        national_id: student.national_id ?? "",
        date_of_birth: student.date_of_birth ?? "",
        address: student.address ?? "",
        city: student.city ?? "",
        grade: student.grade ?? "__none__",
        playing_level: student.playing_level ?? "__none__",
        parent_name: student.parent_name ?? "",
        parent_phone: student.parent_phone ?? "",
        parent_email: student.parent_email ?? "",
        parent_name_2: student.parent_name_2 ?? "",
        parent_phone_2: student.parent_phone_2 ?? "",
        parent_email_2: student.parent_email_2 ?? "",
        is_active: student.is_active,
      });
    }
  }, [student, reset]);

  const mutation = useMutation({
    mutationFn: async (data: StudentFormData) => {
      const payload = {
        first_name: data.first_name,
        last_name: data.last_name,
        national_id: data.national_id || null,
        date_of_birth: data.date_of_birth || null,
        address: data.address || null,
        city: data.city || null,
        grade: data.grade === "__none__" ? null : data.grade || null,
        playing_level: data.playing_level === "__none__" ? null : data.playing_level || null,
        parent_name: data.parent_name || null,
        parent_phone: data.parent_phone || null,
        parent_email: data.parent_email || null,
        parent_name_2: data.parent_name_2 || null,
        parent_phone_2: data.parent_phone_2 || null,
        parent_email_2: data.parent_email_2 || null,
        is_active: data.is_active,
      };

      if (isEdit) {
        const { error } = await supabase.from("students").update(payload).eq("id", studentId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("students").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      toast.success(isEdit ? "התלמיד עודכן בהצלחה" : "התלמיד נוצר בהצלחה");
      navigate("/admin/students");
    },
    onError: () => toast.error("שגיאה בשמירת הנתונים"),
  });

  const FIELDS: { name: keyof StudentFormData; label: string; type?: string; required?: boolean }[] = [
    { name: "first_name", label: "שם פרטי", required: true },
    { name: "last_name", label: "שם משפחה", required: true },
    { name: "national_id", label: "תעודת זהות" },
    { name: "date_of_birth", label: "תאריך לידה", type: "date" },
    { name: "address", label: "כתובת" },
    { name: "city", label: "עיר" },
  ];

  const PARENT_FIELDS: { name: keyof StudentFormData; label: string; type?: string }[] = [
    { name: "parent_name", label: "שם הורה 1" },
    { name: "parent_phone", label: "טלפון הורה 1", type: "tel" },
    { name: "parent_email", label: "אימייל הורה 1", type: "email" },
    { name: "parent_name_2", label: "שם הורה 2" },
    { name: "parent_phone_2", label: "טלפון הורה 2", type: "tel" },
    { name: "parent_email_2", label: "אימייל הורה 2", type: "email" },
  ];

  return (
    <AdminLayout title={isEdit ? "עריכת תלמיד" : "תלמיד חדש"} backPath="/admin/students">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5 max-w-2xl">
        {/* Student details */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטי תלמיד</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label className="text-sm">{f.label}{f.required && " *"}</Label>
                {f.type === "date" ? (
                  <Controller
                    name={f.name}
                    control={control}
                    render={({ field }) => (
                      <DateInput value={field.value as string} onChange={field.onChange} placeholder={f.label} />
                    )}
                  />
                ) : (
                  <Input
                    type={f.type ?? "text"}
                    {...register(f.name, f.required ? { required: `${f.label} שדה חובה` } : undefined)}
                    className="h-12 rounded-xl"
                  />
                )}
                {errors[f.name] && <p className="text-sm text-destructive">{errors[f.name]?.message}</p>}
              </div>
            ))}

            {/* Grade dropdown */}
            <div className="space-y-1.5">
              <Label className="text-sm">כיתה</Label>
              <Controller
                name="grade"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="בחר כיתה" /></SelectTrigger>
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

            {/* Playing level dropdown */}
            <div className="space-y-1.5">
              <Label className="text-sm">רמת נגינה</Label>
              <Controller
                name="playing_level"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="בחר רמה" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">ללא</SelectItem>
                      {PLAYING_LEVELS.map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

          </div>
          <div className="flex items-center gap-3 pt-2">
            <Switch checked={isActive} onCheckedChange={(v) => setValue("is_active", v)} />
            <Label>פעיל</Label>
          </div>
        </div>

        {/* Parent details */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטי הורים</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {PARENT_FIELDS.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label className="text-sm">{f.label}</Label>
                <Input type={f.type ?? "text"} {...register(f.name)} className="h-12 rounded-xl" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button type="submit" disabled={mutation.isPending} className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg">
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/students")} className="h-14 rounded-2xl text-base px-6">
            ביטול
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default AdminStudentForm;
