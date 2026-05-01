import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import { CONDITION_OPTIONS, CONDITION_LABELS, CONDITION_COLORS, InstrumentCondition, INSTRUMENT_SIZES } from "@/lib/instrumentInventory";
import { User, ExternalLink } from "lucide-react";

interface FormData {
  instrument_id: string;
  serial_number: string;
  brand: string;
  model: string;
  size: string | null;
  condition: InstrumentCondition;
  storage_location_id: string | null;
  purchase_date: string;
  notes: string;
}

const AdminInventoryInstrumentForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      condition: "available",
      storage_location_id: null,
    },
  });

  const { data: item } = useQuery({
    queryKey: ["admin-inventory-instrument", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_instruments").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  const { data: instruments = [] } = useQuery({
    queryKey: ["admin-instruments-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["admin-storage-locations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instrument_storage_locations")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["instrument-loans", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instrument_loans")
        .select(`
          *,
          students(id, first_name, last_name),
          school_music_students(id, student_first_name, student_last_name)
        `)
        .eq("inventory_instrument_id", id!)
        .order("loan_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (item) {
      reset({
        instrument_id: item.instrument_id,
        serial_number: item.serial_number,
        brand: item.brand || "",
        model: item.model || "",
        size: item.size || null,
        condition: item.condition,
        storage_location_id: item.storage_location_id,
        purchase_date: item.purchase_date || "",
        notes: item.notes || "",
      });
    }
  }, [item, reset]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        instrument_id: data.instrument_id,
        serial_number: data.serial_number.trim(),
        brand: data.brand.trim() || null,
        model: data.model.trim() || null,
        size: data.size || null,
        condition: data.condition,
        storage_location_id: data.storage_location_id || null,
        purchase_date: data.purchase_date || null,
        notes: data.notes.trim() || null,
      };
      if (isEdit) {
        const { error } = await supabase.from("inventory_instruments").update(payload).eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("inventory_instruments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      toast.success(isEdit ? "הכלי עודכן" : "הכלי נוצר");
      navigate("/admin/inventory-instruments");
    },
    onError: (err: any) => {
      if (err.message?.includes("duplicate")) {
        toast.error("מספר סידורי כבר קיים עבור סוג כלי זה");
      } else {
        toast.error(err.message || "שגיאה");
      }
    },
  });

  return (
    <AdminLayout title={isEdit ? "עריכת כלי" : "כלי חדש"} backPath="/admin/inventory-instruments">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="max-w-2xl space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטי הכלי</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">סוג כלי *</Label>
              <Controller
                name="instrument_id"
                control={control}
                rules={{ required: "שדה חובה" }}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="בחר סוג" />
                    </SelectTrigger>
                    <SelectContent>
                      {instruments.map((i) => (
                        <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.instrument_id && <p className="text-sm text-destructive">{errors.instrument_id.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">מספר סידורי *</Label>
              <Input {...register("serial_number", { required: "שדה חובה" })} className="h-12 rounded-xl" />
              {errors.serial_number && <p className="text-sm text-destructive">{errors.serial_number.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">יצרן</Label>
              <Input {...register("brand")} className="h-12 rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">דגם</Label>
              <Input {...register("model")} className="h-12 rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">מצב *</Label>
              <Controller
                name="condition"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">מיקום אחסון</Label>
              <Controller
                name="storage_location_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="ללא מיקום" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">ללא מיקום</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">תאריך רכישה</Label>
              <Input type="date" {...register("purchase_date")} className="h-12 rounded-xl" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">הערות</Label>
              <Textarea {...register("notes")} className="rounded-xl min-h-20" />
            </div>
          </div>
        </div>

        {isEdit && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground text-base">היסטוריית השאלות ({loans.length})</h2>
            </div>
            {loans.length === 0 ? (
              <p className="text-sm text-muted-foreground">לא הושאל לאף תלמיד</p>
            ) : (
              <div className="space-y-2">
                {loans.map((loan: any) => {
                  const isPrivate = !!loan.student_id;
                  const student = isPrivate ? loan.students : loan.school_music_students;
                  const name = isPrivate
                    ? `${student?.first_name || ""} ${student?.last_name || ""}`.trim()
                    : `${student?.student_first_name || ""} ${student?.student_last_name || ""}`.trim();
                  const studentLink = isPrivate
                    ? `/admin/students/${loan.student_id}`
                    : null;
                  const isActive = !loan.return_date;
                  return (
                    <div
                      key={loan.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 bg-background"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        {studentLink ? (
                          <button
                            type="button"
                            onClick={() => navigate(studentLink)}
                            className="text-sm font-medium text-primary hover:underline truncate flex items-center gap-1"
                          >
                            {name || "ללא שם"}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-sm font-medium truncate">{name || "ללא שם"}</span>
                        )}
                        <Badge variant="outline" className="text-[10px]">
                          {isPrivate ? "פרטני" : "ביס מנגן"}
                        </Badge>
                        {isActive && (
                          <Badge variant="outline" className={CONDITION_COLORS.loaned}>פעיל</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(loan.loan_date), "dd/MM/yyyy")}
                        {loan.return_date && ` — ${format(new Date(loan.return_date), "dd/MM/yyyy")}`}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">להשאלת כלי לתלמיד — בכרטיס התלמיד.</p>
          </div>
        )}

        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button type="submit" disabled={mutation.isPending} className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg">
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/inventory-instruments")} className="h-14 rounded-2xl text-base px-6">
            ביטול
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default AdminInventoryInstrumentForm;
