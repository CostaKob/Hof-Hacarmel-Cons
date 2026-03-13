import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

interface StudentFormData {
  first_name: string;
  last_name: string;
  national_id: string;
  date_of_birth: string;
  address: string;
  city: string;
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

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<StudentFormData>({
    defaultValues: { is_active: true },
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
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-6 max-w-2xl pb-20 md:pb-0">
        <Card>
          <CardHeader><CardTitle>פרטי תלמיד</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.name} className="space-y-1">
                <Label>{f.label}{f.required && " *"}</Label>
                <Input
                  type={f.type ?? "text"}
                  {...register(f.name, f.required ? { required: `${f.label} שדה חובה` } : undefined)}
                />
                {errors[f.name] && <p className="text-sm text-destructive">{errors[f.name]?.message}</p>}
              </div>
            ))}
            <div className="flex items-center gap-2 sm:col-span-2">
              <Switch checked={isActive} onCheckedChange={(v) => setValue("is_active", v)} />
              <Label>פעיל</Label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>פרטי הורים</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {PARENT_FIELDS.map((f) => (
              <div key={f.name} className="space-y-1">
                <Label>{f.label}</Label>
                <Input type={f.type ?? "text"} {...register(f.name)} />
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/students")}>
            ביטול
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default AdminStudentForm;
