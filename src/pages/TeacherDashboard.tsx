import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherEnrollments, useTeacherLastReport } from "@/hooks/useTeacherData";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useNavigate } from "react-router-dom";
import { Users, FileText, LogOut, GraduationCap, CalendarDays, KeyRound } from "lucide-react";

const TeacherDashboard = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { data: enrollments } = useTeacherEnrollments(teacher?.id);
  const { data: lastReport } = useTeacherLastReport(teacher?.id);

  const uniqueStudents = new Set(enrollments?.map((e) => e.student_id)).size;
  const activeCount = enrollments?.length ?? 0;

  if (teacherLoading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-lg font-bold text-foreground">אזור מורה</h1>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="ml-2 h-4 w-4" />
            התנתק
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold text-foreground">
            שלום, {teacher?.first_name} {teacher?.last_name}
          </h2>
          <p className="text-sm text-muted-foreground">ברוך הבא לאזור האישי שלך</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">רישומים פעילים</CardTitle>
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{activeCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">תלמידים</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{uniqueStudents}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">דיווח אחרון</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">
                {lastReport?.report_date ?? "—"}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Button size="lg" className="w-full" onClick={() => navigate("/teacher/students")}>
            <Users className="ml-2 h-5 w-5" />
            התלמידים שלי
          </Button>
          <Button size="lg" variant="outline" className="w-full" onClick={() => navigate("/teacher/reports/new")}>
            <FileText className="ml-2 h-5 w-5" />
            דיווח חדש
          </Button>
          <Button size="lg" variant="outline" className="w-full" onClick={() => navigate("/teacher/reports")}>
            <CalendarDays className="ml-2 h-5 w-5" />
            הדיווחים שלי
          </Button>
          <Button size="lg" variant="outline" className="w-full" onClick={() => navigate("/teacher/change-password")}>
            <KeyRound className="ml-2 h-5 w-5" />
            שינוי סיסמה
          </Button>
        </div>
      </main>
    </div>
  );
};

export default TeacherDashboard;
