import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Save, X } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: any;
}

const SchoolMusicStudentEditDialog = ({ open, onOpenChange, student }: Props) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Record<string, any>>({});

  useEffect(() => {
    if (open && student) {
      setForm({
        student_first_name: student.student_first_name || "",
        student_last_name: student.student_last_name || "",
        student_national_id: student.student_national_id || "",
        gender: student.gender || "",
        class_name: student.class_name || "",
        city: student.city || "",
        parent_name: student.parent_name || "",
        parent_national_id: student.parent_national_id || "",
        parent_phone: student.parent_phone || "",
        parent_email: student.parent_email || "",
        instrument_id: student.instrument_id || "",
        status: student.status || "new",
        school_music_class_id: student.school_music_class_id || "",
        school_music_school_id: student.school_music_school_id || "",
      });
    }
  }, [open, student]);

  const { data: allClasses = [] } = useQuery({
    queryKey: ["school-music-classes-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_classes" as any)
        .select("id, class_name, school_music_school_id");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const { data: allClassGroups = [] } = useQuery({
    queryKey: ["school-music-class-groups-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_class_groups" as any)
        .select("id, school_music_class_id, instrument_id, teacher_id, instruments(name), teachers(first_name, last_name)");
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const getSchoolClasses = (schoolId: string) =>
    allClasses.filter((c: any) => c.school_music_school_id === schoolId);

  const getClassInstruments = (classId: string) => {
    if (!classId) return [];
    const groupsForClass = allClassGroups.filter((g: any) => g.school_music_class_id === classId);
    const seen = new Set<string>();
    return groupsForClass
      .filter((g: any) => g.instruments && !seen.has(g.instrument_id) && seen.add(g.instrument_id))
      .map((g: any) => ({ id: g.instrument_id, name: g.instruments.name }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name, "he"));
  };

  const findMatchingGroup = (classId: string, instrumentId: string) => {
    if (!classId || !instrumentId) return null;
    return (
      allClassGroups.find(
        (g: any) => g.school_music_class_id === classId && g.instrument_id === instrumentId
      ) || null
    );
  };

  const updateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const { error } = await supabase
        .from("school_music_students")
        .update(data as any)
        .eq("id", student.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-music-student", student.id] });
      queryClient.invalidateQueries({ queryKey: ["school-music-students-all"] });
      toast.success("הפרטים עודכנו בהצלחה");
      onOpenChange(false);
    },
    onError: () => toast.error("שגיאה בעדכון הפרטים"),
  });

  const renderField = (
    label: string,
    field: string,
    type: string = "text",
    dir?: string
  ) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={form[field] || ""}
        onChange={(e) => setForm((p) => ({ ...p, [field]: e.target.value }))}
        type={type}
        dir={dir}
        className="h-10"
      />
    </div>
  );

  const handleSave = () => {
    const mg = findMatchingGroup(form.school_music_class_id, form.instrument_id);
    updateMutation.mutate({
      ...form,
      school_music_class_group_id: mg?.id || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overscroll-contain" dir="rtl">
        <DialogHeader>
          <DialogTitle>עריכת פרטי תלמיד</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground">פרטי תלמיד</p>
            {renderField("שם פרטי", "student_first_name")}
            {renderField("שם משפחה", "student_last_name")}
            {renderField("ת.ז תלמיד", "student_national_id")}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">מגדר</Label>
              <Select
                value={form.gender}
                onValueChange={(v) => setForm((p) => ({ ...p, gender: v }))}
              >
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">זכר</SelectItem>
                  <SelectItem value="female">נקבה</SelectItem>
                  <SelectItem value="other">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {renderField("כיתה", "class_name")}
            {renderField("ישוב", "city")}
          </div>
          <div className="space-y-3">
            <p className="text-xs font-semibold text-muted-foreground">פרטי הורה</p>
            {renderField("שם הורה", "parent_name")}
            {renderField("ת.ז הורה", "parent_national_id")}
            {renderField("טלפון", "parent_phone", "tel", "ltr")}
            {renderField('דוא"ל', "parent_email", "email", "ltr")}
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground">כלי נגינה ושיוך</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">כיתה</Label>
              <Select
                value={form.school_music_class_id || ""}
                onValueChange={(v) =>
                  setForm((p) => ({ ...p, school_music_class_id: v, instrument_id: "" }))
                }
              >
                <SelectTrigger className="h-10"><SelectValue placeholder="בחר כיתה" /></SelectTrigger>
                <SelectContent>
                  {getSchoolClasses(form.school_music_school_id).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">כלי נגינה</Label>
              <Select
                value={form.instrument_id || ""}
                onValueChange={(v) => setForm((p) => ({ ...p, instrument_id: v }))}
                disabled={!form.school_music_class_id}
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder={form.school_music_class_id ? "בחר כלי" : "בחר קודם כיתה"} />
                </SelectTrigger>
                <SelectContent>
                  {getClassInstruments(form.school_music_class_id).map((i: any) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.school_music_class_id && form.instrument_id && (() => {
            const mg = findMatchingGroup(form.school_music_class_id, form.instrument_id);
            if (!mg)
              return <p className="text-xs text-destructive">לא נמצאה קבוצה מתאימה לכיתה וכלי שנבחרו</p>;
            return (
              <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2 text-sm">
                <span className="text-muted-foreground">קבוצה:</span>
                <span className="font-medium">
                  {mg.instruments?.name} – {mg.teachers?.first_name} {mg.teachers?.last_name}
                </span>
              </div>
            );
          })()}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">סטטוס</Label>
            <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">חדש</SelectItem>
                <SelectItem value="in_review">בטיפול</SelectItem>
                <SelectItem value="assigned">שויך</SelectItem>
                <SelectItem value="inactive">לא פעיל</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-4">
          <Button variant="outline" className="h-11 rounded-xl gap-1.5" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" /> ביטול
          </Button>
          <Button
            className="h-11 rounded-xl gap-1.5"
            disabled={updateMutation.isPending}
            onClick={handleSave}
          >
            <Save className="h-4 w-4" /> שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SchoolMusicStudentEditDialog;
