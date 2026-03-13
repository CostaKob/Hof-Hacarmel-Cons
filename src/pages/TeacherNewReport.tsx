import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import {
  useTeacherProfile,
  useTeacherSchools,
  useTeacherEnrollmentsBySchool,
  useKilometersForDate,
} from "@/hooks/useTeacherData";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
];

const ROLE_LABELS: Record<string, string> = {
  primary: "ראשי",
  secondary: "משני",
};

const MAX_DAILY_KM = 55;

interface LineState {
  selected: boolean;
  status: AttendanceStatus;
  notes: string;
}

const TeacherNewReport = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: teacher } = useTeacherProfile();
  const { data: teacherSchools } = useTeacherSchools(teacher?.id);

  const [schoolId, setSchoolId] = useState<string>("");
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [kilometers, setKilometers] = useState<string>("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const dateStr = format(reportDate, "yyyy-MM-dd");
  const { data: enrollments } = useTeacherEnrollmentsBySchool(teacher?.id, schoolId || undefined);
  const { data: usedKm, refetch: refetchKm } = useKilometersForDate(teacher?.id, dateStr);

  const [lines, setLines] = useState<Record<string, LineState>>({});

  // Reset lines when school changes
  const enrollmentIds = useMemo(() => (enrollments ?? []).map((e) => e.id).join(","), [enrollments]);

  useMemo(() => {
    if (!enrollments) return;
    const newLines: Record<string, LineState> = {};
    enrollments.forEach((e) => {
      newLines[e.id] = lines[e.id] ?? { selected: false, status: "present", notes: "" };
    });
    setLines(newLines);
  }, [enrollmentIds]);

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
    if (!teacher || !user) return;

    setSubmitting(true);

    // Refresh km data
    const { data: freshKmData } = await supabase
      .from("reports")
      .select("kilometers")
      .eq("teacher_id", teacher.id)
      .eq("report_date", dateStr);

    const currentUsedKm = freshKmData?.reduce((s, r) => s + Number(r.kilometers), 0) ?? 0;
    const enteredKm = Number(kilometers) || 0;
    let finalKm = enteredKm;

    if (currentUsedKm >= MAX_DAILY_KM) {
      toast.warning("כבר דווחו 55 ק״מ עבור תאריך זה. הדיווח יישמר עם 0 ק״מ.");
      finalKm = 0;
    } else if (currentUsedKm + enteredKm > MAX_DAILY_KM) {
      const remaining = MAX_DAILY_KM - currentUsedKm;
      toast.error(
        `לא ניתן לשמור את מספר הק״מ הזה. בתאריך זה כבר דווחו ${currentUsedKm} ק״מ, ולכן ניתן להוסיף עד ${remaining} ק״מ בלבד.`
      );
      setSubmitting(false);
      return;
    }

    // Insert report
    const { data: report, error: reportError } = await supabase
      .from("reports")
      .insert({
        teacher_id: teacher.id,
        school_id: schoolId,
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

    // Insert report lines
    const lineInserts = Object.entries(lines)
      .filter(([, l]) => l.selected)
      .map(([enrollmentId, l]) => ({
        report_id: report.id,
        enrollment_id: enrollmentId,
        status: l.status,
        notes: l.notes.trim() || null,
      }));

    const { error: linesError } = await supabase.from("report_lines").insert(lineInserts);

    if (linesError) {
      toast.error("שגיאה בשמירת שורות הדיווח");
      setSubmitting(false);
      return;
    }

    toast.success("הדיווח נשמר בהצלחה");
    navigate("/teacher/reports");
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/teacher")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">דיווח חדש</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-6">
        {/* Report Header */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">פרטי דיווח</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* School */}
              <div className="space-y-2">
                <Label>בית ספר *</Label>
                <Select value={schoolId} onValueChange={setSchoolId}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר בית ספר" />
                  </SelectTrigger>
                  <SelectContent>
                    {teacherSchools?.map((ts) => (
                      <SelectItem key={ts.school_id} value={ts.school_id}>
                        {ts.schools?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date */}
              <div className="space-y-2">
                <Label>תאריך דיווח *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-right font-normal")}
                    >
                      <CalendarIcon className="ml-2 h-4 w-4" />
                      {format(reportDate, "dd/MM/yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={reportDate}
                      onSelect={(d) => d && setReportDate(d)}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Kilometers */}
              <div className="space-y-2">
                <Label>קילומטרים</Label>
                <Input
                  type="number"
                  min="0"
                  value={kilometers}
                  onChange={(e) => setKilometers(e.target.value)}
                />
                {usedKm !== undefined && usedKm > 0 && (
                  <p className="text-xs text-muted-foreground">
                    כבר דווחו {usedKm} ק״מ בתאריך זה (מקסימום {MAX_DAILY_KM})
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>הערות</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="הערות כלליות לדיווח..."
                  rows={2}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Enrollment Lines */}
        {schoolId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                שורות דיווח
                {selectedCount > 0 && (
                  <Badge variant="secondary" className="mr-2">{selectedCount} נבחרו</Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!enrollments || enrollments.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-4">
                  אין רישומים פעילים בבית ספר זה
                </p>
              ) : (
                <div className="space-y-3">
                  {enrollments.map((enrollment) => {
                    const line = lines[enrollment.id];
                    if (!line) return null;
                    return (
                      <div
                        key={enrollment.id}
                        className={cn(
                          "rounded-lg border p-3 space-y-3 transition-colors",
                          line.selected ? "border-primary bg-primary/5" : "border-border"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <Checkbox
                            checked={line.selected}
                            onCheckedChange={(v) => updateLine(enrollment.id, { selected: !!v })}
                            className="mt-1"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-foreground">
                              {enrollment.students?.first_name} {enrollment.students?.last_name}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                              <span>{enrollment.instruments?.name}</span>
                              <span>·</span>
                              <span>{enrollment.lesson_duration_minutes} דק׳</span>
                              <Badge variant="outline" className="text-xs">
                                {ROLE_LABELS[enrollment.enrollment_role] ?? enrollment.enrollment_role}
                              </Badge>
                            </div>
                          </div>
                        </div>

                        {line.selected && (
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pr-7">
                            <div className="space-y-1">
                              <Label className="text-xs">סטטוס נוכחות</Label>
                              <Select
                                value={line.status}
                                onValueChange={(v) =>
                                  updateLine(enrollment.id, { status: v as AttendanceStatus })
                                }
                              >
                                <SelectTrigger>
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
                            <div className="space-y-1">
                              <Label className="text-xs">הערות שורה</Label>
                              <Input
                                value={line.notes}
                                onChange={(e) =>
                                  updateLine(enrollment.id, { notes: e.target.value })
                                }
                                placeholder="הערות..."
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <div className="flex justify-end">
          <Button size="lg" onClick={handleSubmit} disabled={submitting || selectedCount === 0}>
            <Save className="ml-2 h-5 w-5" />
            {submitting ? "שומר..." : "שמור דיווח"}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default TeacherNewReport;
