import { useParams, useNavigate } from "react-router-dom";
import { useReportDetails, useReportLines } from "@/hooks/useTeacherData";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Pencil } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  present: "נוכח/ת",
  double_lesson: "שיעור כפול",
  justified_absence: "היעדרות מוצדקת",
  unjustified_absence: "היעדרות בלתי מוצדקת",
  vacation: "חופש",
};

const ROLE_LABELS: Record<string, string> = {
  primary: "ראשי",
  secondary: "משני",
};

const TeacherReportView = () => {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const { data: report, isLoading } = useReportDetails(reportId);
  const { data: lines } = useReportLines(reportId);

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
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/teacher/reports")}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold text-foreground">צפייה בדיווח</h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate(`/teacher/reports/${reportId}/edit`)}>
            <Pencil className="ml-1 h-4 w-4" />
            עריכת דיווח
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-6">
        {/* Report Header */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">פרטי דיווח</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
            <InfoRow label="בית ספר" value={report.schools?.name} />
            <InfoRow label="תאריך" value={report.report_date} />
            <InfoRow label="קילומטרים" value={String(report.kilometers)} />
            <InfoRow label="הערות" value={report.notes} />
            <InfoRow
              label="הוגש"
              value={new Date(report.submitted_at).toLocaleString("he-IL")}
            />
          </CardContent>
        </Card>

        {/* Report Lines */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">שורות דיווח ({lines?.length ?? 0})</CardTitle>
          </CardHeader>
          <CardContent>
            {!lines || lines.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">אין שורות</p>
            ) : (
              <div className="space-y-3">
                {lines.map((line) => (
                  <div key={line.id} className="rounded-lg border border-border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-foreground">
                        {line.enrollments?.students?.first_name}{" "}
                        {line.enrollments?.students?.last_name}
                      </p>
                      <Badge variant="secondary">
                        {STATUS_LABELS[line.status] ?? line.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{line.enrollments?.instruments?.name}</span>
                      <span>·</span>
                      <span>{line.enrollments?.lesson_duration_minutes} דק׳</span>
                      <span>·</span>
                      <span>{line.enrollments?.schools?.name}</span>
                    </div>
                    {line.notes && (
                      <p className="text-sm text-muted-foreground">הערות: {line.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value || "—"}</span>
    </div>
  );
}

export default TeacherReportView;
