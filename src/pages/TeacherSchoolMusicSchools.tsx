import { useNavigate } from "react-router-dom";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useTeacherSchoolMusicSchools } from "@/hooks/useTeacherSchoolMusic";
import { ChevronLeft, School } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const getTimeRange = (school: any) => {
  const schedules: { start_time: string; end_time: string }[] = school.class_schedules || [];
  if (schedules.length === 0) return null;
  const starts = schedules.map((s) => s.start_time).filter(Boolean).sort();
  const ends = schedules.map((s) => s.end_time).filter(Boolean).sort().reverse();
  if (starts.length === 0 || ends.length === 0) return null;
  return `${starts[0]}–${ends[0]}`;
};

const TeacherSchoolMusicSchools = () => {
  const navigate = useNavigate();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { data: schools = [], isLoading } = useTeacherSchoolMusicSchools(teacher?.id);

  if (teacherLoading || isLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-background">
        <header className="bg-primary px-5 pb-5 pt-6 text-primary-foreground">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <Button variant="ghost" size="icon" className="text-primary-foreground shrink-0" onClick={() => navigate("/teacher")}>
              <ChevronLeft className="h-5 w-5 rotate-180" />
            </Button>
            <h1 className="text-lg font-bold">קבוצות בית ספר מנגן שלי</h1>
          </div>
        </header>
        <main className="mx-auto max-w-lg px-5 py-8">
          <p className="text-center text-muted-foreground">טוען...</p>
        </main>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-5 pb-5 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button variant="ghost" size="icon" className="text-primary-foreground shrink-0" onClick={() => navigate("/teacher")}>
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <h1 className="text-lg font-bold">קבוצות בית ספר מנגן שלי{schools.length > 0 ? ` (${schools.length})` : ""}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-3">
        {schools.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">לא נמצאו בתי ספר מנגנים</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-1">{schools.length} בתי ספר</p>
            {schools.map((s: any) => {
              const timeRange = getTimeRange(s);
              const day = s.day_of_week != null ? `יום ${DAY_NAMES[s.day_of_week]}` : null;
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/teacher/school-music-schools/${s.id}`)}
                  className="flex w-full items-center gap-4 rounded-2xl bg-card p-4 shadow-sm border border-border text-right transition-all active:scale-[0.98] hover:shadow-md"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent">
                    <School className="h-5 w-5 text-accent-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-foreground truncate">{s.school_name}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {s.teacherRoles.map((role: string) => (
                        <Badge key={role} variant="secondary" className="text-xs">{role}</Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-1">
                      {day && <span>{day}</span>}
                      {timeRange && <span>{timeRange}</span>}
                    </div>
                  </div>
                  <ChevronLeft className="h-5 w-5 text-muted-foreground shrink-0" />
                </button>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
};

export default TeacherSchoolMusicSchools;
