import { useNavigate } from "react-router-dom";
import { ChevronRight, Car } from "lucide-react";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useTeacherMonthReports } from "@/hooks/useTeacherDashboardData";

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

const TeacherTravelSummary = () => {
  const navigate = useNavigate();
  const { data: teacher, isLoading } = useTeacherProfile();
  const { data: currentMonthReports } = useTeacherMonthReports(teacher?.id, 0);
  const { data: prevMonthReports } = useTeacherMonthReports(teacher?.id, -1);

  const currentMonthKm = currentMonthReports?.reduce((sum, r) => sum + Number(r.kilometers), 0) ?? 0;
  const prevMonthKm = prevMonthReports?.reduce((sum, r) => sum + Number(r.kilometers), 0) ?? 0;

  const allReports = [
    ...(currentMonthReports ?? []),
    ...(prevMonthReports ?? []),
  ].sort((a, b) => b.report_date.localeCompare(a.report_date));

  if (isLoading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-5 pb-6 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <button onClick={() => navigate("/teacher")} className="shrink-0">
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            <h1 className="text-lg font-bold">סיכום נסיעות</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 py-5 space-y-5">
        {/* Month totals */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-card border border-border p-4 text-center shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">{getMonthName(0)}</p>
            <p className="text-2xl font-bold text-foreground">{currentMonthKm}</p>
            <p className="text-xs text-muted-foreground">ק״מ</p>
          </div>
          <div className="rounded-2xl bg-primary/10 border border-primary/30 p-4 text-center shadow-sm">
            <p className="text-xs text-muted-foreground mb-1">{getMonthName(-1)}</p>
            <p className="text-2xl font-bold text-primary">{prevMonthKm}</p>
            <p className="text-xs text-muted-foreground">ק״מ (לחודש השכר)</p>
          </div>
        </div>

        {/* Detailed list */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-3">
          <h2 className="font-semibold text-foreground text-sm">פירוט ימי עבודה</h2>
          {allReports.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">אין נסיעות מדווחות</p>
          ) : (
            <div className="space-y-1.5">
              {allReports.map((r) => {
                const { formatted, weekday } = formatDateHe(r.report_date);
                return (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-sm"
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
      </main>
    </div>
  );
};

export default TeacherTravelSummary;
