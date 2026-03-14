import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherEnrollments, useTeacherLastReport } from "@/hooks/useTeacherData";
import { useTeacherMonthReports } from "@/hooks/useTeacherDashboardData";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Users, FileText, LogOut, GraduationCap, CalendarDays, KeyRound, ChevronLeft, BarChart3, Car, MapPin } from "lucide-react";
import AppLogo from "@/components/AppLogo";

const WEEKDAYS_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function formatDateHe(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const weekday = WEEKDAYS_HE[d.getDay()];
  return { formatted: `${day}/${month}/${year}`, weekday };
}

function getMonthName(offset: number) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("he-IL", { month: "long", year: "numeric" });
}

const TeacherDashboard = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { data: enrollments } = useTeacherEnrollments(teacher?.id);

  const { data: currentMonthReports } = useTeacherMonthReports(teacher?.id, 0);
  const { data: prevMonthReports } = useTeacherMonthReports(teacher?.id, -1);

  const uniqueStudents = new Set(enrollments?.map((e) => e.student_id)).size;
  const activeCount = enrollments?.length ?? 0;

  const currentMonthWorkdays = currentMonthReports?.length ?? 0;
  const currentMonthKm = currentMonthReports?.reduce((sum, r) => sum + Number(r.kilometers), 0) ?? 0;
  const prevMonthKm = prevMonthReports?.reduce((sum, r) => sum + Number(r.kilometers), 0) ?? 0;

  // Combine current + previous month for the travel detail list
  const allReportsForTravel = [
    ...(currentMonthReports ?? []),
    ...(prevMonthReports ?? []),
  ].sort((a, b) => b.report_date.localeCompare(a.report_date));

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
          <div className="flex items-center gap-3">
            <AppLogo size="sm" />
            <div>
              <h1 className="text-xl font-bold">שלום, {teacher?.first_name} 👋</h1>
              <p className="mt-0.5 text-sm opacity-80">ברוך הבא לאזור האישי שלך</p>
            </div>
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
        {/* Stat cards row - 2x2 grid */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard icon={GraduationCap} label="מספר תלמידים" value={activeCount} />
          <StatCard icon={CalendarDays} label="ימי עבודה החודש" value={currentMonthWorkdays} />
          <StatCard icon={Car} label="נסיעות החודש" value={`${currentMonthKm} ק״מ`} small />
          <StatCard icon={MapPin} label="נסיעות לחודש השכר" value={`${prevMonthKm} ק״מ`} small highlight />
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

        {/* Travel summary section */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Car className="h-4 w-4 text-primary" />
            סיכום נסיעות
          </h2>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-muted/30 px-3 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{getMonthName(0)}</p>
              <p className="text-lg font-bold text-foreground">{currentMonthKm} ק״מ</p>
            </div>
            <div className="rounded-xl bg-primary/10 px-3 py-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{getMonthName(-1)}</p>
              <p className="text-lg font-bold text-primary">{prevMonthKm} ק״מ</p>
            </div>
          </div>

          {allReportsForTravel.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-2">אין נסיעות מדווחות</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground">פירוט ימי עבודה:</p>
              {allReportsForTravel.map((r) => {
                const { formatted, weekday } = formatDateHe(r.report_date);
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <span className="text-foreground">
                      {formatted} <span className="text-muted-foreground">({weekday})</span>
                    </span>
                    <span className="font-medium text-foreground">{Number(r.kilometers)} ק״מ</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

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
            icon={BarChart3}
            title="סיכום שיעורים שנתי"
            subtitle="סיכום נוכחות לפי תלמידים"
            onClick={() => navigate("/teacher/yearly-summary")}
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

function StatCard({ icon: Icon, label, value, small, highlight }: { icon: React.ElementType; label: string; value: string | number; small?: boolean; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 text-center shadow-sm border ${highlight ? "bg-primary/10 border-primary/30" : "bg-card border-border"}`}>
      <Icon className={`mx-auto h-5 w-5 mb-1 ${highlight ? "text-primary" : "text-primary"}`} />
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
