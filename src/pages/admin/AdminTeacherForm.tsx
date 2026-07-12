import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { DateInput } from "@/components/ui/date-input";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Upload, X, User as UserIcon } from "lucide-react";
import PageTitle from "@/components/PageTitle";


interface TeacherFormData {
  first_name: string;
  last_name: string;
  national_id: string;
  birth_date: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  bio: string;
  photo_url: string;
  is_active: boolean;
  is_freelance: boolean;
  is_office: boolean;
}

const AdminTeacherForm = () => {
  const { teacherId } = useParams();
  const isEdit = !!teacherId;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, setValue, watch, reset, control, formState: { errors } } = useForm<TeacherFormData>({
    defaultValues: { is_active: true, is_freelance: false, is_office: false, bio: "", photo_url: "" },
  });

  const isActive = watch("is_active");
  const isFreelance = watch("is_freelance");
  const isOffice = watch("is_office");
  const photoUrl = watch("photo_url");


  const { data: teacher } = useQuery({
    queryKey: ["admin-teacher", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("*").eq("id", teacherId!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (teacher) {
      reset({
        first_name: teacher.first_name,
        last_name: teacher.last_name,
        national_id: teacher.national_id ?? "",
        birth_date: teacher.birth_date ?? "",
        phone: teacher.phone ?? "",
        email: teacher.email ?? "",
        address: teacher.address ?? "",
        city: teacher.city ?? "",
        bio: (teacher as any).bio ?? "",
        photo_url: (teacher as any).photo_url ?? "",
        is_active: teacher.is_active,
        is_freelance: (teacher as any).is_freelance ?? false,
        is_office: (teacher as any).is_office ?? false,

      });
    }
  }, [teacher, reset]);

  const mutation = useMutation({
    mutationFn: async (data: TeacherFormData) => {
      const payload = {
        first_name: data.first_name,
        last_name: data.last_name,
        national_id: data.national_id || null,
        birth_date: data.birth_date || null,
        phone: data.phone || null,
        email: data.email || null,
        address: data.address || null,
        city: data.city || null,
        bio: data.bio || null,
        photo_url: data.photo_url || null,
        is_active: data.is_active,
        is_freelance: data.is_freelance,
        is_office: data.is_office,

      };
      if (isEdit) {
        const { error } = await supabase.from("teachers").update(payload).eq("id", teacherId!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("teachers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: async (_result, data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-teachers"] });

      if (!isEdit && data.email) {
        try {
          const { data: newTeacher } = await supabase
            .from("teachers")
            .select("id")
            .eq("email", data.email)
            .order("created_at", { ascending: false })
            .limit(1)
            .single();

          if (newTeacher) {
            const { data: result, error } = await supabase.functions.invoke(
              "create-teacher-user",
              { body: { email: data.email, teacher_id: newTeacher.id } }
            );

            if (error) {
              toast.error("המורה נוצר אך יצירת חשבון הכניסה נכשלה");
            } else if (result?.warning) {
              toast.warning(result.warning);
            } else {
              toast.success(`המורה נוצר וחשבון כניסה הוגדר. סיסמה: ${result?.password ?? ""}`, { duration: 30000 });
            }
          } else {
            toast.success("המורה נוצר בהצלחה");
          }
        } catch {
          toast.success("המורה נוצר אך יצירת חשבון הכניסה נכשלה");
        }
      } else {
        toast.success(isEdit ? "המורה עודכן בהצלחה" : "המורה נוצר בהצלחה");
      }

      navigate("/admin/teachers");
    },
    onError: () => toast.error("שגיאה בשמירת הנתונים"),
  });

  const FIELDS: { name: keyof TeacherFormData; label: string; type?: string; required?: boolean }[] = [
    { name: "first_name", label: "שם פרטי", required: true },
    { name: "last_name", label: "שם משפחה", required: true },
    { name: "national_id", label: "תעודת זהות" },
    { name: "birth_date", label: "תאריך לידה", type: "date" },
    { name: "phone", label: "טלפון", type: "tel" },
    { name: "email", label: "אימייל", type: "email" },
    { name: "address", label: "כתובת" },
    { name: "city", label: "ישוב מגורים" },
  ];

  return (
    <AdminLayout title={isEdit ? "עריכת מורה" : "מורה חדש"} backPath="/admin/teachers">
      <PageTitle title="טופס מורה" />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5 max-w-2xl">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטי מורה</h2>
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
                  <Input type={f.type ?? "text"} {...register(f.name, f.required ? { required: `${f.label} שדה חובה` } : undefined)} className="h-12 rounded-xl" />
                )}
                {errors[f.name] && <p className="text-sm text-destructive">{errors[f.name]?.message}</p>}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 pt-2">
            <Switch checked={isActive} onCheckedChange={(v) => setValue("is_active", v)} />
            <Label>פעיל</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isFreelance} onCheckedChange={(v) => setValue("is_freelance", v)} />
            <Label>עצמאי</Label>
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isOffice} onCheckedChange={(v) => setValue("is_office", v)} />
            <Label>משרד (לא מופיע בדוח שכר)</Label>
          </div>



          {/* Public profile (photo + bio) */}
          <div className="pt-2 border-t border-border space-y-4">
            <h3 className="font-semibold text-foreground text-sm">פרופיל פומבי (מופיע באתר)</h3>
            <div className="space-y-2">
              <Label className="text-sm">תמונה</Label>
              <div className="flex items-center gap-4">
                <div className="relative h-20 w-20 shrink-0 rounded-full overflow-hidden bg-muted flex items-center justify-center border border-border">
                  {photoUrl ? (
                    <img src={photoUrl} alt="תמונת מורה" className="h-full w-full object-cover" />
                  ) : (
                    <UserIcon className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true);
                      try {
                        const ext = file.name.split(".").pop() ?? "jpg";
                        const path = `teacher-photos/${teacherId ?? crypto.randomUUID()}-${Date.now()}.${ext}`;
                        const { error: upErr } = await supabase.storage
                          .from("app-settings")
                          .upload(path, file, { upsert: true, contentType: file.type });
                        if (upErr) throw upErr;
                        const { data } = supabase.storage.from("app-settings").getPublicUrl(path);
                        setValue("photo_url", data.publicUrl, { shouldDirty: true });
                        toast.success("התמונה הועלתה");
                      } catch (err: any) {
                        toast.error(err.message ?? "שגיאה בהעלאת התמונה");
                      } finally {
                        setUploading(false);
                        if (fileRef.current) fileRef.current.value = "";
                      }
                    }}
                  />
                  <Button type="button" variant="outline" className="h-10 rounded-xl gap-2" disabled={uploading} onClick={() => fileRef.current?.click()}>
                    <Upload className="h-4 w-4" />
                    {uploading ? "מעלה..." : "העלאת תמונה"}
                  </Button>
                  {photoUrl && (
                    <Button type="button" variant="ghost" className="h-10 rounded-xl gap-2 text-destructive" onClick={() => setValue("photo_url", "", { shouldDirty: true })}>
                      <X className="h-4 w-4" />
                      הסרה
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">קצת על המורה</Label>
              <Textarea
                {...register("bio")}
                rows={5}
                placeholder="רקע מקצועי, ניסיון, גישה להוראה..."
                className="rounded-xl resize-none"
              />
              <p className="text-xs text-muted-foreground">הטקסט הזה יוצג בדף המורים באתר הציבורי.</p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button type="submit" disabled={mutation.isPending} className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg">
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/teachers")} className="h-14 rounded-2xl text-base px-6">ביטול</Button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default AdminTeacherForm;
