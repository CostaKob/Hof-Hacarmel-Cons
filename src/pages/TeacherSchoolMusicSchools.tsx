import { useNavigate } from "react-router-dom";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useTeacherSchoolMusicSchools } from "@/hooks/useTeacherSchoolMusic";
import { ChevronLeft, School, ClipboardCheck, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhoneDisplay } from "@/components/PhoneDisplay";

const formatWhatsApp = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
};

const formatWhatsApp = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
};

const TeacherSchoolMusicSchools = () => {
  const navigate = useNavigate();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { data: schools = [], isLoading } = useTeacherSchoolMusicSchools(teacher?.id);

  const loading = teacherLoading || isLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-5 pb-5 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button variant="ghost" size="icon" className="text-primary-foreground shrink-0" onClick={() => navigate("/teacher")}>
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <h1 className="text-lg font-bold">
            בתי ספר מנגנים שלי{!loading && schools.length > 0 ? ` (${schools.length})` : ""}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-3">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : schools.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">לא נמצאו בתי ספר מנגנים</p>
        ) : (
          schools.map((s: any) => {
            const isCoordinator = s.teacherRoles.includes("רכז");
            return (
            <div key={s.id} className="rounded-2xl bg-card shadow-sm border border-border overflow-hidden">
              <button
                onClick={() => navigate(`/teacher/school-music-schools/${s.id}`)}
                className="flex w-full items-center gap-4 p-4 text-right transition-all active:scale-[0.98] hover:shadow-md"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent">
                  <School className="h-5 w-5 text-accent-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{s.school_name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.teacherRoles.map((role: string) => (
                      <Badge key={role} variant={role === "רכז" || role === "מנצח" ? "default" : "secondary"} className="text-xs">{role}</Badge>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground mt-1">
                    {s.principal_name && <span>מנהל/ת: {s.principal_name}</span>}
                    <span>{s.classCount} כיתות</span>
                  </div>
                  {s.principal_phone && (
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <PhoneDisplay phone={s.principal_phone} showIcon textClassName="text-xs" stopPropagation />
                    </div>
                  )}
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
              {isCoordinator && (
                <div className="border-t border-border grid grid-cols-2 divide-x divide-x-reverse divide-border">
                  <Button variant="ghost" className="rounded-none h-11 text-xs gap-1" onClick={() => navigate(`/teacher/school-music-schools/${s.id}/attendance/new`)}>
                    <ClipboardCheck className="h-4 w-4" /> דיווח נוכחות
                  </Button>
                  <Button variant="ghost" className="rounded-none h-11 text-xs gap-1" onClick={() => navigate(`/teacher/school-music-schools/${s.id}/attendance`)}>
                    <FileText className="h-4 w-4" /> דוח נוכחות
                  </Button>
                </div>
              )}
            </div>
            );
          })
        )}
      </main>
    </div>
  );
};

export default TeacherSchoolMusicSchools;
