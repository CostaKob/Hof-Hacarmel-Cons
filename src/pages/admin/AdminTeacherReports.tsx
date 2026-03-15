import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { CalendarDays, Navigation, Users } from "lucide-react";
import { parseISO } from "date-fns";

const HEBREW_DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
const HEBREW_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];

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

const AdminTeacherReports = () => {
  const { teacherId } = useParams();
  const navigate = useNavigate();
  const now = new Date();
  const [monthFilter, setMonthFilter] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);

  const { data: teacher } = useQuery({
    queryKey: ["admin-teacher-name", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("first_name, last_name").eq("id", teacherId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["admin-teacher-reports", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("*, schools(name), report_lines(id, status, notes, enrollment_id, enrollments(lesson_duration_minutes, students(first_name, last_name), schools(name), instruments(name)))")
        .eq("teacher_id", teacherId!)
        .order("report_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!teacherId,
  });

  const monthOptions = useMemo(() => {
    const months = new Set<string>();
    reports.forEach((r: any) => {
      const d = parseISO(r.report_date);
      months.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    });
    return Array.from(months).sort().reverse();
  }, [reports]);

  const formatMonth = (key: string) => {
    const [y, m] = key.split("-");
    return `${HEBREW_MONTHS[parseInt(m) - 1]} ${y}`;
  };

  const filtered = useMemo(() => {
    if (!monthFilter || monthFilter === "all") return reports;
    return reports.filter((r: any) => {
      const d = parseISO(r.report_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      return key === monthFilter;
    });
  }, [reports, monthFilter]);

  const teacherName = teacher ? `${teacher.first_name} ${teacher.last_name}` : "מורה";

  return (
    <AdminLayout title={`ימי עבודה — ${teacherName}`} backPath={`/admin/teachers/${teacherId}`} onBack={() => navigate(-1)}>
      <div className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div className="flex-1 max-w-[200px] space-y-1">
            <Label className="text-xs text-muted-foreground">סינון לפי חודש</Label>
            <Select value={monthFilter} onValueChange={setMonthFilter}>
              <SelectTrigger className="h-11 rounded-xl bg-card">
                <SelectValue placeholder="כל החודשים" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל החודשים</SelectItem>
                {monthOptions.map((m) => (
                  <SelectItem key={m} value={m}>{formatMonth(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="secondary" className="rounded-xl h-11 px-4 text-sm flex items-center">
            {filtered.length} ימי עבודה
          </Badge>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">לא נמצאו ימי עבודה</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((report: any) => {
              const { formatted, weekday } = formatDateWithDay(report.report_date);
              const lines = report.report_lines ?? [];
              return (
                <div key={report.id} className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
                  <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5 text-primary" />
                      <span className="text-lg font-bold text-foreground">{formatted}</span>
                      <span className="text-sm font-medium text-muted-foreground">({weekday})</span>
                    </div>
                    {report.kilometers > 0 && (
                      <Badge variant="secondary" className="rounded-lg text-xs gap-1">
                        <Navigation className="h-3 w-3" />
                        {report.kilometers} ק״מ
                      </Badge>
                    )}
                  </div>

                  {report.schools?.name && (
                    <div className="px-4 pb-2">
                      <span className="text-sm text-muted-foreground">{report.schools.name}</span>
                    </div>
                  )}

                  {lines.length > 0 && (
                    <div className="border-t border-border px-4 py-2 space-y-2">
                      {lines.map((line: any) => {
                        const enr = line.enrollments;
                        const studentName = `${enr?.students?.first_name ?? ""} ${enr?.students?.last_name ?? ""}`.trim();
                        const schoolName = enr?.schools?.name;
                        const instrumentName = enr?.instruments?.name;
                        const duration = enr?.lesson_duration_minutes;
                        return (
                          <div key={line.id} className="flex items-start gap-2 text-sm">
                            <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${STATUS_DOT_COLORS[line.status] ?? "bg-muted"}`} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-1">
                                <span className="font-medium text-foreground truncate">{studentName}</span>
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

                  <div className="border-t border-border px-4 py-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <Users className="h-3.5 w-3.5" />
                    <span>{lines.length} תלמידים</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminTeacherReports;
