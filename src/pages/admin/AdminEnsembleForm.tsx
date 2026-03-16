import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { ENSEMBLE_TYPE_LABELS, DAYS_OF_WEEK_LABELS } from "@/lib/ensembleConstants";
import { toast } from "sonner";

interface FormValues {
  name: string;
  ensemble_type: string;
  school_id: string;
  day_of_week: string;
  start_time: string;
  room: string;
  notes: string;
  is_active: boolean;
}

const AdminEnsembleForm = () => {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedYearId } = useAcademicYear();

  const { data: schools = [] } = useQuery({
    queryKey: ["schools-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: existing, isLoading } = useQuery({
    queryKey: ["ensemble", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await supabase.from("ensembles").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  const form = useForm<FormValues>({
    values: isEdit && existing
      ? {
          name: existing.name,
          ensemble_type: existing.ensemble_type,
          school_id: existing.school_id || "",
          day_of_week: (existing as any).day_of_week != null ? String((existing as any).day_of_week) : "",
          start_time: (existing as any).start_time ? String((existing as any).start_time).slice(0, 5) : "",
          room: (existing as any).room || "",
          notes: existing.notes || "",
          is_active: existing.is_active,
        }
      : {
          name: "",
          ensemble_type: "",
          school_id: "",
          day_of_week: "",
          start_time: "",
          room: "",
          notes: "",
          is_active: true,
        },
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload: any = {
        name: values.name,
        ensemble_type: values.ensemble_type,
        school_id: values.school_id && values.school_id !== "none" ? values.school_id : null,
        day_of_week: values.day_of_week !== "" ? Number(values.day_of_week) : null,
        start_time: values.start_time || null,
        room: values.room || null,
        notes: values.notes || null,
        is_active: values.is_active,
        academic_year_id: selectedYearId,
      };
      if (isEdit) {
        const { error } = await supabase.from("ensembles").update(payload).eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ensembles").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ensembles"] });
      queryClient.invalidateQueries({ queryKey: ["ensemble", id] });
      toast.success(isEdit ? "ההרכב עודכן" : "ההרכב נוצר בהצלחה");
      navigate("/admin/ensembles");
    },
    onError: () => toast.error("שגיאה בשמירה"),
  });

  if (isEdit && isLoading) {
    return <AdminLayout title="טוען..." backPath="/admin/ensembles"><p className="text-center text-muted-foreground py-8">טוען...</p></AdminLayout>;
  }

  return (
    <AdminLayout title={isEdit ? "עריכת הרכב" : "הרכב חדש"} backPath="/admin/ensembles">
      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4 max-w-lg">
          <FormField control={form.control} name="name" rules={{ required: "שדה חובה" }} render={({ field }) => (
            <FormItem>
              <FormLabel>שם ההרכב</FormLabel>
              <FormControl><Input {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="ensemble_type" rules={{ required: "שדה חובה" }} render={({ field }) => (
            <FormItem>
              <FormLabel>סוג הרכב</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="בחר סוג" /></SelectTrigger></FormControl>
                <SelectContent>
                  {Object.entries(ENSEMBLE_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="school_id" render={({ field }) => (
            <FormItem>
              <FormLabel>בית ספר / סניף</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl><SelectTrigger><SelectValue placeholder="ללא" /></SelectTrigger></FormControl>
                <SelectContent>
                  <SelectItem value="none">ללא</SelectItem>
                  {schools.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )} />

          <FormField control={form.control} name="weekly_hours" render={({ field }) => (
            <FormItem>
              <FormLabel>שעות שבועיות</FormLabel>
              <FormControl>
                <Input type="number" step="0.5" min="0" {...field} onChange={(e) => field.onChange(Number(e.target.value))} />
              </FormControl>
            </FormItem>
          )} />


          <div className="grid grid-cols-3 gap-3">
            <FormField control={form.control} name="day_of_week" render={({ field }) => (
              <FormItem>
                <FormLabel>יום</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl><SelectTrigger><SelectValue placeholder="בחר יום" /></SelectTrigger></FormControl>
                  <SelectContent>
                    {Object.entries(DAYS_OF_WEEK_LABELS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            )} />

            <FormField control={form.control} name="start_time" render={({ field }) => (
              <FormItem>
                <FormLabel>שעה</FormLabel>
                <FormControl><Input type="time" {...field} /></FormControl>
              </FormItem>
            )} />

            <FormField control={form.control} name="room" render={({ field }) => (
              <FormItem>
                <FormLabel>חדר</FormLabel>
                <FormControl><Input {...field} placeholder="מס׳ חדר" /></FormControl>
              </FormItem>
            )} />
          </div>

          <FormField control={form.control} name="notes" render={({ field }) => (
            <FormItem>
              <FormLabel>הערות</FormLabel>
              <FormControl><Textarea {...field} /></FormControl>
            </FormItem>
          )} />

          <FormField control={form.control} name="is_active" render={({ field }) => (
            <FormItem className="flex items-center gap-3">
              <FormLabel className="mt-0">פעיל</FormLabel>
              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
            </FormItem>
          )} />

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "שומר..." : isEdit ? "עדכן" : "צור הרכב"}
            </Button>
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>ביטול</Button>
          </div>
        </form>
      </Form>
    </AdminLayout>
  );
};

export default AdminEnsembleForm;
