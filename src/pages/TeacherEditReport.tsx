import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import {
  useTeacherProfile,
  useTeacherEnrollments,
  useReportDetails,
  useTeacherReportsForDate,
  useReportLinesForReports,
} from "@/hooks/useTeacherData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, CalendarIcon, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

type AttendanceStatus = Database["public"]["Enums"]["attendance_status"];

const STATUS_OPTIONS: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "נוכח/ת" },
  { value: "double_lesson", label: "שיעור כפול" },
  { value: "justified_absence", label: "היעדרות מוצדקת" },
  { value: "unjustified_absence", label: "היעדרות בלתי מוצדקת" },
  { value: "vacation", label: "חופש" },
];

const MAX_DAILY_KM = 55;

const HEBREW_DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

interface LineState {
  selected: boolean;
  status: AttendanceStatus;
  notes: string;
  existingLineId?: string;
  existingReportId?: string;
}

const TeacherEditReport = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: teacher } = useTeacherProfile();

  // Load the clicked report to get the date
  const { data: report, isLoading: reportLoading } = useReportDetails(reportId);

  // Once we have the date, load ALL reports for that date
  const reportDate = report?.report_date;
  const { data: allDayReports } = useTeacherReportsForDate(teacher?.id, reportDate);

  // Load ALL report lines across all reports for this date
  const allDayReportIds = useMemo(
    () => (allDayReports ?? []).map((r) => r.id),
    [allDayReports]
  );
  const { data: allDayLines, isLoading: linesLoading } = useReportLinesForReports(allDayReportIds);

  // Load ALL active enrollments for this teacher (not filtered by school)
  const { data: allEnrollments } = useTeacherEnrollments(teacher?.id);

  const [editDate, setEditDate] = useState<Date>(new Date());
  const [kilometers, setKilometers] = useState<string>("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // Initialize form fields from the primary report
  useEffect(() => {
    if (report && allDayReports && allDayLines && !initialized) {
      setEditDate(parseISO(report.report_date));
      // Sum km across all reports for this date
      const totalKm = allDayReports.reduce((s, r) => s + Number(r.kilometers), 0);
      setKilometers(String(totalKm));
      setNotes(report.notes ?? "");
      setInitialized(true);
    }
  }, [report, allDayReports, allDayLines, initialized]);

  const dateStr = format(editDate, "yyyy-MM-dd");

  const [lines, setLines] = useState<Record<string, LineState>>({});

  // Build lines state from all enrollments + all existing lines
  const enrollmentIds = useMemo(
    () => (allEnrollments ?? []).map((e) => e.id).join(","),
    [allEnrollments]
  );
  const existingLineIds = useMemo(
    () => (allDayLines ?? []).map((l) => l.enrollment_id).join(","),
    [allDayLines]
  );

  useEffect(() => {
    if (!initialized || !allEnrollments) return;
    const newLines: Record<string, LineState> = {};
    // Add all active enrollments
    allEnrollments.forEach((e) => {
      const existing = allDayLines?.find((l) => l.enrollment_id === e.id);
      if (existing) {
        newLines[e.id] = lines[e.id] ?? {
          selected: true,
          status: existing.status as AttendanceStatus,
          notes: existing.notes ?? "",
          existingLineId: existing.id,
          existingReportId: existing.report_id,
        };
      } else {
        newLines[e.id] = lines[e.id] ?? {
          selected: false,
          status: "present",
          notes: "",
        };
      }
    });
    // Include any existing lines whose enrollment might be inactive
    allDayLines?.forEach((l) => {
      if (!newLines[l.enrollment_id]) {
        newLines[l.enrollment_id] = lines[l.enrollment_id] ?? {
          selected: true,
          status: l.status as AttendanceStatus,
          notes: l.notes ?? "",
          existingLineId: l.id,
          existingReportId: l.report_id,
        };
      }
    });
    setLines(newLines);
  }, [enrollmentIds, existingLineIds, initialized]);

  const updateLine = (id: string, patch: Partial<LineState>) => {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const selectedCount = Object.values(lines).filter((l) => l.selected).length;

  const handleSubmit = async () => {
    if (!teacher || !user || !reportId || !allDayReports) return;

    setSubmitting(true);

    // Km validation: compare against other dates' reports only
    const { data: freshKmData } = await supabase
      .from("reports")
      .select("id, kilometers")
      .eq("teacher_id", teacher.id)
      .eq("report_date", dateStr);

    // Exclude all reports for this workday date from the "other" km count
    const thisDayIds = new Set(allDayReportIds);
    const otherKm =
      freshKmData
        ?.filter((r) => !thisDayIds.has(r.id))
        .reduce((s, r) => s + Number(r.kilometers), 0) ?? 0;

    const enteredKm = Number(kilometers) || 0;
    let finalKm = enteredKm;

    if (otherKm >= MAX_DAILY_KM) {
      toast.warning("כבר דווחו 55 ק״מ עבור תאריך זה. הדיווח יישמר עם 0 ק״מ.");
      finalKm = 0;
    } else if (otherKm + enteredKm > MAX_DAILY_KM) {
      const remaining = MAX_DAILY_KM - otherKm;
      toast.error(
        `לא ניתן לשמור את מספר הק״מ הזה. בתאריך זה כבר דווחו ${otherKm} ק״מ, ולכן ניתן להוסיף עד ${remaining} ק״מ בלבד.`
      );
      setSubmitting(false);
      return;
    }

    // Group selected lines by school
    const selectedEntries = Object.entries(lines).filter(([, l]) => l.selected);
    const enrollmentMap = new Map((allEnrollments ?? []).map((e) => [e.id, e]));

    const bySchool = new Map<string, { enrollmentId: string; line: LineState }[]>();
    for (const [enrollmentId, line] of selectedEntries) {
      const enrollment = enrollmentMap.get(enrollmentId);
      const sid = enrollment?.school_id ?? allDayLines?.find((l) => l.enrollment_id === enrollmentId)?.enrollments?.school_id;
      if (!sid) continue;
      if (!bySchool.has(sid)) bySchool.set(sid, []);
      bySchool.get(sid)!.push({ enrollmentId, line });
    }

    // Delete all existing report lines for this workday
    const existingLineIdsToDelete = allDayLines?.map((l) => l.id) ?? [];
    if (existingLineIdsToDelete.length > 0) {
      const { error } = await supabase.from("report_lines").delete().in("id", existingLineIdsToDelete);
      if (error) { toast.error("שגיאה במחיקת שורות"); setSubmitting(false); return; }
    }

    // Delete all existing reports for this workday
    const existingReportIds = allDayReports.map((r) => r.id);
    if (existingReportIds.length > 0) {
      const { error } = await supabase.from("reports").delete().in("id", existingReportIds);
      if (error) { toast.error("שגיאה במחיקת דיווחים ישנים"); setSubmitting(false); return; }
    }

    // Re-create reports by school with new data
    let isFirst = true;
    let firstNewReportId: string | null = null;

    if (bySchool.size === 0) {
      // No students selected — create a single report to preserve the workday
      const fallbackSchoolId = allDayReports[0]?.school_id ?? allEnrollments?.[0]?.school_id;
      if (!fallbackSchoolId) {
        toast.error("לא נמצא בית ספר לשמירת יום העבודה");
        setSubmitting(false);
        return;
      }
      const { data: newReport, error: reportError } = await supabase
        .from("reports")
        .insert({
          teacher_id: teacher.id,
          school_id: fallbackSchoolId,
          report_date: dateStr,
          kilometers: finalKm,
          notes: notes.trim() || null,
          created_by_user_id: user.id,
        })
        .select("id")
        .single();

      if (reportError) {
        toast.error("שגיאה בשמירת הדיווח");
        setSubmitting(false);
        return;
      }
      firstNewReportId = newReport.id;
    } else {
      for (const [sid, items] of bySchool) {
        const { data: newReport, error: reportError } = await supabase
          .from("reports")
          .insert({
            teacher_id: teacher.id,
            school_id: sid,
            report_date: dateStr,
            kilometers: isFirst ? finalKm : 0,
            notes: notes.trim() || null,
            created_by_user_id: user.id,
          })
          .select("id")
          .single();

        if (reportError) {
          toast.error("שגיאה בשמירת הדיווח");
          setSubmitting(false);
          return;
        }

        if (isFirst) firstNewReportId = newReport.id;

        const lineInserts = items.map(({ enrollmentId, line }) => ({
          report_id: newReport.id,
          enrollment_id: enrollmentId,
          status: line.status,
          notes: line.notes.trim() || null,
        }));

        const { error: linesError } = await supabase.from("report_lines").insert(lineInserts);
        if (linesError) {
          toast.error("שגיאה בשמירת שורות הדיווח");
          setSubmitting(false);
          return;
        }
        isFirst = false;
      }
    }

    queryClient.invalidateQueries({ queryKey: ["teacher-reports"] });
    queryClient.invalidateQueries({ queryKey: ["teacher-last-report"] });

    toast.success("יום העבודה עודכן בהצלחה");
    navigate(firstNewReportId ? `/teacher/reports/${firstNewReportId}` : "/teacher/reports");
  };

  if (reportLoading || linesLoading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!report) {
    return (
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">דיווח לא נמצא</p>
        <Button variant="outline" onClick={() => navigate("/teacher/reports")}>חזרה</Button>
      </div>
    );
  }

  // Build display rows from all enrollments + existing lines
  const allEnrollmentIdSet = new Set([
    ...(allEnrollments ?? []).map((e) => e.id),
    ...(allDayLines ?? []).map((l) => l.enrollment_id),
  ]);

  const enrollmentLookup = new Map((allEnrollments ?? []).map((e) => [e.id, e]));

  const displayRows = Array.from(allEnrollmentIdSet).map((eid) => {
    const enrollment = enrollmentLookup.get(eid);
    const existingLine = allDayLines?.find((l) => l.enrollment_id === eid);
    return {
      enrollmentId: eid,
      studentName: enrollment
        ? `${enrollment.students?.first_name} ${enrollment.students?.last_name}`
        : existingLine?.enrollments
          ? `${existingLine.enrollments.students?.first_name} ${existingLine.enrollments.students?.last_name}`
          : "תלמיד",
      instrumentName: enrollment?.instruments?.name ?? existingLine?.enrollments?.instruments?.name ?? "",
      duration: enrollment?.lesson_duration_minutes ?? existingLine?.enrollments?.lesson_duration_minutes ?? 0,
      schoolName: enrollment?.schools?.name ?? existingLine?.enrollments?.schools?.name ?? "",
    };
  });

  const dayOfWeek = HEBREW_DAYS[editDate.getDay()];

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-5 pb-6 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => navigate(`/teacher/reports/${reportId}`)}
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold">עריכת יום עבודה</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-5">
        {/* Report details */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטי יום עבודה</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">תאריך *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-right font-normal h-12 rounded-xl"
                  >
                    <CalendarIcon className="ml-2 h-4 w-4 text-primary" />
                    {format(editDate, "dd/MM/yyyy")} ({dayOfWeek})
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editDate}
                    onSelect={(d) => d && setEditDate(d)}
                    initialFocus
                    className="p-3 pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">קילומטרים</Label>
              <Input
                type="number"
                min="0"
                value={kilometers}
                onChange={(e) => setKilometers(e.target.value)}
                className="h-12 rounded-xl text-base"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">הערות</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="הערות כלליות..."
                rows={2}
                className="rounded-xl text-base"
              />
            </div>
          </div>
        </div>

        {/* Enrollment Lines */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-base">שורות דיווח</h2>
            {selectedCount > 0 && (
              <Badge variant="default" className="rounded-lg">{selectedCount} נבחרו</Badge>
            )}
          </div>

          {displayRows.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              אין רישומים פעילים
            </p>
          ) : (
            <div className="space-y-3">
              {displayRows.map((row) => {
                const line = lines[row.enrollmentId];
                if (!line) return null;
                return (
                  <div
                    key={row.enrollmentId}
                    className={cn(
                      "rounded-xl border p-4 space-y-3 transition-all",
                      line.selected ? "border-primary bg-accent shadow-sm" : "border-border"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={line.selected}
                        onCheckedChange={(v) => updateLine(row.enrollmentId, { selected: !!v })}
                        className="mt-1 h-5 w-5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground">{row.studentName}</p>
                        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                          <span>{row.instrumentName}</span>
                          <span>·</span>
                          <span>{row.duration} דק׳</span>
                          <span>·</span>
                          <span>{row.schoolName}</span>
                          {line.existingLineId && (
                            <Badge variant="secondary" className="text-xs rounded-lg">קיים</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    {line.selected && (
                      <div className="space-y-3 pr-8">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">סטטוס נוכחות</Label>
                          <Select
                            value={line.status}
                            onValueChange={(v) =>
                              updateLine(row.enrollmentId, { status: v as AttendanceStatus })
                            }
                          >
                            <SelectTrigger className="h-11 rounded-xl">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((opt) => (
                                <SelectItem key={opt.value} value={opt.value}>
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-muted-foreground">הערות</Label>
                          <Input
                            value={line.notes}
                            onChange={(e) =>
                              updateLine(row.enrollmentId, { notes: e.target.value })
                            }
                            placeholder="הערות..."
                            className="h-11 rounded-xl"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sticky submit */}
        <div className="sticky bottom-4 z-10 flex gap-3">
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-14 rounded-2xl text-base"
            onClick={() => navigate(`/teacher/reports/${reportId}`)}
          >
            ביטול
          </Button>
          <Button
            size="lg"
            className="flex-1 h-14 rounded-2xl text-base font-semibold shadow-lg"
            onClick={handleSubmit}
            disabled={submitting}
          >
            <Save className="ml-2 h-5 w-5" />
            {submitting ? "שומר..." : "שמור"}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default TeacherEditReport;
