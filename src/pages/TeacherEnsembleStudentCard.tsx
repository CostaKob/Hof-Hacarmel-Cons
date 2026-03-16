import { useNavigate, useParams } from "react-router-dom";
import { useTeacherProfile, useTeacherAllEnrollments } from "@/hooks/useTeacherData";
import { useTeacherEnsembleDetail } from "@/hooks/useTeacherEnsembles";
import { DAYS_OF_WEEK_LABELS, ENSEMBLE_STAFF_ROLE_LABELS } from "@/lib/ensembleConstants";
import { ArrowRight, CalendarDays, ChevronLeft, Clock, MapPin, Music, Phone, School, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLogo from "@/components/AppLogo";

const TeacherEnsembleStudentCard = () => {
  const { id, studentId } = useParams<{ id: string; studentId: string }>();
  const navigate = useNavigate();
  const { data: teacher } = useTeacherProfile();
  const { data: ensemble, isLoading } = useTeacherEnsembleDetail(id);
  const { data: allEnrollments } = useTeacherAllEnrollments(teacher?.id);

  const myStaff = (ensemble?.ensemble_staff ?? []).find((staff: any) => staff.teacher_id === teacher?.id);
  const participant = (ensemble?.ensemble_students ?? []).find((entry: any) => entry.student_id === studentId);
  const student = participant?.students;
  const myEnrollment = (allEnrollments ?? []).find((enrollment: any) => enrollment.student_id === studentId);
  const instrumentName = myEnrollment?.instruments?.name;

  if (isLoading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!ensemble || !myStaff || !student) {
    return (
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">התלמיד לא נמצא</p>
        <Button variant="outline" onClick={() => navigate("/teacher/ensembles")}>חזרה</Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-5 pb-6 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate(`/teacher/ensembles/${id}`)}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">{student.first_name} {student.last_name}</h1>
            <p className="text-sm opacity-80">כרטיס תלמיד מתוך ההרכב</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 px-5 pb-8 -mt-3">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="flex items-center gap-2 font-semibold text-foreground">
            <User className="h-4 w-4 text-primary" />
            פרטי תלמיד
          </h2>
          <InfoRow label="שם מלא" value={`${student.first_name} ${student.last_name}`} />
          {instrumentName && <InfoRow label="כלי נגינה" value={instrumentName} />}
          {student.phone && <InfoRow label="טלפון תלמיד" value={student.phone} icon={<Phone className="h-4 w-4 text-muted-foreground" />} />}
          {student.parent_name && <InfoRow label="שם הורה" value={student.parent_name} />}
          {student.parent_phone && <InfoRow label="טלפון הורה" value={student.parent_phone} icon={<Phone className="h-4 w-4 text-muted-foreground" />} />}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="flex items-center gap-2 font-semibold text-foreground">
            <Music className="h-4 w-4 text-primary" />
            פרטי ההרכב
          </h2>
          <InfoRow label="שם הרכב" value={ensemble.name} />
          <InfoRow label="התפקיד שלי" value={ENSEMBLE_STAFF_ROLE_LABELS[myStaff.role] || myStaff.role} />
          {ensemble.day_of_week != null && (
            <InfoRow label="יום" value={`יום ${DAYS_OF_WEEK_LABELS[ensemble.day_of_week]}`} icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />} />
          )}
          {ensemble.start_time && (
            <InfoRow label="שעה" value={String(ensemble.start_time).slice(0, 5)} icon={<Clock className="h-4 w-4 text-muted-foreground" />} />
          )}
          {ensemble.room && (
            <InfoRow label="חדר" value={ensemble.room} icon={<MapPin className="h-4 w-4 text-muted-foreground" />} />
          )}
          {(ensemble as any).schools?.name && (
            <InfoRow label="בית ספר" value={(ensemble as any).schools.name} icon={<School className="h-4 w-4 text-muted-foreground" />} />
          )}
        </section>

        {myEnrollment && (
          <Button
            className="h-12 w-full rounded-2xl"
            onClick={() => navigate(`/teacher/students/${myEnrollment.id}`)}
          >
            לכרטיס התלמיד המלא
            <ChevronLeft className="mr-2 h-4 w-4" />
          </Button>
        )}
      </main>
    </div>
  );
};

function InfoRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {icon ?? null}
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

export default TeacherEnsembleStudentCard;
