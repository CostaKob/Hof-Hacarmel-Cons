import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { UserCheck, AlertTriangle, UserPlus, Link2, Trash2, ArrowLeftRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { REGISTRATION_STATUSES, SETTABLE_STATUSES, daysAgoLabel } from "@/lib/registrationStatuses";

const AdminRegistrationCard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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

  const { data: existingStudent } = useQuery({
    queryKey: ["existing-student-full", registration?.existing_student_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, national_id, parent_phone, parent_name, parent_email, parent_national_id, phone, city, grade, gender")
        .eq("id", registration.existing_student_id)
        .single();
      if (error) return null;
      return data;
    },
    enabled: !!registration?.existing_student_id,
  });

  const updateStatus = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("registrations" as any)
        .update({ status: newStatus })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-registration", id] });
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      toast.success("הסטטוס עודכן");
    },
    onError: () => toast.error("שגיאה בעדכון הסטטוס"),
  });

  const clearMatchMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("registrations" as any)
        .update({ existing_student_id: null, match_type: null })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-registration", id] });
      toast.success("ההתאמה הוסרה");
    },
    onError: () => toast.error("שגיאה בעדכון"),
  });

  const confirmMatchMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("registrations" as any)
        .update({ match_type: "id_match" })
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-registration", id] });
      toast.success("ההתאמה אושרה");
    },
    onError: () => toast.error("שגיאה בעדכון"),
  });

  const deleteRegistration = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("registrations" as any)
        .delete()
        .eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-registrations"] });
      toast.success("ההרשמה נמחקה");
      navigate("/admin/registrations");
    },
    onError: () => toast.error("שגיאה במחיקת ההרשמה"),
  });

  if (isLoading) {
    return <AdminLayout title="הרשמה"><p className="text-center text-muted-foreground py-8">טוען...</p></AdminLayout>;
  }

  if (!registration) {
    return <AdminLayout title="הרשמה"><p className="text-center text-muted-foreground py-8">ההרשמה לא נמצאה</p></AdminLayout>;
  }

  const r = registration;
  const statusCfg = REGISTRATION_STATUSES[r.status] || REGISTRATION_STATUSES.new;
  const isIdMatch = r.match_type === "id_match";
  const isNameMatch = r.match_type === "name_match";
  const hasExistingStudent = !!r.existing_student_id;
  const isConverted = r.status === "converted";

  return (
    <AdminLayout
      title={`${r.student_first_name} ${r.student_last_name}`}
      onBack={() => navigate(-1)}
    >
      <div className="space-y-4">
        {/* Status & Actions */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            {/* Status dropdown */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground shrink-0">סטטוס</span>
              {isConverted ? (
                <span className={`text-sm font-medium px-3 py-1 rounded-full ${statusCfg.color}`}>
                  {statusCfg.label}
                </span>
              ) : (
                <Select
                  value={r.status}
                  onValueChange={(val) => updateStatus.mutate(val)}
                  disabled={updateStatus.isPending}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SETTABLE_STATUSES.map((key) => (
                      <SelectItem key={key} value={key}>
                        {REGISTRATION_STATUSES[key]?.label || key}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <span className="text-xs text-muted-foreground">{daysAgoLabel(r.created_at)}</span>

            {/* ID-based match */}
            {hasExistingStudent && isIdMatch && (
              <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                <UserCheck className="h-5 w-5 text-green-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-green-800 dark:text-green-200">נמצא תלמיד קיים במערכת (לפי ת.ז.)</p>
                  {existingStudent && (
                    <button
                      onClick={() => navigate(`/admin/students/${r.existing_student_id}`)}
                      className="text-xs text-green-600 underline"
                    >
                      {existingStudent.first_name} {existingStudent.last_name} →
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Name-based match */}
            {hasExistingStudent && isNameMatch && (
              <div className="space-y-3">
                <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700 rounded-lg p-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      נמצא תלמיד קיים עם אותו שם. יש לבדוק האם זו אותה הרשמה.
                    </p>
                    {existingStudent && (
                      <button
                        onClick={() => navigate(`/admin/students/${r.existing_student_id}`)}
                        className="text-xs text-amber-700 underline mt-1"
                      >
                        צפה בתלמיד: {existingStudent.first_name} {existingStudent.last_name}
                        {existingStudent.national_id ? ` (ת.ז. ${existingStudent.national_id})` : ""} →
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-green-300 text-green-700 hover:bg-green-50"
                    onClick={() => confirmMatchMutation.mutate()}
                    disabled={confirmMatchMutation.isPending}
                  >
                    <UserCheck className="h-4 w-4 ml-1" />
                    זה אותו תלמיד
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={() => clearMatchMutation.mutate()}
                    disabled={clearMatchMutation.isPending}
                  >
                    <UserPlus className="h-4 w-4 ml-1" />
                    תלמיד אחר — צור חדש
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            {/* Single main action */}
            <div className="flex flex-wrap gap-2">
              {!isConverted && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => navigate(`/admin/registrations/${r.id}/convert`)}
                >
                  פתח תלמיד
                </Button>
              )}

              {isConverted && hasExistingStudent && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/admin/students/${r.existing_student_id}`)}>
                  <Link2 className="h-4 w-4 ml-1" /> צפה בתלמיד
                </Button>
              )}

              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setShowDeleteDialog(true)}
              >
                <Trash2 className="h-4 w-4 ml-1" /> מחק הרשמה
              </Button>
            </div>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>מחיקת הרשמה</AlertDialogTitle>
                  <AlertDialogDescription>
                    האם למחוק את ההרשמה של {r.student_first_name} {r.student_last_name}? פעולה זו אינה ניתנת לביטול.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>ביטול</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteRegistration.mutate()}
                    disabled={deleteRegistration.isPending}
                  >
                    {deleteRegistration.isPending ? "מוחק..." : "מחק"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Student Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">פרטי תלמיד/ה</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoGrid items={[
              { label: "שם", value: `${r.student_first_name} ${r.student_last_name}` },
              { label: "ת.ז.", value: r.student_national_id },
              { label: "מגדר", value: r.gender === "male" ? "זכר" : r.gender === "female" ? "נקבה" : r.gender || "—" },
              { label: "סטטוס", value: r.student_status === "new" ? "תלמיד/ה חדש/ה" : r.student_status === "continuing" ? "ממשיך/ה" : "—" },
              { label: "שלוחה", value: r.branch_school_name },
              { label: "בית ספר", value: r.student_school_text },
              { label: "כיתה", value: r.grade },
              { label: "ישוב", value: r.city },
              { label: "טלפון תלמיד/ה", value: r.student_phone || "—" },
            ]} />
          </CardContent>
        </Card>

        {/* Learning Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">פרטי לימודים מבוקשים</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoGrid items={[
              { label: "כלים מבוקשים", value: (r.requested_instruments as string[])?.join(", ") || "—" },
              { label: "משך שיעור", value: r.requested_lesson_duration ? `${r.requested_lesson_duration} דקות` : "—" },
            ]} />
          </CardContent>
        </Card>

        {/* Parent Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">פרטי הורה</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoGrid items={[
              { label: "שם הורה", value: r.parent_name },
              { label: "ת.ז. הורה", value: r.parent_national_id },
              { label: "טלפון", value: r.parent_phone },
              { label: 'דוא"ל', value: r.parent_email },
            ]} />
          </CardContent>
        </Card>

        {/* Diff comparison for returning students */}
        {hasExistingStudent && existingStudent && (
          <DiffCard registration={r} student={existingStudent} />
        )}

        {/* Meta */}
        <Card>
          <CardContent className="pt-5">
            <InfoGrid items={[
              { label: "תאריך הגשה", value: new Date(r.created_at).toLocaleDateString("he-IL") },
              { label: "הערות", value: r.notes || "—" },
            ]} />
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

const InfoGrid = ({ items }: { items: { label: string; value: string }[] }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
    {items.map((item, i) => (
      <div key={i}>
        <p className="text-xs text-muted-foreground">{item.label}</p>
        <p className="text-sm font-medium text-foreground">{item.value}</p>
      </div>
    ))}
  </div>
);

// Diff comparison component for returning students
const DIFF_FIELDS: { label: string; regKey: string; studentKey: string; format?: (v: any) => string }[] = [
  { label: "טלפון הורה", regKey: "parent_phone", studentKey: "parent_phone" },
  { label: "שם הורה", regKey: "parent_name", studentKey: "parent_name" },
  { label: 'דוא"ל הורה', regKey: "parent_email", studentKey: "parent_email" },
  { label: "ת.ז. הורה", regKey: "parent_national_id", studentKey: "parent_national_id" },
  { label: "טלפון תלמיד/ה", regKey: "student_phone", studentKey: "phone" },
  { label: "ישוב", regKey: "city", studentKey: "city" },
  { label: "כיתה", regKey: "grade", studentKey: "grade" },
];

const DiffCard = ({ registration, student }: { registration: any; student: any }) => {
  const diffs = useMemo(() => {
    return DIFF_FIELDS.filter((f) => {
      const regVal = (registration[f.regKey] || "").trim();
      const studentVal = (student[f.studentKey] || "").trim();
      return regVal && studentVal && regVal !== studentVal;
    }).map((f) => ({
      label: f.label,
      oldValue: student[f.studentKey] || "—",
      newValue: registration[f.regKey] || "—",
    }));
  }, [registration, student]);

  if (diffs.length === 0) return null;

  return (
    <Card className="border-amber-200 dark:border-amber-800">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <ArrowLeftRight className="h-4 w-4" />
          שינויים שזוהו ({diffs.length})
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          הפרטים הבאים שונים מהנתונים הקיימים במערכת
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {diffs.map((d, i) => (
          <div key={i} className="rounded-lg border border-border p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">{d.label}</p>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-[11px] text-muted-foreground">ערך קיים</p>
                <p className="text-sm line-through text-muted-foreground">{d.oldValue}</p>
              </div>
              <span className="text-muted-foreground">←</span>
              <div className="flex-1">
                <p className="text-[11px] text-muted-foreground">ערך חדש</p>
                <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400 font-medium">
                  {d.newValue}
                </Badge>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default AdminRegistrationCard;
