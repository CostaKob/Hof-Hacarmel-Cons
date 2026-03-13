import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Pencil } from "lucide-react";
import TeacherInstrumentsSection from "@/components/admin/TeacherInstrumentsSection";

const AdminTeacherCard = () => {
  const { teacherId } = useParams();
  const navigate = useNavigate();

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

  if (isLoading) return <AdminLayout title="כרטיס מורה" backPath="/admin/teachers"><p className="text-center text-muted-foreground">טוען...</p></AdminLayout>;
  if (!teacher) return <AdminLayout title="כרטיס מורה" backPath="/admin/teachers"><p className="text-center text-muted-foreground">מורה לא נמצא</p></AdminLayout>;

  const DetailRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex justify-between border-b py-2 last:border-0">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value}</span>
      </div>
    ) : null;

  return (
    <AdminLayout title={`${teacher.first_name} ${teacher.last_name}`} backPath="/admin/teachers">
      <div className="space-y-6 pb-20 md:pb-0">
        <div className="flex items-center justify-between">
          <Badge variant={teacher.is_active ? "default" : "secondary"}>
            {teacher.is_active ? "פעיל" : "לא פעיל"}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => navigate(`/admin/teachers/${teacherId}/edit`)}>
            <Pencil className="h-4 w-4" /> עריכה
          </Button>
        </div>

        <Card>
          <CardHeader><CardTitle>פרטים אישיים</CardTitle></CardHeader>
          <CardContent>
            <DetailRow label="תעודת זהות" value={teacher.national_id} />
            <DetailRow label="תאריך לידה" value={teacher.birth_date} />
            <DetailRow label="טלפון" value={teacher.phone} />
            <DetailRow label="אימייל" value={teacher.email} />
            <DetailRow label="כתובת" value={teacher.address} />
            <DetailRow label="עיר" value={teacher.city} />
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{enrollmentsCount}</p>
              <p className="text-sm text-muted-foreground">רישומים פעילים</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-primary">{lastReport?.report_date ?? "—"}</p>
              <p className="text-sm text-muted-foreground">דיווח אחרון</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>כלי נגינה ({instruments.length})</CardTitle></CardHeader>
          <CardContent>
            {instruments.length === 0 ? (
              <p className="text-sm text-muted-foreground">לא שויכו כלי נגינה</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {instruments.map((i: any) => (
                  <Badge key={i.id} variant="secondary">{i.instruments?.name}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>בתי ספר ({schools.length})</CardTitle></CardHeader>
          <CardContent>
            {schools.length === 0 ? (
              <p className="text-sm text-muted-foreground">לא שויכו בתי ספר</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {schools.map((s: any) => (
                  <Badge key={s.id} variant="secondary">{s.schools?.name}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminTeacherCard;
