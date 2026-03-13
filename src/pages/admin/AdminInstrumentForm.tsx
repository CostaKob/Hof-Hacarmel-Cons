import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface FormData {
  name: string;
}

const AdminInstrumentForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<FormData>();

  const { data: instrument } = useQuery({
    queryKey: ["admin-instrument", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (instrument) reset({ name: instrument.name });
  }, [instrument, reset]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (isEdit) {
        const { error } = await supabase.from("instruments").update(data).eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("instruments").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-instruments"] });
      toast.success(isEdit ? "כלי הנגינה עודכן" : "כלי הנגינה נוצר");
      navigate("/admin/instruments");
    },
    onError: (err: any) => toast.error(err.message || "שגיאה"),
  });

  return (
    <AdminLayout title={isEdit ? "עריכת כלי נגינה" : "כלי נגינה חדש"} backPath="/admin/instruments">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="max-w-md space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטים</h2>
          <div className="space-y-1.5">
            <Label className="text-sm">שם *</Label>
            <Input {...register("name", { required: "שם שדה חובה" })} className="h-12 rounded-xl" />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
        </div>
        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button type="submit" disabled={mutation.isPending} className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg">
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/instruments")} className="h-14 rounded-2xl text-base px-6">
            ביטול
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default AdminInstrumentForm;
