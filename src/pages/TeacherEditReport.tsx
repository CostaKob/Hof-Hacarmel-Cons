import { useState, useMemo, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import {
  useTeacherProfile,
  useTeacherEnrollmentsBySchool,
  useReportDetails,
  useReportLines,
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

interface LineState {
  selected: boolean;
  status: AttendanceStatus;
  notes: string;
  existingLineId?: string;
}

const TeacherEditReport = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: teacher } = useTeacherProfile();
  const { data: report, isLoading: reportLoading } = useReportDetails(reportId);
  const { data: existingLines, isLoading: linesLoading } = useReportLines(reportId);

  const [schoolId, setSchoolId] = useState<string>("");
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [kilometers, setKilometers] = useState<string>("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (report && existingLines && !initialized) {
      setSchoolId(report.school_id);
      setReportDate(parseISO(report.report_date));
      setKilometers(String(report.kilometers));
      setNotes(report.notes ?? "");
      setInitialized(true);
    }
  }, [report, existingLines, initialized]);

  const dateStr = format(reportDate, "yyyy-MM-dd");
  const { data: enrollments } = useTeacherEnrollmentsBySchool(teacher?.id, schoolId || undefined);

  const [lines, setLines] = useState<Record<string, LineState>>({});

  const enrollmentIds = useMemo(
    () => (enrollments ?? []).map((e) => e.id).join(","),
    [enrollments]
  );
  const existingLineIds = useMemo(
    () => (existingLines ?? []).map((l) => l.enrollment_id).join(","),
    [existingLines]
  );

  useEffect(() => {
    if (!initialized || !enrollments) return;
    const newLines: Record<string, LineState> = {};
    enrollments.forEach((e) => {
      const existing = existingLines?.find((l) => l.enrollment_id === e.id);
      if (existing) {
        newLines[e.id] = lines[e.id] ?? {
          selected: true,
          status: existing.status as AttendanceStatus,
          notes: existing.notes ?? "",
          existingLineId: existing.id,
        };
      } else {
        newLines[e.id] = lines[e.id] ?? {
          selected: false,
          status: "present",
          notes: "",
        };
      }
    });
    existingLines?.forEach((l) => {
      if (!newLines[l.enrollment_id]) {
        newLines[l.enrollment_id] = lines[l.enrollment_id] ?? {
          selected: true,
          status: l.status as AttendanceStatus,
          notes: l.notes ?? "",
          existingLineId: l.id,
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
    if (!schoolId) {
      toast.error("יש לבחור בית ספר");
      return;
    }
    if (selectedCount === 0) {
      toast.error("יש לסמן לפחות רישום אחד");
      return;
    }
    if (!teacher || !user || !reportId) return;

    setSubmitting(true);

    const { data: freshKmData } = await supabase
      .from("reports")
      .select("id, kilometers")
      .eq("teacher_id", teacher.id)
      .eq("report_date", dateStr);

    const otherKm =
      freshKmData
        ?.filter((r) => r.id !== reportId)
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

    const { error: reportError } = await supabase
      .from("reports")
      .update({
        school_id: schoolId,
        report_date: dateStr,
        kilometers: finalKm,
        notes: notes.trim() || null,
      })
      .eq("id", reportId);

    if (reportError) {
      toast.error("שגיאה בעדכון הדיווח");
      setSubmitting(false);
      return;
    }

    const toDelete: string[] = [];
    const toUpdate: { id: string; status: AttendanceStatus; notes: string | null }[] = [];
    const toInsert: { report_id: string; enrollment_id: string; status: AttendanceStatus; notes: string | null }[] = [];

    for (const [enrollmentId, line] of Object.entries(lines)) {
      if (line.selected) {
        if (line.existingLineId) {
          toUpdate.push({ id: line.existingLineId, status: line.status, notes: line.notes.trim() || null });
        } else {
          toInsert.push({ report_id: reportId, enrollment_id: enrollmentId, status: line.status, notes: line.notes.trim() || null });
        }
      } else if (line.existingLineId) {
        toDelete.push(line.existingLineId);
      }
    }

    if (toDelete.length > 0) {
      const { error } = await supabase.from("report_lines").delete().in("id", toDelete);
      if (error) { toast.error("שגיאה במחיקת שורות"); setSubmitting(false); return; }
    }

    for (const upd of toUpdate) {
      const { error } = await supabase.from("report_lines").update({ status: upd.status, notes: upd.notes }).eq("id", upd.id);
      if (error) { toast.error("שגיאה בעדכון שורות"); setSubmitting(false); return; }
    }

    if (toInsert.length > 0) {
      const { error } = await supabase.from("report_lines").insert(toInsert);
      if (error) { toast.error("שגיאה בהוספת שורות חדשות"); setSubmitting(false); return; }
    }

    queryClient.invalidateQueries({ queryKey: ["teacher-reports"] });
    queryClient.invalidateQueries({ queryKey: ["report-details", reportId] });
    queryClient.invalidateQueries({ queryKey: ["report-lines", reportId] });
    queryClient.invalidateQueries({ queryKey: ["teacher-last-report"] });

    toast.success("הדיווח עודכן בהצלחה");
    navigate(`/teacher/reports/${reportId}`);
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

  const allEnrollmentIdSet = new Set([
    ...(enrollments ?? []).map((e) => e.id),
    ...(existingLines ?? []).map((l) => l.enrollment_id),
  ]);

  const enrollmentMap = new Map((enrollments ?? []).map((e) => [e.id, e]));

  const displayRows = Array.from(allEnrollmentIdSet).map((eid) => {
    const enrollment = enrollmentMap.get(eid);
    const existingLine = existingLines?.find((l) => l.enrollment_id === eid);
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

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      {/* Header */}
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
          <h1 className="text-lg font-bold">עריכת דיווח</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-5">
        {/* Report details */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטי דיווח</h2>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm">תאריך דיווח *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-right font-normal h-12 rounded-xl"
                  >
                    <CalendarIcon className="ml-2 h-4 w-4 text-primary" />
                    {format(reportDate, "dd/MM/yyyy")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={reportDate}
                    onSelect={(d) => d && setReportDate(d)}
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
                placeholder="הערות כלליות לדיווח..."
                rows={2}
                className="rounded-xl text-base"
              />
            </div>
          </div>
        </div>

        {/* Enrollment Lines */}
        {schoolId && (
          <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-foreground text-base">שורות דיווח</h2>
              {selectedCount > 0 && (
                <Badge variant="default" className="rounded-lg">{selectedCount} נבחרו</Badge>
              )}
            </div>

            {displayRows.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">
                אין רישומים פעילים בבית ספר זה
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
        )}

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
            disabled={submitting || selectedCount === 0}
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
