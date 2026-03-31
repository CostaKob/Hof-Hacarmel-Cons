import { useNavigate, useParams } from "react-router-dom";
import { useTeacherSchoolMusicDetail, useTeacherSchoolMusicGroups } from "@/hooks/useTeacherSchoolMusic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Phone } from "lucide-react";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const PhoneLink = ({ phone }: { phone?: string | null }) => {
  if (!phone) return null;
  return (
    <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" dir="ltr">
      <Phone className="h-3 w-3" />
      {phone}
    </a>
  );
};

const TeacherSchoolMusicSchoolCard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: school, isLoading } = useTeacherSchoolMusicDetail(id);
  const { data: groups = [] } = useTeacherSchoolMusicGroups(id);

  const header = (
    <header className="bg-primary px-5 pb-5 pt-6 text-primary-foreground">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <Button variant="ghost" size="icon" className="text-primary-foreground shrink-0" onClick={() => navigate("/teacher/school-music-schools")}>
          <ChevronLeft className="h-5 w-5 rotate-180" />
        </Button>
        <h1 className="text-lg font-bold truncate">{school?.school_name ?? "טוען..."}</h1>
      </div>
    </header>
  );

  if (isLoading) {
    return (
      <div dir="rtl" className="min-h-screen bg-background">
        {header}
        <main className="mx-auto max-w-lg px-5 py-8">
          <p className="text-center text-muted-foreground">טוען...</p>
        </main>
      </div>
    );
  }

  if (!school) {
    return (
      <div dir="rtl" className="min-h-screen bg-background">
        {header}
        <main className="mx-auto max-w-lg px-5 py-8">
          <p className="text-center text-muted-foreground">לא נמצא</p>
        </main>
      </div>
    );
  }

  const coordinator = (school as any).coordinator;
  const conductor = (school as any).conductor;
  const classesCount = (school as any).classes_count || 0;
  const dayOfWeek = (school as any).day_of_week;
  const classSchedules: { start_time: string; end_time: string }[] = (school as any).class_schedules || [];
  const homeroomTeachers: { name: string; phone: string }[] = (school as any).homeroom_teachers || [];

  const starts = classSchedules.map((s) => s.start_time).filter(Boolean).sort();
  const ends = classSchedules.map((s) => s.end_time).filter(Boolean).sort().reverse();
  const timeRange = starts.length > 0 && ends.length > 0 ? `${starts[0]}–${ends[0]}` : null;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      {header}

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-4">
        {/* A. School Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">פרטי בית הספר</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2"><span className="text-muted-foreground">שם:</span><span>{school.school_name}</span></div>
            <div className="flex gap-2"><span className="text-muted-foreground">שנה:</span><span>{(school as any).academic_years?.name || "—"}</span></div>
            {classesCount > 0 && <div className="flex gap-2"><span className="text-muted-foreground">כיתות בשכבה:</span><span>{classesCount}</span></div>}
            {dayOfWeek != null && <div className="flex gap-2"><span className="text-muted-foreground">יום:</span><span>יום {DAY_NAMES[dayOfWeek]}</span></div>}
            {timeRange && <div className="flex gap-2"><span className="text-muted-foreground">שעות:</span><span dir="ltr">{timeRange}</span></div>}
          </CardContent>
        </Card>

        {/* B. Class Schedule */}
        {classSchedules.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">שעות שיעורים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {classSchedules.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border p-2.5 text-sm">
                    <span className="font-medium text-muted-foreground">כיתה {i + 1}</span>
                    <span dir="ltr">{s.start_time || "—"} – {s.end_time || "—"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* C. Homeroom Teachers */}
        {homeroomTeachers.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">מחנכות כיתות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {homeroomTeachers.map((ht, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-muted-foreground">כיתה {i + 1}:</span>
                      <span className="font-medium">{ht.name || "—"}</span>
                    </div>
                    <PhoneLink phone={ht.phone} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* D. Coordinator & Conductor */}
        {(coordinator || conductor) && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">בעלי תפקידים</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {coordinator && (
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">רכז</p>
                    <p className="font-medium text-sm">{coordinator.first_name} {coordinator.last_name}</p>
                  </div>
                  <PhoneLink phone={coordinator.phone} />
                </div>
              )}
              {conductor && (
                <div className="flex items-center justify-between rounded-xl border p-3">
                  <div>
                    <p className="text-xs text-muted-foreground">מנצח</p>
                    <p className="font-medium text-sm">{conductor.first_name} {conductor.last_name}</p>
                  </div>
                  <PhoneLink phone={conductor.phone} />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* E. All Teachers */}
        {(() => {
          const teacherMap = new Map<string, { name: string; phone?: string | null; roles: string[] }>();
          // Add coordinator
          if (coordinator) {
            const key = coordinator.id;
            const entry = teacherMap.get(key) || { name: `${coordinator.first_name} ${coordinator.last_name}`, phone: coordinator.phone, roles: [] };
            entry.roles.push("רכז");
            teacherMap.set(key, entry);
          }
          // Add conductor
          if (conductor) {
            const key = conductor.id;
            const entry = teacherMap.get(key) || { name: `${conductor.first_name} ${conductor.last_name}`, phone: conductor.phone, roles: [] };
            entry.roles.push("מנצח");
            teacherMap.set(key, entry);
          }
          // Add group teachers
          groups.forEach((g: any) => {
            if (g.teachers) {
              const key = g.teacher_id;
              const entry = teacherMap.get(key) || { name: `${g.teachers.first_name} ${g.teachers.last_name}`, phone: g.teachers.phone, roles: [] };
              const role = g.instruments?.name ? `מורה ל${g.instruments.name}` : "מורה לקבוצה";
              if (!entry.roles.includes(role)) entry.roles.push(role);
              teacherMap.set(key, entry);
            }
          });
          const allTeachers = Array.from(teacherMap.values());
          if (allTeachers.length === 0) return null;
          return (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">צוות מורים ({allTeachers.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2">
                  {allTeachers.map((t, i) => (
                    <div key={i} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                      <div>
                        <p className="font-medium">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.roles.join(" · ")}</p>
                      </div>
                      <PhoneLink phone={t.phone} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* F. Groups */}
        {groups.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">קבוצות ({groups.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {groups.map((g: any) => (
                  <div key={g.id} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{g.instruments?.name}</span>
                      <span className="text-muted-foreground">— {g.teachers?.first_name} {g.teachers?.last_name}</span>
                    </div>
                    <PhoneLink phone={g.teachers?.phone} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default TeacherSchoolMusicSchoolCard;
