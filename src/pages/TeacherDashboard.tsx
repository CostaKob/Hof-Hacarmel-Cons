import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherEnrollments, useTeacherLastReport } from "@/hooks/useTeacherData";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Users, FileText, LogOut, GraduationCap, CalendarDays, KeyRound, ChevronLeft } from "lucide-react";

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
      {/* Blue gradient header */}
      <header className="bg-primary px-5 pb-8 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">שלום, {teacher?.first_name} 👋</h1>
            <p className="mt-1 text-sm opacity-80">ברוך הבא לאזור האישי שלך</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={signOut}
          >
            <LogOut className="ml-1 h-4 w-4" />
            יציאה
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-4 pb-8 space-y-5">
        {/* Stat cards row */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard icon={GraduationCap} label="רישומים" value={activeCount} />
          <StatCard icon={Users} label="תלמידים" value={uniqueStudents} />
          <StatCard icon={CalendarDays} label="דיווח אחרון" value={lastReport?.report_date ? lastReport.report_date.slice(5) : "—"} small />
        </div>

        {/* Primary action */}
        <Button
          size="lg"
          className="w-full h-14 text-base font-semibold rounded-2xl shadow-md"
          onClick={() => navigate("/teacher/reports/new")}
        >
          <FileText className="ml-2 h-5 w-5" />
          יום עבודה חדש
        </Button>

        {/* Navigation cards */}
        <div className="space-y-3">
          <NavCard
            icon={Users}
            title="התלמידים שלי"
            subtitle={`${uniqueStudents} תלמידים פעילים`}
            onClick={() => navigate("/teacher/students")}
          />
          <NavCard
            icon={CalendarDays}
            title="ימי העבודה שלי"
            subtitle="צפייה ועריכת ימי עבודה"
            onClick={() => navigate("/teacher/reports")}
          />
          <NavCard
            icon={KeyRound}
            title="שינוי סיסמה"
            subtitle="עדכון סיסמת הכניסה"
            onClick={() => navigate("/teacher/change-password")}
          />
        </div>
      </main>
    </div>
  );
};

function StatCard({ icon: Icon, label, value, small }: { icon: React.ElementType; label: string; value: string | number; small?: boolean }) {
  return (
    <div className="rounded-2xl bg-card p-4 text-center shadow-sm border border-border">
      <Icon className="mx-auto h-5 w-5 text-primary mb-1" />
      <div className={`font-bold text-foreground ${small ? "text-sm" : "text-2xl"}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}

function NavCard({ icon: Icon, title, subtitle, onClick }: { icon: React.ElementType; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 rounded-2xl bg-card p-4 shadow-sm border border-border text-right transition-all active:scale-[0.98] hover:shadow-md"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent">
        <Icon className="h-5 w-5 text-accent-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-foreground">{title}</p>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <ChevronLeft className="h-5 w-5 text-muted-foreground shrink-0" />
    </button>
  );
}

export default TeacherDashboard;
