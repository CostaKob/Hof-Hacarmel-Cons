import AdminYearCalendar from "@/pages/admin/AdminYearCalendar";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useIsCalendarCoordinator } from "@/hooks/useCalendarAccess";
import PageTitle from "@/components/PageTitle";

/**
 * לוח השנה השנתי למורים:
 * רכזים (בי״ס מנגן / שלוחות) ומנצחים — צפייה + בקשות שינוי לאישור מנהל.
 * שאר המורים — צפייה בלבד.
 */
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

  return <AdminYearCalendar mode={isCoordinator ? "coordinator" : "viewer"} />;
};

export default TeacherYearCalendar;
