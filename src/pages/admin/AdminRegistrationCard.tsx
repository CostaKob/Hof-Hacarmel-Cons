import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UserCheck, Clock, CheckCircle2, XCircle, Link2, AlertTriangle, UserPlus, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new: { label: "חדש", variant: "default" },
  in_review: { label: "בטיפול", variant: "secondary" },
  approved: { label: "אושר", variant: "outline" },
  rejected: { label: "נדחה", variant: "destructive" },
  converted: { label: "הומר", variant: "outline" },
};

const AdminRegistrationCard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
    queryKey: ["existing-student", registration?.existing_student_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, national_id")
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
      toast.success("ההתאמה הוסרה — ניתן ליצור תלמיד חדש");
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
      toast.success("ההתאמה אושרה — התלמיד הקיים מקושר");
    },
    onError: () => toast.error("שגיאה בעדכון"),
  });

  if (isLoading) {
    return <AdminLayout title="הרשמה"><p className="text-center text-muted-foreground py-8">טוען...</p></AdminLayout>;
  }

  if (!registration) {
    return <AdminLayout title="הרשמה"><p className="text-center text-muted-foreground py-8">ההרשמה לא נמצאה</p></AdminLayout>;
  }

  const r = registration;
  const status = STATUS_CONFIG[r.status] || STATUS_CONFIG.new;
  const isIdMatch = r.match_type === "id_match";
  const isNameMatch = r.match_type === "name_match";
  const hasExistingStudent = !!r.existing_student_id;

  return (
    <AdminLayout
      title={`${r.student_first_name} ${r.student_last_name}`}
      onBack={() => navigate(-1)}
    >
      <div className="space-y-4">
        {/* Status & Actions */}
        <Card>
          <CardContent className="pt-5 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">סטטוס</span>
              <Badge variant={status.variant} className="text-sm">{status.label}</Badge>
            </div>

            {/* ID-based match — confirmed */}
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

            {/* Name-based match — needs confirmation */}
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
                    {confirmMatchMutation.isPending ? "מאשר..." : "זה אותו תלמיד — קשר קיים"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-50"
                    onClick={() => clearMatchMutation.mutate()}
                    disabled={clearMatchMutation.isPending}
                  >
                    <UserPlus className="h-4 w-4 ml-1" />
                    {clearMatchMutation.isPending ? "מעדכן..." : "תלמיד אחר — צור חדש"}
                  </Button>
                </div>
              </div>
            )}

            <Separator />

            <div className="flex flex-wrap gap-2">
              {r.status === "new" && (
                <Button size="sm" variant="secondary" onClick={() => updateStatus.mutate("in_review")}>
                  <Clock className="h-4 w-4 ml-1" /> סמן בטיפול
                </Button>
              )}
              {(r.status === "new" || r.status === "in_review") && (
                <>
                  <Button size="sm" variant="default" onClick={() => updateStatus.mutate("approved")}>
                    <CheckCircle2 className="h-4 w-4 ml-1" /> אשר
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => updateStatus.mutate("rejected")}>
                    <XCircle className="h-4 w-4 ml-1" /> דחה
                  </Button>
                </>
              )}
              {(r.status === "approved" || r.status === "in_review") && r.status !== "converted" && (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => navigate(`/admin/registrations/${r.id}/convert`)}
                >
                  <ClipboardCheck className="h-4 w-4 ml-1" /> טפל בהרשמה
                </Button>
              )}
              {r.status === "converted" && hasExistingStudent && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/admin/students/${r.existing_student_id}`)}>
                  <Link2 className="h-4 w-4 ml-1" /> צפה בתלמיד
                </Button>
              )}
            </div>
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

export default AdminRegistrationCard;
