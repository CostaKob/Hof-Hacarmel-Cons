import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

interface ClassSchedule {
  start_time: string;
  end_time: string;
}

interface HomeroomTeacher {
  name: string;
  phone: string;
}

interface FormData {
  school_name: string;
  academic_year_id: string;
  notes: string;
  is_active: boolean;
  classes_count: number;
  day_of_week: string;
  class_schedules: ClassSchedule[];
  homeroom_teachers: HomeroomTeacher[];
}

const AdminSchoolMusicSchoolForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { register, handleSubmit, setValue, watch, reset, control, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      is_active: true, notes: "", school_name: "", academic_year_id: "",
      classes_count: 0, day_of_week: "",
      class_schedules: [], homeroom_teachers: [],
    },
  });

  const { fields: scheduleFields, replace: replaceSchedules } = useFieldArray({ control, name: "class_schedules" });
  const { fields: homeroomFields, replace: replaceHomerooms } = useFieldArray({ control, name: "homeroom_teachers" });

  const isActive = watch("is_active");
  const selectedYearId = watch("academic_year_id");
  const classesCount = watch("classes_count");
  const dayOfWeek = watch("day_of_week");

  // Sync arrays when classes_count changes
  useEffect(() => {
    const count = Number(classesCount) || 0;
    const currentSchedules = watch("class_schedules");
    const currentHomerooms = watch("homeroom_teachers");

    if (count !== currentSchedules.length) {
      const newSchedules: ClassSchedule[] = Array.from({ length: count }, (_, i) => currentSchedules[i] || { start_time: "", end_time: "" });
      replaceSchedules(newSchedules);
    }
    if (count !== currentHomerooms.length) {
      const newHomerooms: HomeroomTeacher[] = Array.from({ length: count }, (_, i) => currentHomerooms[i] || { name: "", phone: "" });
      replaceHomerooms(newHomerooms);
    }
  }, [classesCount]);

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
      const { data, error } = await supabase
        .from("school_music_schools")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  useEffect(() => {
    if (school) {
      const schedules = (school as any).class_schedules || [];
      const homerooms = (school as any).homeroom_teachers || [];
      reset({
        school_name: school.school_name,
        academic_year_id: school.academic_year_id || "",
        notes: school.notes || "",
        is_active: school.is_active,
        classes_count: (school as any).classes_count || 0,
        day_of_week: (school as any).day_of_week != null ? String((school as any).day_of_week) : "",
        class_schedules: schedules,
        homeroom_teachers: homerooms,
      });
    }
  }, [school, reset]);

  // Set default year for new schools
  useEffect(() => {
    if (!isEdit && years.length > 0 && !selectedYearId) {
      const active = years.find((y: any) => y.is_active);
      if (active) setValue("academic_year_id", active.id);
    }
  }, [years, isEdit, selectedYearId, setValue]);

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        school_name: data.school_name,
        academic_year_id: data.academic_year_id || null,
        notes: data.notes || null,
        is_active: data.is_active,
        classes_count: Number(data.classes_count) || 0,
        day_of_week: data.day_of_week ? Number(data.day_of_week) : null,
        class_schedules: data.class_schedules,
        homeroom_teachers: data.homeroom_teachers,
      };
      if (isEdit) {
        const { error } = await supabase.from("school_music_schools").update(payload as any).eq("id", id!);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("school_music_schools").insert(payload as any);
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

  const count = Number(classesCount) || 0;

  return (
    <AdminLayout title={isEdit ? "עריכת בית ספר מנגן" : "בית ספר מנגן חדש"} backPath="/admin/school-music-schools">
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-5 max-w-2xl">
        {/* Basic Details */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטי בית ספר</h2>
          <div className="grid gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">שם בית ספר *</Label>
              <Input {...register("school_name", { required: "שדה חובה" })} className="h-12 rounded-xl" />
              {errors.school_name && <p className="text-sm text-destructive">{errors.school_name.message}</p>}
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">מספר כיתות בשכבה</Label>
                <Input type="number" min={0} {...register("classes_count", { valueAsNumber: true })} className="h-12 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">יום בשבוע</Label>
                <Select value={dayOfWeek} onValueChange={(v) => setValue("day_of_week", v)}>
                  <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="בחר יום" /></SelectTrigger>
                  <SelectContent>
                    {DAY_NAMES.map((name, i) => (
                      <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">הערות</Label>
              <Textarea {...register("notes")} className="rounded-xl min-h-[80px]" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={(v) => setValue("is_active", v)} />
              <Label>פעיל</Label>
            </div>
          </div>
        </div>

        {/* Class Schedules */}
        {count > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <h2 className="font-semibold text-foreground text-base">שעות שיעורים לפי כיתה</h2>
            <div className="grid gap-3">
              {scheduleFields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-[auto_1fr_1fr] gap-3 items-center">
                  <span className="text-sm font-medium text-muted-foreground min-w-[60px]">כיתה {i + 1}</span>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">משעה</Label>
                    <Input type="time" {...register(`class_schedules.${i}.start_time`)} className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">עד שעה</Label>
                    <Input type="time" {...register(`class_schedules.${i}.end_time`)} className="h-10 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Homeroom Teachers */}
        {count > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <h2 className="font-semibold text-foreground text-base">מחנכות כיתות</h2>
            <div className="grid gap-3">
              {homeroomFields.map((field, i) => (
                <div key={field.id} className="grid grid-cols-[auto_1fr_1fr] gap-3 items-center">
                  <span className="text-sm font-medium text-muted-foreground min-w-[60px]">כיתה {i + 1}</span>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">שם מחנכת</Label>
                    <Input {...register(`homeroom_teachers.${i}.name`)} className="h-10 rounded-xl" placeholder="שם" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">טלפון</Label>
                    <Input {...register(`homeroom_teachers.${i}.phone`)} className="h-10 rounded-xl" placeholder="טלפון" dir="ltr" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
