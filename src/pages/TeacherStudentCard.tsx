import { useParams, useNavigate } from "react-router-dom";
import { useEnrollmentDetails } from "@/hooks/useTeacherData";
import { useEnrollmentReportLines } from "@/hooks/useEnrollmentReportLines";
import EnrollmentSummary from "@/components/teacher/EnrollmentSummary";
import EnrollmentHistory from "@/components/teacher/EnrollmentHistory";
import { calcYearsOfPlaying } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, User, Phone, Mail, MapPin, Music, School, Calendar } from "lucide-react";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import StudentNotesSection from "@/components/StudentNotesSection";
import PageTitle from "@/components/PageTitle";

const TeacherStudentCard = () => {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const navigate = useNavigate();
  const { data: enrollment, isLoading } = useEnrollmentDetails(enrollmentId);
  const { data: reportLines, isLoading: linesLoading } = useEnrollmentReportLines(enrollmentId);

  const student = enrollment?.students;

  if (isLoading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
        <PageTitle title="כרטיס תלמיד" />
      </div>
    );
  }

  if (!enrollment || !student) {
    return (
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">רישום לא נמצא</p>
        <PageTitle title="כרטיס תלמיד" />
        <Button variant="outline" onClick={() => navigate("/teacher/students")}>חזרה</Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      {/* Header with student name */}
        <PageTitle title={`כרטיס תלמיד — ${student.first_name} ${student.last_name}`} />
      <header className="bg-primary px-5 pb-8 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => navigate("/teacher/students")}
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">{student.first_name} {student.last_name}</h1>
            <p className="text-sm opacity-80">כרטיס תלמיד</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-4 pb-8 space-y-4">
        {/* Student info card */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            פרטי תלמיד
          </h2>
          <div className="grid grid-cols-1 gap-3 text-sm">
            <InfoRow icon={User} label="שם מלא" value={`${student.first_name} ${student.last_name}`} />
            <InfoRow icon={Calendar} label="תאריך לידה" value={student.date_of_birth} />
            <InfoRow icon={MapPin} label="עיר" value={student.city} />
            {((enrollment as any)?.grade || (student as any).grade) && <InfoRow icon={User} label="כיתה" value={(enrollment as any)?.grade || (student as any).grade} />}
            {(student as any).playing_level && <InfoRow icon={Music} label="רמת נגינה" value={(student as any).playing_level} />}
            {student.national_id && <InfoRow icon={User} label="ת.ז." value={student.national_id} />}
            {(student as any).phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">נייד תלמיד/ה:</span>
                <PhoneDisplay phone={(student as any).phone} />
              </div>
            )}
          </div>
        </div>

        {/* Parent info */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground">פרטי הורים</h2>
          <div className="grid grid-cols-1 gap-3 text-sm">
            {student.parent_name && <InfoRow icon={User} label="הורה 1" value={student.parent_name} />}
            {student.parent_phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <PhoneDisplay phone={student.parent_phone} />
              </div>
            )}
            {student.parent_email && (
              <a href={`mailto:${student.parent_email}`} className="flex items-center gap-2 text-primary">
                <Mail className="h-4 w-4" />
                <span className="truncate">{student.parent_email}</span>
              </a>
            )}
            {student.parent_name_2 && (
              <>
                <div className="border-t border-border pt-3" />
                <InfoRow icon={User} label="הורה 2" value={student.parent_name_2} />
                {student.parent_phone_2 && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <PhoneDisplay phone={student.parent_phone_2} />
                  </div>
                )}
                {student.parent_email_2 && (
                  <a href={`mailto:${student.parent_email_2}`} className="flex items-center gap-2 text-primary">
                    <Mail className="h-4 w-4" />
                    <span className="truncate">{student.parent_email_2}</span>
                  </a>
                )}
              </>
            )}
          </div>
        </div>

        {/* Enrollment details */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground">פרטי רישום</h2>
          <div className="grid grid-cols-1 gap-3 text-sm">
            <InfoRow icon={Music} label="כלי" value={enrollment.instruments?.name} />
            <InfoRow icon={Calendar} label="משך שיעור" value={enrollment.lesson_duration_minutes ? `${enrollment.lesson_duration_minutes} דקות` : null} />
            <InfoRow icon={School} label="בית ספר" value={enrollment.schools?.name} />
            <InfoRow icon={Calendar} label="תאריך התחלה" value={enrollment.start_date} />
            {enrollment.end_date && <InfoRow icon={Calendar} label="תאריך סיום" value={enrollment.end_date} />}
            {(() => { const yrs = calcYearsOfPlaying((enrollment as any).instrument_start_date); return yrs !== null ? <InfoRow icon={Music} label="שנות נגינה" value={String(yrs)} /> : null; })()}
            <div className="flex items-center gap-2 pt-1">
              <Badge variant={enrollment.is_active ? "default" : "secondary"} className="rounded-lg">
                {enrollment.is_active ? "פעיל" : "לא פעיל"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Enrollment summary counts */}
        <EnrollmentSummary lines={reportLines ?? []} startDate={enrollment.start_date} />

        {/* Lesson history */}
        <EnrollmentHistory lines={(reportLines ?? []) as any} isLoading={linesLoading} />

        {/* Notes */}
        <StudentNotesSection studentId={enrollment.student_id} enrollmentId={enrollment.id} />
      </main>
    </div>
  );
};

function InfoRow({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground">{value || "—"}</span>
    </div>
  );
}

export default TeacherStudentCard;
