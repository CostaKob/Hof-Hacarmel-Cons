import { useNavigate, useLocation } from "react-router-dom";
import { Home, Users, FileText, Music, School } from "lucide-react";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useTeacherEnsembleStaff } from "@/hooks/useTeacherEnsembles";
import { useTeacherSchoolMusicSchools } from "@/hooks/useTeacherSchoolMusic";
import { useAcademicYear } from "@/hooks/useAcademicYear";

const TeacherBottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: teacher } = useTeacherProfile();
  const { selectedYearId } = useAcademicYear();
  const { data: ensembleStaff } = useTeacherEnsembleStaff(teacher?.id);
  const { data: schoolMusicSchools } = useTeacherSchoolMusicSchools(teacher?.id, selectedYearId);

  const hasEnsembles = (ensembleStaff ?? []).length > 0;
  const hasSchoolMusic = (schoolMusicSchools ?? []).length > 0;

  const items = [
    { path: "/teacher", label: "ראשי", icon: Home, exact: true },
    { path: "/teacher/students", label: "תלמידים", icon: Users },
    { path: "/teacher/reports", label: "דיווחים", icon: FileText },
    ...(hasEnsembles ? [{ path: "/teacher/ensembles", label: "הרכבים", icon: Music }] : []),
    ...(hasSchoolMusic ? [{ path: "/teacher/school-music-schools", label: "מנגנים", icon: School }] : []),
  ];

  return (
    <>
      <div className="h-24 md:hidden" aria-hidden />
      <nav className="fixed bottom-3 left-3 right-3 z-30 flex rounded-full border border-border bg-card/90 px-2 py-1.5 shadow-2xl backdrop-blur-xl md:hidden safe-area-pb">
        {items.map((item) => {
          const isActive = item.exact
            ? location.pathname === item.path
            : location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition-colors ${
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </>
  );

};

export default TeacherBottomNav;
