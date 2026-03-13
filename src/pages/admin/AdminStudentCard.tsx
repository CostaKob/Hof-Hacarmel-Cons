import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus } from "lucide-react";
import { format } from "date-fns";

const STATUS_MAP: Record<string, string> = {
  present: "נוכח/ת",
  double_lesson: "שיעור כפול",
  justified_absence: "היעדרות מוצדקת",
  unjustified_absence: "היעדרות בלתי מוצדקת",
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  cash: "מזומן",
  check: "צ׳ק",
  transfer: "העברה",
  credit_card: "כרטיס אשראי",
  other: "אחר",
};

const AdminStudentCard = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const { data: student, isLoading } = useQuery({
    queryKey: ["admin-student", studentId],
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("*").eq("id", studentId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ["admin-student-enrollments", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("*, schools(name), instruments(name), teachers(first_name, last_name)")
        .eq("student_id", studentId!);
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ["admin-student-notes", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_notes")
        .select("*, profiles:author_user_id(full_name)")
        .eq("student_id", studentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["admin-student-payments", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_payments")
        .select("*, enrollments(schools(name), instruments(name))")
        .eq("enrollment_id.student_id" as never, studentId!);
      if (error) {
        // Fallback: get enrollment IDs first then payments
        const { data: enrs } = await supabase.from("enrollments").select("id").eq("student_id", studentId!);
        if (!enrs?.length) return [];
        const ids = enrs.map((e) => e.id);
        const { data: p } = await supabase
          .from("student_payments")
          .select("*")
          .in("enrollment_id", ids)
          .order("payment_date", { ascending: false });
        return p ?? [];
      }
      return data;
    },
    enabled: !!studentId,
  });

  if (isLoading) return <AdminLayout title="כרטיס תלמיד" backPath="/admin/students"><p className="text-center text-muted-foreground">טוען...</p></AdminLayout>;
  if (!student) return <AdminLayout title="כרטיס תלמיד" backPath="/admin/students"><p className="text-center text-muted-foreground">תלמיד לא נמצא</p></AdminLayout>;

  const DetailRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex justify-between border-b py-2 last:border-0">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
    ) : null;

  return (
    <AdminLayout title={`${student.first_name} ${student.last_name}`} backPath="/admin/students">
      <div className="space-y-6 pb-20 md:pb-0">
        <div className="flex items-center justify-between">
          <Badge variant={student.is_active ? "default" : "secondary"}>
            {student.is_active ? "פעיל" : "לא פעיל"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/students/${studentId}/edit`)}>
            <Pencil className="h-4 w-4" /> עריכה
          </Button>
        </div>

        <Card>
          <CardHeader><CardTitle>פרטים אישיים</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="תעודת זהות" value={student.national_id} />
            <DetailRow label="תאריך לידה" value={student.date_of_birth} />
            <DetailRow label="כתובת" value={student.address} />
            <DetailRow label="עיר" value={student.city} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>פרטי הורים</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="שם הורה 1" value={student.parent_name} />
            <DetailRow label="טלפון הורה 1" value={student.parent_phone} />
            <DetailRow label="אימייל הורה 1" value={student.parent_email} />
            <DetailRow label="שם הורה 2" value={student.parent_name_2} />
            <DetailRow label="טלפון הורה 2" value={student.parent_phone_2} />
            <DetailRow label="אימייל הורה 2" value={student.parent_email_2} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>רישומים ({enrollments.length})</CardTitle></CardHeader>
          <CardContent>
            {enrollments.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין רישומים</p>
            ) : (
              <div className="space-y-2">
                {enrollments.map((e: any) => (
                  <div key={e.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">{e.schools?.name} — {e.instruments?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {e.teachers?.first_name} {e.teachers?.last_name} · {e.lesson_duration_minutes} דק׳ · {e.lesson_type === "individual" ? "פרטני" : "קבוצתי"}
                      </p>
                    </div>
                    <Badge variant={e.is_active ? "default" : "secondary"}>
                      {e.is_active ? "פעיל" : "לא פעיל"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>הערות ({notes.length})</CardTitle></CardHeader>
          <CardContent>
            {notes.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין הערות</p>
            ) : (
              <div className="space-y-3">
                {notes.map((n: any) => (
                  <div key={n.id} className="rounded-lg border p-3">
                    <p className="text-sm text-foreground">{n.content}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {n.profiles?.full_name ?? "—"} · {format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>תשלומים ({payments.length})</CardTitle></CardHeader>
          <CardContent>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין תשלומים</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="font-medium">₪{p.amount}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.payment_date} · {p.transaction_type === "payment" ? "תשלום" : "זיכוי"}
                        {p.payment_method && ` · ${PAYMENT_METHOD_MAP[p.payment_method] ?? p.payment_method}`}
                      </p>
                    </div>
                    {p.month_reference && <span className="text-sm text-muted-foreground">{p.month_reference}</span>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminStudentCard;
