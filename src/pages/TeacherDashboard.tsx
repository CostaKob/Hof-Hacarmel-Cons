import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useTeacherEnrollments, useTeacherLastReport } from "@/hooks/useTeacherData";
import { useTeacherMonthReports } from "@/hooks/useTeacherDashboardData";
import { useTeacherEnsembleStaff } from "@/hooks/useTeacherEnsembles";
import { useTeacherSchoolMusicSchools } from "@/hooks/useTeacherSchoolMusic";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Users, FileText, LogOut, GraduationCap, CalendarDays, KeyRound, ChevronLeft, BarChart3, Car, MapPin, Music, School } from "lucide-react";
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
  const { data: lastReport } = useTeacherLastReport(teacher?.id);

  const { data: currentMonthReports } = useTeacherMonthReports(teacher?.id, 0);
  const { data: prevMonthReports } = useTeacherMonthReports(teacher?.id, -1);
  const { data: ensembleStaff } = useTeacherEnsembleStaff(teacher?.id);
  const hasEnsembles = (ensembleStaff ?? []).length > 0;
  const { data: schoolMusicSchools } = useTeacherSchoolMusicSchools(teacher?.id);
  const hasSchoolMusic = (schoolMusicSchools ?? []).length > 0;

  const uniqueStudents = new Set(enrollments?.map((e) => e.student_id)).size;
  const activeCount = enrollments?.length ?? 0;

  const currentMonthWorkdays = currentMonthReports?.length ?? 0;
  const currentMonthKm = currentMonthReports?.reduce((sum, r) => sum + Number(r.kilometers), 0) ?? 0;
  const prevMonthKm = prevMonthReports?.reduce((sum, r) => sum + Number(r.kilometers), 0) ?? 0;

  // 7-day warning logic
  const now = new Date();
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const lastReportDate = lastReport?.report_date ? new Date(lastReport.report_date + "T00:00:00") : null;
  const noReportsEver = !lastReport?.report_date;
  const noRecentReport = lastReportDate ? lastReportDate < sevenDaysAgo : false;
  const showWarning = noReportsEver || noRecentReport;



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
          <StatCard icon={GraduationCap} label="מספר תלמידים" value={activeCount} onClick={() => navigate("/teacher/students")} />
          <StatCard icon={CalendarDays} label="ימי עבודה החודש" value={currentMonthWorkdays} onClick={() => navigate("/teacher/reports")} />
          <StatCard icon={Car} label="נסיעות לחודש הנוכחי" value={`${currentMonthKm} ק״מ`} small onClick={() => navigate("/teacher/travel-summary")} />
          <StatCard icon={MapPin} label="נסיעות לחודש השכר" value={`${prevMonthKm} ק״מ`} small onClick={() => navigate("/teacher/travel-summary?month=-1")} />
          {hasEnsembles && (
            <StatCard icon={Music} label="ההרכבים שלי" value={ensembleStaff!.length} onClick={() => navigate("/teacher/ensembles")} />
          )}
          {hasSchoolMusic && (
            <StatCard icon={School} label="בתי ספר מנגנים" value={schoolMusicSchools!.length} onClick={() => navigate("/teacher/school-music-schools")} />
          )}
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

        {/* No-report warning */}
        {showWarning && (
          <Alert className="border-destructive/50 bg-destructive/10 rounded-2xl">
            <AlertTriangle className="h-5 w-5 text-destructive !right-4 !left-auto" />
            <AlertDescription className="pr-8 text-sm text-destructive font-medium">
              {noReportsEver ? (
                "עדיין לא התקבלו דיווחי שיעורים"
              ) : (
                <>
                  <div>לא התקבל דיווח שיעורים כבר יותר משבוע</div>
                  {lastReportDate && (
                    <div className="mt-1 text-xs opacity-80">
                      הדיווח האחרון: {formatDateHe(lastReport!.report_date).formatted}
                    </div>
                  )}
                </>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Navigation cards */}
        <div className="space-y-3">
          {hasEnsembles && (
            <NavCard
              icon={Music}
              title="ההרכבים שלי"
              subtitle={`${ensembleStaff!.length} הרכבים`}
              onClick={() => navigate("/teacher/ensembles")}
            />
          )}
          {hasSchoolMusic && (
            <NavCard
              icon={School}
              title="קבוצות בית ספר מנגן שלי"
              subtitle={`${schoolMusicSchools!.length} בתי ספר`}
              onClick={() => navigate("/teacher/school-music-schools")}
            />
          )}
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

function StatCard({ icon: Icon, label, value, small, onClick }: { icon: React.ElementType; label: string; value: string | number; small?: boolean; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group rounded-2xl p-4 text-center shadow-sm border bg-card border-border transition-all active:scale-[0.97] hover:shadow-md hover:border-primary/30 cursor-pointer"
    >
      <div className="mx-auto mb-1 flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className={`font-bold text-foreground ${small ? "text-sm" : "text-2xl"}`}>{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      <div className="mt-1.5 text-[10px] font-medium text-primary">לחץ לפרטים ←</div>
    </button>
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
