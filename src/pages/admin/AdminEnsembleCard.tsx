import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ENSEMBLE_TYPE_LABELS, ENSEMBLE_STAFF_ROLE_LABELS, ENSEMBLE_STAFF_ROLES } from "@/lib/ensembleConstants";
import { toast } from "sonner";
import { useState } from "react";
import EnsembleStudentPicker from "@/components/admin/EnsembleStudentPicker";

const AdminEnsembleCard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // State for adding student / staff
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  const [selectedStaffRole, setSelectedStaffRole] = useState("");
  const [staffWeeklyHours, setStaffWeeklyHours] = useState("0");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["ensemble", id] });
    queryClient.invalidateQueries({ queryKey: ["ensemble-students", id] });
    queryClient.invalidateQueries({ queryKey: ["ensemble-staff", id] });
  };

  const { data: ensemble, isLoading } = useQuery({
    queryKey: ["ensemble", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ensembles")
        .select("*, schools(name), academic_years(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: ensembleStudents = [] } = useQuery({
    queryKey: ["ensemble-students", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ensemble_students")
        .select("*, students(id, first_name, last_name)")
        .eq("ensemble_id", id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: ensembleStaff = [] } = useQuery({
    queryKey: ["ensemble-staff", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ensemble_staff")
        .select("*, teachers(id, first_name, last_name)")
        .eq("ensemble_id", id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // All students & teachers for selectors
  const { data: allStudents = [] } = useQuery({
    queryKey: ["all-students-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id, first_name, last_name").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: allTeachers = [] } = useQuery({
    queryKey: ["all-teachers-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("id, first_name, last_name").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const addStudent = useMutation({
    mutationFn: async () => {
      if (!selectedStudentId) return;
      const { error } = await supabase.from("ensemble_students").insert({ ensemble_id: id!, student_id: selectedStudentId });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setSelectedStudentId(""); toast.success("התלמיד נוסף"); },
    onError: (e: any) => toast.error(e.message?.includes("duplicate") ? "התלמיד כבר משויך" : "שגיאה"),
  });

  const removeStudent = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("ensemble_students").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("התלמיד הוסר"); },
    onError: () => toast.error("שגיאה"),
  });

  const addStaff = useMutation({
    mutationFn: async () => {
      if (!selectedTeacherId || !selectedStaffRole) return;
      const { error } = await supabase.from("ensemble_staff").insert({
        ensemble_id: id!,
        teacher_id: selectedTeacherId,
        role: selectedStaffRole as any,
        weekly_hours: Number(staffWeeklyHours) || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setSelectedTeacherId("");
      setSelectedStaffRole("");
      setStaffWeeklyHours("0");
      toast.success("איש הצוות נוסף");
    },
    onError: () => toast.error("שגיאה"),
  });

  const removeStaff = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("ensemble_staff").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("איש הצוות הוסר"); },
    onError: () => toast.error("שגיאה"),
  });

  const deleteEnsemble = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("ensembles").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ensembles"] });
      toast.success("ההרכב נמחק");
      navigate("/admin/ensembles");
    },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  if (isLoading) {
    return <AdminLayout title="טוען..." backPath="/admin/ensembles"><p className="text-center text-muted-foreground py-8">טוען...</p></AdminLayout>;
  }

  if (!ensemble) {
    return <AdminLayout title="לא נמצא" backPath="/admin/ensembles"><p className="text-center text-muted-foreground py-8">ההרכב לא נמצא</p></AdminLayout>;
  }

  const existingStudentIds = new Set(ensembleStudents.map((es: any) => es.student_id));
  const availableStudents = allStudents.filter((s: any) => !existingStudentIds.has(s.id));

  return (
    <AdminLayout title={ensemble.name} backPath="/admin/ensembles">
      <div className="space-y-5">
        {/* Details */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg">פרטי ההרכב</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate(`/admin/ensembles/${id}/edit`)}>
                <Pencil className="h-4 w-4 ml-1" /> עריכה
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => { if (confirm("למחוק את ההרכב?")) deleteEnsemble.mutate(); }}
              >
                <Trash2 className="h-4 w-4 ml-1" /> מחיקה
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2 items-center">
              <span className="text-muted-foreground">סוג:</span>
              <span>{ENSEMBLE_TYPE_LABELS[ensemble.ensemble_type] || ensemble.ensemble_type}</span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-muted-foreground">שנה:</span>
              <span>{(ensemble as any).academic_years?.name || "—"}</span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-muted-foreground">בית ספר:</span>
              <span>{(ensemble as any).schools?.name || "—"}</span>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-muted-foreground">שעות שבועיות:</span>
              <span>{ensemble.weekly_hours}</span>
            </div>
            {ensemble.notes && (
              <div className="flex gap-2">
                <span className="text-muted-foreground">הערות:</span>
                <span>{ensemble.notes}</span>
              </div>
            )}
            <div className="flex gap-2 items-center">
              <span className="text-muted-foreground">סטטוס:</span>
              <Badge variant={ensemble.is_active ? "default" : "secondary"}>{ensemble.is_active ? "פעיל" : "לא פעיל"}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Staff */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">צוות ({ensembleStaff.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ensembleStaff.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="font-medium">{s.teachers?.first_name} {s.teachers?.last_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {ENSEMBLE_STAFF_ROLE_LABELS[s.role] || s.role} · {s.weekly_hours} שעות
                  </p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => removeStaff.mutate(s.id)}>
                  <X className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}

            <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t">
              <Select value={selectedTeacherId} onValueChange={setSelectedTeacherId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="בחר מורה" /></SelectTrigger>
                <SelectContent>
                  {allTeachers.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedStaffRole} onValueChange={setSelectedStaffRole}>
                <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="תפקיד" /></SelectTrigger>
                <SelectContent>
                  {ENSEMBLE_STAFF_ROLES.map((r) => (
                    <SelectItem key={r} value={r}>{ENSEMBLE_STAFF_ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="number"
                step="0.5"
                min="0"
                placeholder="שעות"
                value={staffWeeklyHours}
                onChange={(e) => setStaffWeeklyHours(e.target.value)}
                className="w-full sm:w-24"
              />
              <Button
                onClick={() => addStaff.mutate()}
                disabled={!selectedTeacherId || !selectedStaffRole || addStaff.isPending}
                className="shrink-0"
              >
                <Plus className="h-4 w-4 ml-1" /> הוסף
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Students */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">משתתפים ({ensembleStudents.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {ensembleStudents.map((es: any) => (
                <Badge
                  key={es.id}
                  variant="secondary"
                  className="text-sm gap-1.5 pl-3 pr-1.5 py-1.5 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => navigate(`/admin/students/${es.student_id}`)}
                >
                  {es.students?.first_name} {es.students?.last_name}
                  <button
                    onClick={(e) => { e.stopPropagation(); removeStudent.mutate(es.id); }}
                    className="hover:text-destructive rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Select value={selectedStudentId} onValueChange={setSelectedStudentId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="בחר תלמיד" /></SelectTrigger>
                <SelectContent>
                  {availableStudents.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                onClick={() => addStudent.mutate()}
                disabled={!selectedStudentId || addStudent.isPending}
                className="shrink-0"
              >
                <Plus className="h-4 w-4 ml-1" /> הוסף
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminEnsembleCard;
