import { useParams, useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";


import { Button } from "@/components/ui/button";
import PageTitle from "@/components/PageTitle";
import BranchScheduleBoard from "@/components/schedule/BranchScheduleBoard";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useBranchCoordinatorBranches } from "@/hooks/useBranchCoordinator";
import { useAuth } from "@/hooks/useAuth";

const TeacherBranchSchedule = () => {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { data: branches = [], isLoading: branchesLoading } = useBranchCoordinatorBranches(teacher?.id);
  const branch = branches.find((b) => b.school_id === schoolId);
  const isStaff = !!user && (hasRole("admin") || hasRole("secretary") || hasRole("owner"));

  const { data: school } = useQuery({
    queryKey: ["branch-schedule-school-name", schoolId],
    enabled: !!schoolId && !branch && isStaff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name")
        .eq("id", schoolId!)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string; name: string } | null;
    },
  });

  if (teacherLoading || branchesLoading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!branch && !isStaff) {
    return (
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center bg-background p-6 text-center">
        <p className="text-muted-foreground">לא נמצאה הרשאת רכז לשלוחה זו</p>
        <Button className="mt-4" onClick={() => navigate("/teacher/branches")}>
          חזרה לרשימת השלוחות
        </Button>
      </div>
    );
  }

  const schoolName = branch?.schools?.name ?? school?.name ?? branch?.branch_name ?? "שלוחה";

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <PageTitle title={`לוח שבועי — ${schoolName}`} />
      <header className="bg-primary px-5 pb-6 pt-6 text-primary-foreground">
        <div className="flex w-full items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="shrink-0 text-primary-foreground"
            onClick={() => navigate(`/teacher/branches/${schoolId}`)}
          >
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold">לוח שבועי — {schoolName}</h1>
            <p className="text-xs text-primary-foreground/80">שיבוץ תלמידים בגרירה לפי ימים ושעות</p>
          </div>
        </div>
      </header>

      <main className="w-full -mt-3 pb-24 pt-4">
        {schoolId && <BranchScheduleBoard schoolId={schoolId} schoolName={schoolName} />}
      </main>
    </div>
  );
};

export default TeacherBranchSchedule;
