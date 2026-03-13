import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "@/hooks/useAuth";
import {
  useTeacherProfile,
  useTeacherSchools,
  useTeacherEnrollments,
  useKilometersForDate,
} from "@/hooks/useTeacherData";
import { supabase } from "@/integrations/supabase/client";
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
}

const TeacherNewReport = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: teacher } = useTeacherProfile();
  const { data: allEnrollments } = useTeacherEnrollments(teacher?.id);

  // Derive unique schools from enrollments (more reliable than teacher_schools)
  const enrollmentSchools = useMemo(() => {
    if (!allEnrollments) return [];
    const map = new Map<string, { id: string; name: string }>();
    allEnrollments.forEach((e) => {
      if (e.schools?.id && e.schools?.name) {
        map.set(e.schools.id, { id: e.schools.id, name: e.schools.name });
      }
    });
    return [...map.values()];
  }, [allEnrollments]);

  const [schoolId, setSchoolId] = useState<string>("");
  const [reportDate, setReportDate] = useState<Date>(new Date());
  const [kilometers, setKilometers] = useState<string>("0");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const dateStr = format(reportDate, "yyyy-MM-dd");
  const { data: usedKm } = useKilometersForDate(teacher?.id, dateStr);

  const enrollments = useMemo(() => {
    if (!allEnrollments) return [];
    if (!schoolId || schoolId === "all") return allEnrollments;
    return allEnrollments.filter((e) => e.school_id === schoolId);
  }, [allEnrollments, schoolId]);

  const [lines, setLines] = useState<Record<string, LineState>>({});

  const enrollmentIds = useMemo(() => enrollments.map((e) => e.id).join(","), [enrollments]);

  useMemo(() => {
    if (!enrollments.length && !allEnrollments?.length) return;
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

  const getReportSchoolId = (): string | null => {
    if (schoolId && schoolId !== "all") return schoolId;
    const selectedEnrollments = enrollments.filter((e) => lines[e.id]?.selected);
    if (selectedEnrollments.length === 0) return null;
    const schools = new Set(selectedEnrollments.map((e) => e.school_id));
    if (schools.size > 1) return null;
    return selectedEnrollments[0].school_id;
  };

  const handleSubmit = async () => {
    const reportSchoolId = getReportSchoolId();
    if (!reportSchoolId) {
      toast.error("יש לבחור בית ספר, או לסמן תלמידים מבית ספר אחד בלבד");
      return;
    }
    if (selectedCount === 0) {
      toast.error("יש לסמן לפחות רישום אחד");
      return;
    }
    if (!teacher || !user) return;

    setSubmitting(true);

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

    const { data: report, error: reportError } = await supabase
      .from("reports")
      .insert({
        teacher_id: teacher.id,
        school_id: reportSchoolId,
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
      {/* Header */}
      <header className="bg-primary px-5 pb-6 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => navigate("/teacher")}
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold">דיווח חדש</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-5">
        {/* Report details card */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטי דיווח</h2>
          <div className="space-y-4">
            {/* Date */}
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

            {/* Km + School row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">קילומטרים</Label>
                <Input
                  type="number"
                  min="0"
                  value={kilometers}
                  onChange={(e) => setKilometers(e.target.value)}
                  className="h-12 rounded-xl text-base"
                />
                {usedKm !== undefined && usedKm > 0 && (
                  <p className="text-xs text-muted-foreground">
                    נוצלו {usedKm}/{MAX_DAILY_KM} ק״מ
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">בית ספר</Label>
                <Select value={schoolId} onValueChange={setSchoolId}>
                  <SelectTrigger className="h-12 rounded-xl">
                    <SelectValue placeholder="הכל" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל בתי הספר</SelectItem>
                    {teacherSchools?.map((ts) => (
                      <SelectItem key={ts.school_id} value={ts.school_id}>
                        {ts.schools?.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Notes */}
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
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-base">שורות דיווח</h2>
            {selectedCount > 0 && (
              <Badge variant="default" className="rounded-lg">{selectedCount} נבחרו</Badge>
            )}
          </div>

          {enrollments.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">
              אין רישומים פעילים
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
                      "rounded-xl border p-4 space-y-3 transition-all",
                      line.selected ? "border-primary bg-accent shadow-sm" : "border-border"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={line.selected}
                        onCheckedChange={(v) => updateLine(enrollment.id, { selected: !!v })}
                        className="mt-1 h-5 w-5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground">
                          {enrollment.students?.first_name} {enrollment.students?.last_name}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                          <span>{enrollment.instruments?.name}</span>
                          <span>·</span>
                          <span>{enrollment.lesson_duration_minutes} דק׳</span>
                          <span>·</span>
                          <span>{enrollment.schools?.name}</span>
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
                              updateLine(enrollment.id, { status: v as AttendanceStatus })
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
                              updateLine(enrollment.id, { notes: e.target.value })
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
        <div className="sticky bottom-4 z-10">
          <Button
            size="lg"
            className="w-full h-14 text-base font-semibold rounded-2xl shadow-lg"
            onClick={handleSubmit}
            disabled={submitting || selectedCount === 0}
          >
            <Save className="ml-2 h-5 w-5" />
            {submitting ? "שומר..." : "שמור דיווח"}
          </Button>
        </div>
      </main>
    </div>
  );
};

export default TeacherNewReport;
