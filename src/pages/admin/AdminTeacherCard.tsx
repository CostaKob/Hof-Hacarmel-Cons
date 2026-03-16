import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, KeyRound, UserCheck, UserX, Trash2, Shield } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import TeacherInstrumentsSection from "@/components/admin/TeacherInstrumentsSection";
import { toast } from "sonner";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const AdminTeacherCard = () => {
  const { teacherId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: teacher, isLoading } = useQuery({
    queryKey: ["admin-teacher", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("*").eq("id", teacherId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollmentsCount = 0 } = useQuery({
    queryKey: ["admin-teacher-enrollments-count", teacherId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("enrollments")
        .select("*", { count: "exact", head: true })
        .eq("teacher_id", teacherId!)
        .eq("is_active", true);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!teacherId,
  });

  const { data: lastReport } = useQuery({
    queryKey: ["admin-teacher-last-report", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("report_date")
        .eq("teacher_id", teacherId!)
        .order("report_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!teacherId,
  });

  const { data: userRoles = [] } = useQuery({
    queryKey: ["admin-teacher-roles", teacher?.user_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", teacher!.user_id!);
      if (error) throw error;
      return data.map((r) => r.role);
    },
    enabled: !!teacher?.user_id,
  });

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ role, add }: { role: string; add: boolean }) => {
      if (add) {
        const { error } = await supabase.from("user_roles").insert({ user_id: teacher!.user_id!, role: role as any });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", teacher!.user_id!).eq("role", role as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-teacher-roles", teacher?.user_id] });
      toast.success("ההרשאה עודכנה בהצלחה");
    },
    onError: () => toast.error("שגיאה בעדכון ההרשאה"),
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("reset-teacher-password", {
        body: { teacher_id: teacherId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => toast.success("הסיסמה אופסה ל-1234 בהצלחה"),
    onError: (err: Error) => toast.error(err.message || "שגיאה באיפוס הסיסמה"),
  });

  const createLoginMutation = useMutation({
    mutationFn: async () => {
      if (!teacher?.email) throw new Error("לא הוגדר אימייל למורה");
      const { data, error } = await supabase.functions.invoke("create-teacher-user", {
        body: { email: teacher.email, teacher_id: teacherId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["admin-teacher", teacherId] });
      if (data?.warning) {
        toast.warning(data.warning);
      } else {
        toast.success("חשבון כניסה נוצר בהצלחה (סיסמה: 1234)");
      }
    },
    onError: (err: Error) => toast.error(err.message || "שגיאה ביצירת חשבון כניסה"),
  });

  const deleteTeacherMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("teachers").delete().eq("id", teacherId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("המורה נמחק בהצלחה");
      navigate("/admin/teachers");
    },
    onError: () => toast.error("שגיאה במחיקת המורה. ייתכן שיש רישומים או דיווחים מקושרים."),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (newActive: boolean) => {
      const { error } = await supabase.from("teachers").update({ is_active: newActive }).eq("id", teacherId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-teacher", teacherId] });
      queryClient.invalidateQueries({ queryKey: ["admin-teachers"] });
      toast.success("הסטטוס עודכן בהצלחה");
    },
    onError: () => toast.error("שגיאה בעדכון הסטטוס"),
  });

  if (isLoading) return <AdminLayout title="כרטיס מורה" backPath="/admin/teachers"><p className="text-center text-muted-foreground py-8">טוען...</p></AdminLayout>;
  if (!teacher) return <AdminLayout title="כרטיס מורה" backPath="/admin/teachers"><p className="text-center text-muted-foreground py-8">מורה לא נמצא</p></AdminLayout>;

  const hasLogin = !!teacher.user_id;

  const DetailRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex justify-between border-b border-border py-2.5 last:border-0">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="font-medium text-foreground text-sm">{value}</span>
      </div>
    ) : null;

  return (
    <AdminLayout title={`${teacher.first_name} ${teacher.last_name}`} backPath="/admin/teachers">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Switch
              id="teacher-active"
              checked={teacher.is_active}
              onCheckedChange={(checked) => toggleActiveMutation.mutate(checked)}
              disabled={toggleActiveMutation.isPending}
            />
            <Label htmlFor="teacher-active" className="text-sm font-medium cursor-pointer">
              {teacher.is_active ? "פעיל" : "לא פעיל"}
            </Label>
          </div>
          <div className="flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="h-11 rounded-xl text-destructive hover:text-destructive">
                  <Trash2 className="h-4 w-4" /> מחיקה
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>מחיקת מורה</AlertDialogTitle>
                  <AlertDialogDescription>
                    האם למחוק את {teacher.first_name} {teacher.last_name}? פעולה זו אינה ניתנת לביטול.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2 sm:flex-row-reverse">
                  <AlertDialogCancel>ביטול</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteTeacherMutation.mutate()}
                    disabled={deleteTeacherMutation.isPending}
                  >
                    {deleteTeacherMutation.isPending ? "מוחק..." : "מחק"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => navigate(`/admin/teachers/${teacherId}/edit`)}>
              <Pencil className="h-4 w-4" /> עריכה
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-1">
          <h2 className="font-semibold text-foreground text-base mb-2">פרטים אישיים</h2>
          {(teacher as any).is_freelance && (
            <Badge variant="secondary" className="mb-2">עצמאי</Badge>
          )}
          <DetailRow label="תעודת זהות" value={teacher.national_id} />
          <DetailRow label="תאריך לידה" value={teacher.birth_date} />
          <DetailRow label="טלפון" value={teacher.phone} />
          <DetailRow label="אימייל" value={teacher.email} />
          <DetailRow label="כתובת" value={teacher.address} />
          <DetailRow label="עיר" value={teacher.city} />
        </div>

        {/* Login Account Section */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-foreground text-base">חשבון כניסה</h2>
          <div className="flex items-center gap-2">
            {hasLogin ? (
              <>
                <UserCheck className="h-5 w-5 text-primary" />
                <span className="font-medium text-foreground text-sm">יש חשבון כניסה</span>
              </>
            ) : (
              <>
                <UserX className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-muted-foreground text-sm">אין חשבון כניסה</span>
              </>
            )}
          </div>
          {hasLogin && teacher.email && (
            <div className="flex justify-between border-b border-border py-2">
              <span className="text-muted-foreground text-sm">אימייל מקושר</span>
              <span className="font-medium text-foreground text-sm">{teacher.email}</span>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            {hasLogin ? (
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => resetPasswordMutation.mutate()}
                disabled={resetPasswordMutation.isPending}
              >
                <KeyRound className="h-4 w-4" />
                {resetPasswordMutation.isPending ? "מאפס..." : "איפוס סיסמה ל-1234"}
              </Button>
            ) : teacher.email ? (
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                onClick={() => createLoginMutation.mutate()}
                disabled={createLoginMutation.isPending}
              >
                <UserCheck className="h-4 w-4" />
                {createLoginMutation.isPending ? "יוצר..." : "צור חשבון כניסה"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">יש להגדיר אימייל למורה כדי ליצור חשבון כניסה</p>
            )}
          </div>
        </div>

        {/* Roles Section */}
        {hasLogin && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <h2 className="font-semibold text-foreground text-base">הרשאות</h2>
            </div>
            {([
              { value: "teacher", label: "מורה" },
              { value: "admin", label: "מנהל" },
              { value: "secretary", label: "מזכירות" },
            ] as const).map((role) => (
              <div key={role.value} className="flex items-center gap-3 py-1">
                <Checkbox
                  id={`role-${role.value}`}
                  checked={userRoles.includes(role.value)}
                  onCheckedChange={(checked) =>
                    toggleRoleMutation.mutate({ role: role.value, add: !!checked })
                  }
                  disabled={toggleRoleMutation.isPending}
                />
                <Label htmlFor={`role-${role.value}`} className="text-sm cursor-pointer">
                  {role.label}
                </Label>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-3 grid-cols-2">
          <button
            type="button"
            className="rounded-2xl border border-border bg-card p-5 text-center shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.98] touch-manipulation"
            onClick={() => navigate(`/admin/students?teacher=${teacherId}`)}
          >
            <p className="text-2xl font-bold text-primary">{enrollmentsCount}</p>
            <p className="text-sm text-muted-foreground">רישומים פעילים</p>
          </button>
          <button
            type="button"
            className="rounded-2xl border border-border bg-card p-5 text-center shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.98] touch-manipulation"
            onClick={() => navigate(`/admin/teachers/${teacherId}/reports`)}
          >
            <p className="text-2xl font-bold text-primary">{lastReport?.report_date ?? "—"}</p>
            <p className="text-sm text-muted-foreground">דיווח אחרון</p>
          </button>
        </div>

        <TeacherInstrumentsSection teacherId={teacherId!} />
      </div>
    </AdminLayout>
  );
};

export default AdminTeacherCard;
