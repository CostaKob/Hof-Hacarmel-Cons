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
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const OPERATING_DAYS = [0, 1, 2, 3, 4, 5]; // Sun-Fri

interface FormData {
  school_name: string;
  slug: string;
  academic_year_id: string;
  notes: string;
  is_active: boolean;
  operating_days: number[];
  principal_name: string;
  principal_phone: string;
  vice_principal_name: string;
  vice_principal_phone: string;
  annual_tuition_fee: number;
  icount_payment_page_url: string;
}

const AdminSchoolMusicSchoolForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, watch, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      is_active: true, notes: "", school_name: "", slug: "", academic_year_id: "", operating_days: [],
      principal_name: "", principal_phone: "", vice_principal_name: "", vice_principal_phone: "",
      annual_tuition_fee: 650,
      icount_payment_page_url: "",
    },
  });

  const isActive = watch("is_active");
  const selectedYearId = watch("academic_year_id");
  const operatingDays = watch("operating_days") || [];

  const { data: years = [] } = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("*").order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: school } = useQuery({
    queryKey: ["school-music-school", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("school_music_schools").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (school) {
      const opDays = (school as any).operating_days as number[] | null;
      const fallback = (school as any).day_of_week != null ? [(school as any).day_of_week] : [];
      reset({
        school_name: school.school_name,
        slug: (school as any).slug || "",
        academic_year_id: school.academic_year_id || "",
        notes: school.notes || "",
        is_active: school.is_active,
        operating_days: Array.isArray(opDays) && opDays.length > 0 ? opDays : fallback,
        principal_name: (school as any).principal_name || "",
        principal_phone: (school as any).principal_phone || "",
        vice_principal_name: (school as any).vice_principal_name || "",
        vice_principal_phone: (school as any).vice_principal_phone || "",
        annual_tuition_fee: Number((school as any).annual_tuition_fee ?? 650),
        icount_payment_page_url: (school as any).icount_payment_page_url || "",
      });
    }
  }, [school, reset]);

  useEffect(() => {
    if (!isEdit && years.length > 0 && !selectedYearId) {
      const active = years.find((y: any) => y.is_active);
      if (active) setValue("academic_year_id", active.id);
    }
  }, [years, isEdit, selectedYearId, setValue]);

  const toggleDay = (day: number, checked: boolean) => {
    const current = (watch("operating_days") || []) as number[];
    const next = checked ? [...current, day].sort((a, b) => a - b) : current.filter((d) => d !== day);
    setValue("operating_days", [...new Set(next)]);
  };

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const days = (data.operating_days || []).map((d) => Number(d)).filter((d) => !Number.isNaN(d));
      const payload: any = {
        school_name: data.school_name,
        slug: data.slug?.trim() || null,
        academic_year_id: data.academic_year_id || null,
        notes: data.notes || null,
        is_active: data.is_active,
        operating_days: days,
        // keep legacy day_of_week in sync for backward compat (first day or null)
        day_of_week: days.length > 0 ? days[0] : null,
        principal_name: data.principal_name || null,
        principal_phone: data.principal_phone || null,
        vice_principal_name: data.vice_principal_name || null,
        vice_principal_phone: data.vice_principal_phone || null,
        annual_tuition_fee: Number(data.annual_tuition_fee) || 650,
        icount_payment_page_url: data.icount_payment_page_url?.trim() || null,
      };
      if (isEdit) {
        const { error } = await supabase.from("school_music_schools").update(payload).eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("school_music_schools").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-music-schools"] });
      queryClient.invalidateQueries({ queryKey: ["school-music-school", id] });
      toast.success(isEdit ? "בית הספר עודכן בהצלחה" : "בית הספר נוצר בהצלחה");
      navigate("/admin/school-music-schools");
    },
    onError: () => toast.error("שגיאה בשמירת הנתונים"),
  });

  return (
    <AdminLayout title={isEdit ? "עריכת בית ספר מנגן" : "בית ספר מנגן חדש"} backPath="/admin/school-music-schools">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5 max-w-2xl">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטי בית ספר</h2>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">שם בית ספר *</Label>
              <Input {...register("school_name", { required: "שדה חובה" })} className="h-12 rounded-xl" />
              {errors.school_name && <p className="text-sm text-destructive">{errors.school_name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">מזהה באנגלית (Slug)</Label>
              <Input
                {...register("slug")}
                className="h-12 rounded-xl"
                dir="ltr"
                placeholder="HaOmer / CarmelVaYam / Maaganim / Sitrin / Caesarea"
              />
              <p className="text-xs text-muted-foreground">
                מזהה קריא באנגלית לשימוש בקישורי הרשמה ותשלום (למשל ?school=HaOmer). ייחודי לכל שנה.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">שנת לימודים</Label>
              <Select value={selectedYearId} onValueChange={(v) => setValue("academic_year_id", v)}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="בחר שנה" /></SelectTrigger>
                <SelectContent>
                  {years.map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">ימי פעילות</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 rounded-xl border border-input p-3 bg-background">
                {OPERATING_DAYS.map((d) => {
                  const checked = operatingDays.includes(d);
                  return (
                    <label key={d} className="flex items-center gap-2 cursor-pointer text-sm">
                      <Checkbox checked={checked} onCheckedChange={(v) => toggleDay(d, !!v)} />
                      <span>{DAY_NAMES[d]}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">בחר/י ימים בהם בית הספר פועל (לזיהוי דיווחי נוכחות חסרים).</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">הנהלת בית הספר</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">שם מנהל/ת</Label>
              <Input {...register("principal_name")} className="h-12 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">טלפון מנהל/ת</Label>
              <Input {...register("principal_phone")} className="h-12 rounded-xl" dir="ltr" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">שם סגן/ית</Label>
              <Input {...register("vice_principal_name")} className="h-12 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">טלפון סגן/ית</Label>
              <Input {...register("vice_principal_phone")} className="h-12 rounded-xl" dir="ltr" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">תשלום</h2>
          <div className="space-y-1.5">
            <Label className="text-sm">דמי השתתפות שנתיים (₪)</Label>
            <Input
              type="number"
              min={0}
              step="1"
              {...register("annual_tuition_fee", { valueAsNumber: true })}
              className="h-12 rounded-xl"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground">הסכום שיוצג להורה בעמוד הסליקה (ברירת מחדל 650 ש"ח, קיסריה 1600).</p>
          </div>

          {/*
            NOT IN USE — עמוד הסליקה ב-iCount נוצר דינמית לכל הורה דרך
            ה-edge function `icount-generate-paylink` (paypage/create API).
            השדה `icount_payment_page_url` בטבלת school_music_schools נשאר
            במסד כשריד היסטורי בלבד.
          */}
        </div>



        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm">הערות</Label>
            <Textarea {...register("notes")} className="rounded-xl min-h-[80px]" />
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={isActive} onCheckedChange={(v) => setValue("is_active", v)} />
            <Label>פעיל</Label>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          כיתות וקבוצות מנוהלים מתוך כרטיס בית הספר לאחר היצירה.
        </p>

        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button type="submit" disabled={mutation.isPending} className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg">
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/school-music-schools")} className="h-14 rounded-2xl text-base px-6">ביטול</Button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default AdminSchoolMusicSchoolForm;
