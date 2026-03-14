import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ChevronRight, Car, CalendarDays } from "lucide-react";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useTeacherReportsByMonth } from "@/hooks/useTeacherDashboardData";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const WEEKDAYS_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const MONTHS_HE = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

function formatDateHe(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const weekday = WEEKDAYS_HE[d.getDay()];
  return { formatted: `${day}/${month}/${year}`, weekday };
}

function buildMonthOptions() {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  // Show last 12 months including current
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${d.getMonth()}`;
    const label = `${MONTHS_HE[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ value, label });
  }
  return options;
}

const TeacherTravelSummary = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { data: teacher, isLoading } = useTeacherProfile();

  const monthOffset = Number(searchParams.get("month") ?? 0);
  const initialDate = new Date();
  initialDate.setMonth(initialDate.getMonth() + monthOffset);
  const [selected, setSelected] = useState(`${initialDate.getFullYear()}-${initialDate.getMonth()}`);
  const [selYear, selMonth] = selected.split("-").map(Number);

  const { data: reports } = useTeacherReportsByMonth(teacher?.id, selYear, selMonth);
  const totalKm = reports?.reduce((sum, r) => sum + Number(r.kilometers), 0) ?? 0;
  const monthOptions = buildMonthOptions();

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
        {/* Month selector */}
        <Select dir="rtl" value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-full rounded-xl">
            <SelectValue placeholder="בחר חודש" />
          </SelectTrigger>
          <SelectContent>
            {monthOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Total */}
        <div className="rounded-2xl bg-primary/10 border border-primary/30 p-4 text-center shadow-sm">
          <p className="text-xs text-muted-foreground mb-1">
            {MONTHS_HE[selMonth]} {selYear}
          </p>
          <p className="text-3xl font-bold text-primary">{totalKm}</p>
          <p className="text-xs text-muted-foreground">ק״מ</p>
        </div>

        {/* Detailed list */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-sm">פירוט ימי עבודה</h2>
            <span className="text-xs text-muted-foreground">{reports?.length ?? 0} ימים</span>
          </div>
          {(!reports || reports.length === 0) ? (
            <p className="text-center text-sm text-muted-foreground py-4">אין נסיעות מדווחות בחודש זה</p>
          ) : (
            <div className="space-y-1.5">
              {reports.map((r) => {
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

        <Button
          variant="outline"
          className="w-full rounded-2xl h-12"
          onClick={() => navigate("/teacher/reports")}
        >
          <CalendarDays className="ml-2 h-4 w-4" />
          ימי העבודה שלי
        </Button>
      </main>
    </div>
  );
};

export default TeacherTravelSummary;
