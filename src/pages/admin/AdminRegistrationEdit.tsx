import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save } from "lucide-react";
import { toast } from "sonner";
import PageTitle from "@/components/PageTitle";
import CitySelect from "@/components/CitySelect";
import { GRADES } from "@/lib/constants";
import { sortByName } from "@/lib/sortHebrew";

type FormState = {
  student_first_name: string;
  student_last_name: string;
  student_national_id: string;
  gender: string;
  student_status: string;
  branch_school_name: string;
  student_school_text: string;
  educational_school: string;
  grade: string;
  city: string;
  student_phone: string;
  requested_instruments: string; // comma-separated in UI
  requested_lesson_duration: string;
  parent_name: string;
  parent_national_id: string;
  parent_phone: string;
  parent_email: string;
  notes: string;
};

const empty: FormState = {
  student_first_name: "", student_last_name: "", student_national_id: "",
  gender: "", student_status: "", branch_school_name: "", student_school_text: "",
  educational_school: "", grade: "", city: "", student_phone: "",
  requested_instruments: "", requested_lesson_duration: "",
  parent_name: "", parent_national_id: "", parent_phone: "", parent_email: "", notes: "",
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label className="text-sm">{label}</Label>
    {children}
  </div>
);

const AdminRegistrationEdit = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(empty);

  const { data: registration, isLoading } = useQuery({
    queryKey: ["admin-registration", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations" as any)
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data as any;
    },
    enabled: !!id,
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["admin-schools-active-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").eq("is_active", true);
      if (error) throw error;
      return sortByName(data ?? []);
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: eduSchools = [] } = useQuery({
    queryKey: ["admin-edu-schools-active-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("educational_schools").select("id, name").eq("is_active", true);
      if (error) throw error;
      return sortByName(data ?? []);
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: instruments = [] } = useQuery({
    queryKey: ["admin-instruments-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name");
      if (error) throw error;
      return sortByName(data ?? []);
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!registration) return;
    const r = registration;
    setForm({
      student_first_name: r.student_first_name || "",
      student_last_name: r.student_last_name || "",
      student_national_id: r.student_national_id || "",
      gender: r.gender || "",
      student_status: r.student_status || "",
      branch_school_name: r.branch_school_name || "",
      student_school_text: r.student_school_text || "",
      educational_school: r.educational_school || "",
      grade: r.grade || "",
      city: r.city || "",
      student_phone: r.student_phone || "",
      requested_instruments: Array.isArray(r.requested_instruments) ? r.requested_instruments.join(", ") : "",
      requested_lesson_duration: r.requested_lesson_duration || "",
      parent_name: r.parent_name || "",
      parent_national_id: r.parent_national_id || "",
      parent_phone: r.parent_phone || "",
      parent_email: r.parent_email || "",
      notes: r.notes || "",
    });
  }, [registration]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((p) => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, any> = {
        ...form,
        requested_instruments: form.requested_instruments
          ? form.requested_instruments.split(",").map((s) => s.trim()).filter(Boolean)
          : [],
        gender: form.gender || null,
        student_status: form.student_status || null,
      };
      const { error } = await supabase
        .from("registrations" as any)
        .update(payload)
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("ההרשמה עודכנה");
      queryClient.invalidateQueries({ queryKey: ["admin-registration", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      navigate(`/admin/registrations/${id}`);
    },
    onError: (e: any) => toast.error(`שגיאה בשמירה: ${e.message || ""}`),
  });

  if (isLoading) {
    return <AdminLayout title="עריכת הרשמה"><p className="text-center text-muted-foreground py-8">טוען...</p></AdminLayout>;
  }
  if (!registration) {
    return <AdminLayout title="עריכת הרשמה"><p className="text-center text-muted-foreground py-8">ההרשמה לא נמצאה</p></AdminLayout>;
  }


  return (
    <AdminLayout
      title={`עריכת הרשמה — ${registration.student_first_name} ${registration.student_last_name}`}
      backPath={`/admin/registrations/${id}`}
      onBack={() => navigate(-1)}
    >
      <PageTitle title={`שיוך הרשמה — ${registration.student_first_name} ${registration.student_last_name}`} />
      <div className="space-y-4 pb-24">
        <Card>
          <CardHeader><CardTitle className="text-base">פרטי תלמיד/ה</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="שם פרטי"><Input value={form.student_first_name} onChange={(e) => set("student_first_name", e.target.value)} /></Field>
            <Field label="שם משפחה"><Input value={form.student_last_name} onChange={(e) => set("student_last_name", e.target.value)} /></Field>
            <Field label="ת.ז."><Input value={form.student_national_id} onChange={(e) => set("student_national_id", e.target.value)} /></Field>
            <Field label="מגדר">
              <Select value={form.gender || "none"} onValueChange={(v) => set("gender", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="male">זכר</SelectItem>
                  <SelectItem value="female">נקבה</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="סטטוס תלמיד/ה">
              <Select value={form.student_status || "none"} onValueChange={(v) => set("student_status", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="new">תלמיד/ה חדש/ה</SelectItem>
                  <SelectItem value="continuing">ממשיך/ה</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="שלוחה"><Input value={form.branch_school_name} onChange={(e) => set("branch_school_name", e.target.value)} /></Field>
            <Field label="בית ספר (חינוך)"><Input value={form.educational_school} onChange={(e) => set("educational_school", e.target.value)} /></Field>
            <Field label="כיתה"><Input value={form.grade} onChange={(e) => set("grade", e.target.value)} /></Field>
            <Field label="ישוב"><Input value={form.city} onChange={(e) => set("city", e.target.value)} /></Field>
            <Field label="טלפון תלמיד/ה"><Input value={form.student_phone} onChange={(e) => set("student_phone", e.target.value)} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">פרטי לימודים מבוקשים</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="כלים מבוקשים (מופרד בפסיקים)">
              <Input value={form.requested_instruments} onChange={(e) => set("requested_instruments", e.target.value)} />
            </Field>
            <Field label="משך שיעור (דקות)">
              <Input value={form.requested_lesson_duration} onChange={(e) => set("requested_lesson_duration", e.target.value)} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">פרטי הורה</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="שם הורה"><Input value={form.parent_name} onChange={(e) => set("parent_name", e.target.value)} /></Field>
            <Field label="ת.ז. הורה"><Input value={form.parent_national_id} onChange={(e) => set("parent_national_id", e.target.value)} /></Field>
            <Field label="טלפון הורה"><Input value={form.parent_phone} onChange={(e) => set("parent_phone", e.target.value)} /></Field>
            <Field label='דוא"ל הורה'><Input value={form.parent_email} onChange={(e) => set("parent_email", e.target.value)} /></Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">הערות</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} className="min-h-[100px]" dir="rtl" />
          </CardContent>
        </Card>

        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex-1 h-12 text-base"
          >
            <Save className="h-5 w-5 ml-2" />
            {saveMutation.isPending ? "שומר..." : "שמור שינויים"}
          </Button>
          <Button variant="outline" className="h-12" onClick={() => navigate(-1)}>
            ביטול
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminRegistrationEdit;
