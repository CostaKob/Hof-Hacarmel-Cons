import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus } from "lucide-react";
import { format } from "date-fns";
import { calcYearsOfPlaying } from "@/lib/constants";

const STATUS_MAP: Record<string, string> = {
  present: "נוכח/ת",
  double_lesson: "שיעור כפול",
  justified_absence: "היעדרות מוצדקת",
  unjustified_absence: "היעדרות בלתי מוצדקת",
  vacation: "חופש",
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

  if (isLoading) return <AdminLayout title="כרטיס תלמיד" backPath="/admin/students"><p className="text-center text-muted-foreground py-8">טוען...</p></AdminLayout>;
  if (!student) return <AdminLayout title="כרטיס תלמיד" backPath="/admin/students"><p className="text-center text-muted-foreground py-8">תלמיד לא נמצא</p></AdminLayout>;

  const DetailRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex justify-between border-b border-border py-2.5 last:border-0">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="font-medium text-foreground text-sm">{value}</span>
      </div>
    ) : null;

  return (
    <AdminLayout title={`${(student as any).gender === "female" ? "👧" : (student as any).gender === "male" ? "👦" : ""} ${student.first_name} ${student.last_name}`} backPath="/admin/students">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Badge variant={student.is_active ? "default" : "secondary"} className="rounded-lg">
            {student.is_active ? "פעיל" : "לא פעיל"}
          </Badge>
          <Button variant="outline" className="h-11 rounded-xl" onClick={() => navigate(`/admin/students/${studentId}/edit`)}>
            <Pencil className="h-4 w-4" /> עריכה
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-1">
          <h2 className="font-semibold text-foreground text-base mb-2">פרטים אישיים</h2>
          <DetailRow label="תעודת זהות" value={student.national_id} />
          <DetailRow label="מין" value={(student as any).gender === "male" ? "זכר" : (student as any).gender === "female" ? "נקבה" : null} />
          <DetailRow label="נייד תלמיד" value={(student as any).phone} />
          <DetailRow label="תאריך לידה" value={student.date_of_birth} />
          <DetailRow label="כתובת" value={student.address} />
          <DetailRow label="עיר" value={student.city} />
          <DetailRow label="כיתה" value={(student as any).grade} />
          <DetailRow label="רמת נגינה" value={(student as any).playing_level} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-1">
          <h2 className="font-semibold text-foreground text-base mb-2">פרטי הורים</h2>
          <DetailRow label="שם הורה 1" value={student.parent_name} />
          <DetailRow label="טלפון הורה 1" value={student.parent_phone} />
          <DetailRow label="אימייל הורה 1" value={student.parent_email} />
          <DetailRow label="שם הורה 2" value={student.parent_name_2} />
          <DetailRow label="טלפון הורה 2" value={student.parent_phone_2} />
          <DetailRow label="אימייל הורה 2" value={student.parent_email_2} />
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-base">רישומים ({enrollments.length})</h2>
            <Button className="h-10 rounded-xl text-sm" onClick={() => navigate(`/admin/enrollments/new?student_id=${studentId}`)}>
              <Plus className="h-4 w-4" /> שיוך חדש
            </Button>
          </div>
          {enrollments.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין רישומים</p>
          ) : (
            <div className="space-y-2">
              {enrollments.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div>
                    <p className="font-medium text-foreground text-sm">{e.schools?.name} — {e.instruments?.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {e.teachers?.first_name} {e.teachers?.last_name} · {e.lesson_duration_minutes} דק׳ · {e.lesson_type === "individual" ? "פרטני" : "קבוצתי"}
                      {(() => { const yrs = calcYearsOfPlaying((e as any).instrument_start_date); return yrs !== null ? ` · שנות נגינה: ${yrs}` : ""; })()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={e.is_active ? "default" : "secondary"} className="rounded-lg text-xs">
                      {e.is_active ? "פעיל" : "לא פעיל"}
                    </Badge>
                    <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => navigate(`/admin/enrollments/${e.id}/edit`)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-foreground text-base">הערות ({notes.length})</h2>
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין הערות</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n: any) => (
                <div key={n.id} className="rounded-xl border border-border p-3">
                  <p className="text-sm text-foreground">{n.content}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {n.profiles?.full_name ?? "—"} · {format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-foreground text-base">תשלומים ({payments.length})</h2>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין תשלומים</p>
          ) : (
            <div className="space-y-2">
              {payments.map((p: any) => (
                <div key={p.id} className="flex items-center justify-between rounded-xl border border-border p-3">
                  <div>
                    <p className="font-medium text-sm">₪{p.amount}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.payment_date} · {p.transaction_type === "payment" ? "תשלום" : "זיכוי"}
                      {p.payment_method && ` · ${PAYMENT_METHOD_MAP[p.payment_method] ?? p.payment_method}`}
                    </p>
                  </div>
                  {p.month_reference && <span className="text-xs text-muted-foreground">{p.month_reference}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminStudentCard;
