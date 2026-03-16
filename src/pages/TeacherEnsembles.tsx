import { useNavigate } from "react-router-dom";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useTeacherEnsembleStaff } from "@/hooks/useTeacherEnsembles";
import { ENSEMBLE_TYPE_LABELS, ENSEMBLE_STAFF_ROLE_LABELS, DAYS_OF_WEEK_LABELS } from "@/lib/ensembleConstants";
import { ChevronLeft, ArrowRight, Music, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import AppLogo from "@/components/AppLogo";

const TeacherEnsembles = () => {
  const navigate = useNavigate();
  const { data: teacher, isLoading } = useTeacherProfile();
  const { data: staffEntries, isLoading: ensemblesLoading } = useTeacherEnsembleStaff(teacher?.id);

  if (isLoading || ensemblesLoading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-5 pb-6 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-3">
            <AppLogo size="sm" />
            <h1 className="text-xl font-bold">ההרכבים שלי</h1>
          </div>
          <Button variant="ghost" size="sm" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate("/teacher")}>
            <ArrowRight className="ml-1 h-4 w-4" />
            חזרה
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-3">
        {(!staffEntries || staffEntries.length === 0) ? (
          <div className="text-center py-12 text-muted-foreground">אין הרכבים משויכים</div>
        ) : (
          staffEntries.map((s: any) => {
            const e = s.ensembles;
            if (!e) return null;
            const participantCount = (e.ensemble_students || []).length;
            return (
              <button
                key={s.id}
                onClick={() => navigate(`/teacher/ensembles/${e.id}`)}
                className="flex w-full items-center gap-4 rounded-2xl bg-card p-4 shadow-sm border border-border text-right transition-all active:scale-[0.98] hover:shadow-md"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent">
                  <Music className="h-5 w-5 text-accent-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{e.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {ENSEMBLE_TYPE_LABELS[e.ensemble_type] || e.ensemble_type}
                    {" · "}
                    {ENSEMBLE_STAFF_ROLE_LABELS[s.role] || s.role}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {e.day_of_week != null && `יום ${DAYS_OF_WEEK_LABELS[e.day_of_week]}`}
                    {e.start_time && ` · ${String(e.start_time).slice(0, 5)}`}
                    {e.room && ` · חדר ${e.room}`}
                    {` · `}
                    <span className="inline-flex items-center gap-0.5">
                      <Users className="inline h-3 w-3" /> {participantCount}
                    </span>
                  </p>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            );
          })
        )}
      </main>
    </div>
  );
};

export default TeacherEnsembles;
