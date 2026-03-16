import { useParams, useNavigate } from "react-router-dom";
import { useTeacherProfile, useTeacherAllEnrollments } from "@/hooks/useTeacherData";
import { useTeacherEnsembleDetail } from "@/hooks/useTeacherEnsembles";
import { ENSEMBLE_TYPE_LABELS, ENSEMBLE_STAFF_ROLE_LABELS, DAYS_OF_WEEK_LABELS } from "@/lib/ensembleConstants";
import { ArrowRight, Music, MapPin, Clock, CalendarDays, School, StickyNote, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AppLogo from "@/components/AppLogo";

const TeacherEnsembleCard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: teacher } = useTeacherProfile();
  const { data: ensemble, isLoading } = useTeacherEnsembleDetail(id);
  const { data: allEnrollments } = useTeacherAllEnrollments(teacher?.id);


  // Find the logged-in teacher's role in this ensemble
  const myStaff = (ensemble?.ensemble_staff ?? []).find(
    (s: any) => s.teacher_id === teacher?.id
  );

  if (isLoading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!ensemble) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">הרכב לא נמצא</p>
      </div>
    );
  }

  const students = (ensemble.ensemble_students ?? [])
    .map((es: any) => es.students)
    .filter(Boolean)
    .sort((a: any, b: any) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "he"));

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-5 pb-6 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-3">
            <AppLogo size="sm" />
            <h1 className="text-xl font-bold truncate">{ensemble.name}</h1>
          </div>
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate("/teacher/ensembles")}>
            <ArrowRight className="ml-1 h-4 w-4" />
            חזרה
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-4">
        {/* Ensemble Info Card */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-3">
          <div className="flex items-center gap-2">
            <Music className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">{ENSEMBLE_TYPE_LABELS[ensemble.ensemble_type] || ensemble.ensemble_type}</span>
          </div>

          {myStaff && (
            <InfoRow icon={null} label="התפקיד שלי" value={ENSEMBLE_STAFF_ROLE_LABELS[myStaff.role] || myStaff.role} />
          )}

          {ensemble.day_of_week != null && (
            <InfoRow icon={<CalendarDays className="h-4 w-4 text-muted-foreground" />} label="יום" value={`יום ${DAYS_OF_WEEK_LABELS[ensemble.day_of_week]}`} />
          )}

          {ensemble.start_time && (
            <InfoRow icon={<Clock className="h-4 w-4 text-muted-foreground" />} label="שעה" value={String(ensemble.start_time).slice(0, 5)} />
          )}

          {ensemble.room && (
            <InfoRow icon={<MapPin className="h-4 w-4 text-muted-foreground" />} label="חדר" value={ensemble.room} />
          )}

          {(ensemble as any).schools?.name && (
            <InfoRow icon={<School className="h-4 w-4 text-muted-foreground" />} label="בית ספר" value={(ensemble as any).schools.name} />
          )}

          {ensemble.notes && (
            <InfoRow icon={<StickyNote className="h-4 w-4 text-muted-foreground" />} label="הערות" value={ensemble.notes} />
          )}
        </div>

        {/* Participants */}
        <div className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
          <div className="px-5 py-3 border-b border-border">
            <h2 className="font-semibold text-foreground">משתתפים ({students.length})</h2>
          </div>
          {students.length === 0 ? (
            <div className="px-5 py-6 text-center text-muted-foreground text-sm">אין משתתפים</div>
          ) : (
            <div className="divide-y divide-border">
              {students.map((s: any) => {
                // Find any enrollment this teacher has for this student
                const enrollment = (teacherEnrollments ?? []).find((e: any) => e.student_id === s.id);
                const instrumentName = enrollment?.instruments?.name;

                return (
                  <div
                    key={s.id}
                    className={`px-4 py-2 flex items-center justify-between ${enrollment ? "cursor-pointer hover:bg-accent/50 active:bg-accent transition-colors" : ""}`}
                    onClick={() => { if (enrollment) navigate(`/teacher/students/${enrollment.id}`); }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {s.first_name} {s.last_name}
                        {instrumentName && <span className="text-muted-foreground font-normal mr-1">· {instrumentName}</span>}
                      </p>
                    </div>
                    {enrollment && <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {icon && <span className="mt-0.5">{icon}</span>}
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground font-medium">{value}</span>
    </div>
  );
}

export default TeacherEnsembleCard;
