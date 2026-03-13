import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { parseISO } from "date-fns";
import { useTeacherProfile, useTeacherReports } from "@/hooks/useTeacherData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Plus, CalendarDays, Navigation, Users, Pencil } from "lucide-react";

const HEBREW_DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

const STATUS_LABELS_SHORT: Record<string, string> = {
  present: "נוכח/ת",
  double_lesson: "כפול",
  justified_absence: "מוצדק",
  unjustified_absence: "לא מוצדק",
  vacation: "חופש",
};

const STATUS_DOT_COLORS: Record<string, string> = {
  present: "bg-emerald-500",
  double_lesson: "bg-blue-500",
  justified_absence: "bg-amber-500",
  unjustified_absence: "bg-red-500",
  vacation: "bg-purple-500",
};

function formatDateWithDay(dateStr: string) {
  const d = parseISO(dateStr);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  const weekday = HEBREW_DAYS[d.getDay()];
  return { formatted: `${day}/${month}/${year}`, weekday };
}

const TeacherReports = () => {
  const navigate = useNavigate();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { data: reports, isLoading: reportsLoading } = useTeacherReports(teacher?.id);

  const [dateFilter, setDateFilter] = useState("");

  const filtered = useMemo(() => {
    if (!reports) return [];
    return reports.filter((r) => {
      if (dateFilter && !r.report_date.includes(dateFilter)) return false;
      return true;
    });
  }, [reports, dateFilter]);

  const isLoading = teacherLoading || reportsLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary px-5 pb-6 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/10"
              onClick={() => navigate("/teacher")}
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold">ימי העבודה שלי</h1>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl h-10"
            onClick={() => navigate("/teacher/reports/new")}
          >
            <Plus className="ml-1 h-4 w-4" />
            יום חדש
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 pt-4 pb-8 space-y-4">
        {/* Date filter */}
        <div className="max-w-[200px] space-y-1">
          <Label className="text-xs text-muted-foreground">סינון לפי תאריך</Label>
          <Input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="h-11 rounded-xl bg-card"
          />
        </div>

        {/* Results */}
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">לא נמצאו ימי עבודה</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((report) => {
              const { formatted, weekday } = formatDateWithDay(report.report_date);
              const lines = report.report_lines ?? [];
              return (
                <button
                  key={report.id}
                  onClick={() => navigate(`/teacher/reports/${report.id}`)}
                  className="w-full rounded-2xl bg-card shadow-sm border border-border text-right transition-all active:scale-[0.98] hover:shadow-md overflow-hidden"
                >
                  {/* Card header */}
                  <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5 text-primary" />
                      <span className="text-lg font-bold text-foreground">{formatted}</span>
                      <span className="text-sm font-medium text-muted-foreground">({weekday})</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {report.kilometers > 0 && (
                        <Badge variant="secondary" className="rounded-lg text-xs gap-1">
                          <Navigation className="h-3 w-3" />
                          {report.kilometers} ק״מ
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* School name (only if set on report) */}
                  {report.schools?.name && (
                    <div className="px-4 pb-2">
                      <span className="text-sm text-muted-foreground">{report.schools?.name}</span>
                    </div>
                  )}

                  {/* Student rows */}
                  {lines.length > 0 && (
                    <div className="border-t border-border px-4 py-2 space-y-2">
                      {lines.map((line: any) => {
                        const enr = line.enrollments;
                        const studentName = `${enr?.students?.first_name ?? ""} ${enr?.students?.last_name ?? ""}`.trim();
                        const schoolName = enr?.schools?.name;
                        const instrumentName = enr?.instruments?.name;
                        const duration = enr?.lesson_duration_minutes;
                        return (
                          <div
                            key={line.id}
                            className="flex items-start gap-2 text-sm"
                            onClick={(e) => {
                              if (enr?.student_id) {
                                e.stopPropagation();
                                navigate(`/teacher/students/${enr.student_id}`);
                              }
                            }}
                          >
                            <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${STATUS_DOT_COLORS[line.status] ?? "bg-muted"}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-medium text-primary underline truncate">{studentName}</span>
                                <span className="text-xs text-muted-foreground shrink-0">{STATUS_LABELS_SHORT[line.status]}</span>
                              </div>
                              <div className="text-xs text-muted-foreground truncate">
                                {[schoolName, instrumentName, duration ? `${duration} דק׳` : null].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Footer */}
                  <div className="border-t border-border px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Users className="h-3.5 w-3.5" />
                      <span>{lines.length} תלמידים</span>
                    </div>
                    <span className="text-xs text-primary font-medium">צפייה ←</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherReports;
