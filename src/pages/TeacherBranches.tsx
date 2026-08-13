import { useNavigate } from "react-router-dom";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { useBranchCoordinatorBranches } from "@/hooks/useBranchCoordinator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, Building2, Users, FileText, UserCircle } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { useMemo } from "react";

const BranchListItem = ({
  branch,
  counts,
}: {
  branch: any;
  counts: { students: number; teachers: number; registrations: number };
}) => {
  const navigate = useNavigate();
  const schoolId = branch.school_id;
  const schoolName = branch.schools?.name ?? branch.branch_name;

  return (
    <Card
      className="cursor-pointer transition-all hover:shadow-md active:scale-[0.98]"
      onClick={() => navigate(`/teacher/branches/${schoolId}`)}
    >
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          {schoolName}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3 w-3" />
            {counts.students} תלמידים
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <UserCircle className="h-3 w-3" />
            {counts.teachers} מורים
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <FileText className="h-3 w-3" />
            {counts.registrations} הרשמות
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

const TeacherBranches = () => {
  const navigate = useNavigate();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { selectedYearId } = useAcademicYear();
  const { data: branches = [], isLoading: branchesLoading } = useBranchCoordinatorBranches(teacher?.id);

  const schoolIds = useMemo(
    () => branches.map((b) => b.school_id).filter(Boolean) as string[],
    [branches]
  );

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["branch-coordinator-stats", teacher?.id, selectedYearId, schoolIds],
    enabled: !!teacher?.id && !!selectedYearId && schoolIds.length > 0,
    queryFn: async () => {
      const { data: enrollmentData, error: enrollmentError } = await supabase
        .from("enrollments")
        .select("school_id, student_id")
        .eq("academic_year_id", selectedYearId!)
        .eq("is_active", true)
        .in("school_id", schoolIds);
      if (enrollmentError) throw enrollmentError;

      const { data: teacherData, error: teacherError } = await supabase
        .from("enrollments")
        .select("school_id, teacher_id")
        .eq("academic_year_id", selectedYearId!)
        .eq("is_active", true)
        .in("school_id", schoolIds);
      if (teacherError) throw teacherError;

      const { data: registrationData, error: registrationError } = await supabase
        .from("registrations")
        .select("branch_school_name")
        .eq("academic_year_id", selectedYearId!);
      if (registrationError) throw registrationError;

      const studentCounts: Record<string, number> = {};
      const teacherCounts: Record<string, number> = {};
      const registrationCounts: Record<string, number> = {};

      for (const e of enrollmentData ?? []) {
        if (e.school_id) {
          const studentSet = (studentCounts as any)[e.school_id] ?? new Set<string>();
          studentSet.add(e.student_id);
          (studentCounts as any)[e.school_id] = studentSet;

          const teacherSet = (teacherCounts as any)[e.school_id] ?? new Set<string>();
          teacherSet.add(e.teacher_id);
          (teacherCounts as any)[e.school_id] = teacherSet;
        }
      }

      for (const r of registrationData ?? []) {
        const school = branches.find((b) => b.schools?.name === r.branch_school_name);
        if (school?.school_id) {
          registrationCounts[school.school_id] = (registrationCounts[school.school_id] ?? 0) + 1;
        }
      }

      const result: Record<string, { students: number; teachers: number; registrations: number }> = {};
      for (const id of schoolIds) {
        result[id] = {
          students: (studentCounts as any)[id]?.size ?? 0,
          teachers: (teacherCounts as any)[id]?.size ?? 0,
          registrations: registrationCounts[id] ?? 0,
        };
      }
      return result;
    },
  });

  const loading = teacherLoading || branchesLoading || statsLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <PageTitle title="שלוחות שלי" />
      <header className="bg-primary px-5 pb-6 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground shrink-0"
            onClick={() => navigate("/teacher")}
          >
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <h1 className="text-lg font-bold">השלוחות שלי</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-3">
        {loading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : branches.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">לא הוגדרו לך הרשאות רכז שלוחה</p>
            <p className="text-xs text-muted-foreground">פנה למנהל המערכת להגדרת שלוחה.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {branches.map((branch) => (
              <BranchListItem
                key={branch.id}
                branch={branch}
                counts={stats?.[branch.school_id!] ?? { students: 0, teachers: 0, registrations: 0 }}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherBranches;
