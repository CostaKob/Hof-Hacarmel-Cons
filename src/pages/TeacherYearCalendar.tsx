import { Navigate } from "react-router-dom";
import AdminYearCalendar from "@/pages/admin/AdminYearCalendar";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useIsCalendarCoordinator } from "@/hooks/useCalendarAccess";
import PageTitle from "@/components/PageTitle";

/** לוח השנה השנתי לרכזים (בי״ס מנגן / שלוחות) — צפייה + בקשות שינוי לאישור מנהל. */
const TeacherYearCalendar = () => {
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { data: isCoordinator, isLoading } = useIsCalendarCoordinator(teacher?.id);

  if (teacherLoading || isLoading) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <PageTitle title="לוח שנה שנתי" />
        טוען…
      </div>
    );
  }

  if (!isCoordinator) return <Navigate to="/teacher" replace />;

  return <AdminYearCalendar mode="coordinator" />;
};

export default TeacherYearCalendar;
