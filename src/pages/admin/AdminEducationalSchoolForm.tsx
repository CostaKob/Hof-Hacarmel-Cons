import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

interface FormData {
  name: string;
  city: string;
  is_active: boolean;
}

const AdminEducationalSchoolForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: { is_active: true },
  });

  const isActive = watch("is_active");

  const { data: school } = useQuery({
    queryKey: ["admin-educational-school", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("educational_schools").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (school) {
      reset({
        name: school.name,
        city: school.city ?? "",
        is_active: school.is_active,
      });
    }
  }, [school, reset]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        name: data.name,
        city: data.city || null,
        is_active: data.is_active,
      };
      if (isEdit) {
        const { error } = await supabase.from("educational_schools").update(payload).eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("educational_schools").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-educational-schools"] });
      toast.success(isEdit ? "בית הספר עודכן בהצלחה" : "בית הספר נוצר בהצלחה");
      navigate("/admin/educational-schools");
    },
    onError: () => toast.error("שגיאה בשמירת הנתונים"),
  });

  const [showDelete, setShowDelete] = useState(false);

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("educational_schools").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-educational-schools"] });
      toast.success("בית הספר נמחק בהצלחה");
      navigate("/admin/educational-schools");
    },
    onError: () => toast.error("שגיאה במחיקת בית הספר"),
  });

  const FIELDS: { name: keyof FormData; label: string; required?: boolean }[] = [
    { name: "name", label: "שם בית ספר", required: true },
    { name: "city", label: "עיר" },
  ];

  return (
    <AdminLayout title={isEdit ? "עריכת בית ספר" : "בית ספר חדש"} backPath="/admin/educational-schools">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5 max-w-2xl">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-base">פרטי בית ספר</h2>
            {isEdit && (
              <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setShowDelete(true)}>
                <Trash2 className="h-4 w-4 ml-1" />
                מחיקה
              </Button>
            )}
          </div>
          <div className="grid gap-4">
            {FIELDS.map((f) => (
              <div key={f.name} className="space-y-1.5">
                <Label className="text-sm">{f.label}{f.required && " *"}</Label>
                <Input {...register(f.name, f.required ? { required: `${f.label} שדה חובה` } : undefined)} className="h-12 rounded-xl" />
                {errors[f.name] && <p className="text-sm text-destructive">{errors[f.name]?.message}</p>}
              </div>
            ))}
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={(v) => setValue("is_active", v)} />
              <Label>פעיל</Label>
            </div>
          </div>
        </div>
        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button type="submit" disabled={mutation.isPending} className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg">
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/educational-schools")} className="h-14 rounded-2xl text-base px-6">ביטול</Button>
        </div>
      </form>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת בית ספר</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את בית הספר? פעולה זו אינה ניתנת לביטול.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={() => deleteMutation.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteMutation.isPending ? "מוחק..." : "מחק"}
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminEducationalSchoolForm;
