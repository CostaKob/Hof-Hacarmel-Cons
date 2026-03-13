import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="max-w-md space-y-6 pb-20 md:pb-0">
        <Card>
          <CardHeader><CardTitle>פרטים</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>שם *</Label>
              <Input {...register("name", { required: "שם שדה חובה" })} />
              {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
            </div>
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/instruments")}>
            ביטול
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default AdminInstrumentForm;
