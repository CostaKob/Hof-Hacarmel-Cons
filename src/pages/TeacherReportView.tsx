import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { parseISO } from "date-fns";
import { useReportDetails, useReportLines, useTeacherProfile, useTeacherById, useTeacherReportsForDate } from "@/hooks/useTeacherData";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowRight, Pencil, Trash2, Calendar, MapPin, Navigation } from "lucide-react";
import { toast } from "sonner";

const HEBREW_DAYS = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

const STATUS_LABELS: Record<string, string> = {
  present: "נוכח/ת",
  double_lesson: "שיעור כפול",
  justified_absence: "היעדרות מוצדקת",
  unjustified_absence: "היעדרות בלתי מוצדקת",
  vacation: "חופש",
};

const STATUS_COLORS: Record<string, string> = {
  present: "bg-emerald-100 text-emerald-700 border-emerald-200",
  double_lesson: "bg-blue-100 text-blue-700 border-blue-200",
  justified_absence: "bg-amber-100 text-amber-700 border-amber-200",
  unjustified_absence: "bg-red-100 text-red-700 border-red-200",
  vacation: "bg-purple-100 text-purple-700 border-purple-200",
};

const TeacherReportView = () => {
  const { reportId, teacherId: urlTeacherId } = useParams<{ reportId: string; teacherId?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { roles } = useAuth();
  const isAdminContext = !!urlTeacherId && roles.includes("admin");

  const { data: report, isLoading } = useReportDetails(reportId);
  const { data: lines } = useReportLines(reportId);
  const { data: teacherProfile } = useTeacherProfile();
  const { data: teacherById } = useTeacherById(isAdminContext ? urlTeacherId : undefined);
  const teacher = isAdminContext ? teacherById : teacherProfile;
  const reportDate = report?.report_date;
  const { data: allDayReports } = useTeacherReportsForDate(teacher?.id, reportDate);

  const backPath = isAdminContext ? `/admin/teachers/${urlTeacherId}/reports` : "/teacher/reports";
  const editPath = isAdminContext ? `/admin/teachers/${urlTeacherId}/reports/${reportId}/edit` : `/teacher/reports/${reportId}/edit`;

  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!allDayReports || allDayReports.length === 0) return;
    setDeleting(true);
    try {
      const reportIds = allDayReports.map((r) => r.id);
      // Delete all report_lines first, then reports
      const { error: linesError } = await supabase
        .from("report_lines")
        .delete()
        .in("report_id", reportIds);
      if (linesError) throw linesError;

      const { error: reportsError } = await supabase
        .from("reports")
        .delete()
        .in("id", reportIds);
      if (reportsError) throw reportsError;

      queryClient.invalidateQueries({ queryKey: ["teacher-reports"] });
      toast.success("יום העבודה נמחק בהצלחה");
      navigate("/teacher/reports");
    } catch (err) {
      console.error(err);
      toast.error("שגיאה במחיקת יום העבודה");
    } finally {
      setDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  if (isLoading) {
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
              onClick={() => navigate("/teacher/reports")}
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold">צפייה ביום עבודה</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="rounded-xl h-10"
              onClick={() => navigate(`/teacher/reports/${reportId}/edit`)}
            >
              <Pencil className="ml-1 h-4 w-4" />
              עריכה
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="rounded-xl h-10 text-destructive hover:text-destructive"
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 pt-4 pb-8 space-y-4">
        {/* Report summary card */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4 text-primary" />
            {(() => {
              const d = parseISO(report.report_date);
              const day = d.getDate().toString().padStart(2, "0");
              const month = (d.getMonth() + 1).toString().padStart(2, "0");
              const year = d.getFullYear();
              const weekday = HEBREW_DAYS[d.getDay()];
              return <span className="font-semibold text-foreground text-base">{day}/{month}/{year} ({weekday})</span>;
            })()}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            {report.schools?.name && (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-4 w-4" />
                <span>{report.schools?.name}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Navigation className="h-4 w-4" />
              <span>{report.kilometers} ק״מ</span>
            </div>
          </div>
          {report.notes && (
            <p className="text-sm text-muted-foreground border-t border-border pt-3">{report.notes}</p>
          )}
          <p className="text-xs text-muted-foreground">
            הוגש: {new Date(report.submitted_at).toLocaleString("he-IL")}
          </p>
        </div>

        {/* Report Lines */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-base">שורות דיווח</h2>
            <Badge variant="secondary" className="rounded-lg">{lines?.length ?? 0}</Badge>
          </div>

          {!lines || lines.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">אין שורות</p>
          ) : (
            <div className="space-y-3">
              {lines.map((line) => (
                <div key={line.id} className="rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-foreground">
                      {line.enrollments?.students?.first_name}{" "}
                      {line.enrollments?.students?.last_name}
                    </p>
                    <span className={`text-xs px-2.5 py-1 rounded-lg border ${STATUS_COLORS[line.status] ?? "bg-secondary text-secondary-foreground"}`}>
                      {STATUS_LABELS[line.status] ?? line.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span>{line.enrollments?.instruments?.name}</span>
                    <span>·</span>
                    <span>{line.enrollments?.lesson_duration_minutes} דק׳</span>
                    <span>·</span>
                    <span>{line.enrollments?.schools?.name}</span>
                  </div>
                  {line.notes && (
                    <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-2">הערות: {line.notes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>האם למחוק את יום העבודה הזה?</AlertDialogTitle>
            <AlertDialogDescription>
              כל הדיווחים של אותו יום יימחקו. לא ניתן לבטל פעולה זו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "מוחק..." : "מחק"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeacherReportView;
