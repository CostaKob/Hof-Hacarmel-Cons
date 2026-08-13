import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { useBranchCoordinatorBranches } from "@/hooks/useBranchCoordinator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import PageTitle from "@/components/PageTitle";
import {
  ChevronLeft,
  Users,
  FileText,
  UserCircle,
  ClipboardCheck,
  Search,
  GraduationCap,
} from "lucide-react";
import { isInactiveStudentStatus } from "@/lib/constants";

const statusLabel = (status?: string) => {
  switch (status) {
    case "present":
      return { label: "נכח", variant: "default" as const };
    case "absent":
      return { label: "נעדר", variant: "destructive" as const };
    case "approved_absence":
      return { label: "חיסור מאושר", variant: "secondary" as const };
    default:
      return { label: "לא דווח", variant: "outline" as const };
  }
};

const TeacherBranchCard = () => {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { selectedYearId } = useAcademicYear();
  const { data: branches = [] } = useBranchCoordinatorBranches(teacher?.id);
  const branch = branches.find((b) => b.school_id === schoolId);
  const [search, setSearch] = useState("");

  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["branch-students", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`*, students (*), instruments (name), teachers (first_name, last_name)`)
        .eq("school_id", schoolId!)
        .eq("academic_year_id", selectedYearId!)
        .eq("is_active", true)
        .returns<any[]>();
      if (error) throw error;
      return (data ?? []).filter((e) => !isInactiveStudentStatus(e.students?.student_status));
    },
  });

  const { data: registrations = [], isLoading: registrationsLoading } = useQuery({
    queryKey: ["branch-registrations", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("*")
        .eq("academic_year_id", selectedYearId!)
        .order("created_at", { ascending: false })
        .returns<any[]>();
      if (error) throw error;
      const schoolName = branch?.schools?.name;
      if (!schoolName) return [];
      return (data ?? []).filter((r) => r.branch_school_name === schoolName);
    },
  });

  const { data: teachers = [], isLoading: teachersLoading } = useQuery({
    queryKey: ["branch-teachers", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("teacher_id, teachers (id, first_name, last_name, phone, email)")
        .eq("school_id", schoolId!)
        .eq("academic_year_id", selectedYearId!)
        .eq("is_active", true)
        .returns<{ teacher_id: string; teachers: { id: string; first_name: string; last_name: string; phone: string | null; email: string | null } }[]>();
      if (error) throw error;
      const map = new Map<string, any>();
      for (const e of data ?? []) {
        if (e.teachers?.id && !map.has(e.teachers.id)) {
          map.set(e.teachers.id, e.teachers);
        }
      }
      return Array.from(map.values());
    },
  });

  const { data: attendance = [], isLoading: attendanceLoading } = useQuery({
    queryKey: ["branch-attendance", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select(`id, report_date, teacher_id, teachers (first_name, last_name), report_lines (status, notes, enrollments!inner (students (first_name, last_name)))`)
        .eq("school_id", schoolId!)
        .eq("academic_year_id", selectedYearId!)
        .order("report_date", { ascending: false })
        .limit(50)
        .returns<any[]>();
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredStudents = students.filter((e) => {
    const s = e.students;
    if (!s) return false;
    const term = search.trim();
    if (!term) return true;
    const hay = `${s.first_name} ${s.last_name} ${s.national_id ?? ""} ${s.parent_name ?? ""} ${s.city ?? ""}`;
    return hay.includes(term);
  });

  const filteredRegistrations = registrations.filter((r) => {
    const term = search.trim();
    if (!term) return true;
    const hay = `${r.student_first_name} ${r.student_last_name} ${r.student_national_id ?? ""} ${r.parent_name ?? ""} ${r.parent_phone ?? ""}`;
    return hay.includes(term);
  });

  const filteredTeachers = teachers.filter((t) => {
    const term = search.trim();
    if (!term) return true;
    const hay = `${t.first_name} ${t.last_name} ${t.phone ?? ""} ${t.email ?? ""}`;
    return hay.includes(term);
  });

  const loading = teacherLoading || !branch;

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!branch) {
    return (
      <div dir="rtl" className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">לא נמצאה הרשאת רכז לשלוחה זו</p>
        <Button className="mt-4" onClick={() => navigate("/teacher/branches")}>
          חזרה לרשימת השלוחות
        </Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <PageTitle title={branch.schools?.name ?? "שלוחה"} />
      <header className="bg-primary px-5 pb-6 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground shrink-0"
            onClick={() => navigate("/teacher/branches")}
          >
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">{branch.schools?.name ?? branch.branch_name}</h1>
            <p className="text-xs text-primary-foreground/80">חשבון רכז שלוחה</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-24">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur pt-3 pb-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש..."
              className="h-11 pr-9 rounded-xl"
            />
          </div>
        </div>

        <Tabs defaultValue="students" className="mt-2">
          <TabsList className="grid w-full grid-cols-4 h-11 rounded-xl">
            <TabsTrigger value="students" className="text-xs gap-1">
              <Users className="h-3.5 w-3.5" />
              תלמידים
            </TabsTrigger>
            <TabsTrigger value="registrations" className="text-xs gap-1">
              <FileText className="h-3.5 w-3.5" />
              הרשמות
            </TabsTrigger>
            <TabsTrigger value="teachers" className="text-xs gap-1">
              <UserCircle className="h-3.5 w-3.5" />
              מורים
            </TabsTrigger>
            <TabsTrigger value="attendance" className="text-xs gap-1">
              <ClipboardCheck className="h-3.5 w-3.5" />
              נוכחות
            </TabsTrigger>
          </TabsList>

          <TabsContent value="students" className="mt-3 space-y-3">
            {studentsLoading ? (
              <p className="text-center text-muted-foreground py-8">טוען...</p>
            ) : filteredStudents.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין תלמידים פעילים בשלוחה זו</p>
            ) : (
              filteredStudents.map((e) => {
                const s = e.students;
                return (
                  <Card key={e.id} className="overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">
                            {s?.first_name} {s?.last_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {e.instruments?.name} · {e.grade ?? "ללא כיתה"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            מורה: {e.teachers?.first_name} {e.teachers?.last_name}
                          </p>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          <GraduationCap className="h-3 w-3 ml-1" />
                          {e.grade ?? "—"}
                        </Badge>
                      </div>
                      {s?.parent_phone && (
                        <div className="mt-3">
                          <PhoneDisplay phone={s.parent_phone} showIcon size="sm" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="registrations" className="mt-3 space-y-3">
            {registrationsLoading ? (
              <p className="text-center text-muted-foreground py-8">טוען...</p>
            ) : filteredRegistrations.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין הרשמות לשלוחה זו</p>
            ) : (
              filteredRegistrations.map((r) => (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold">
                          {r.student_first_name} {r.student_last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {r.grade} · {r.requested_instruments?.join(", ") ?? "—"}
                        </p>
                      </div>
                      <Badge
                        variant={r.status === "approved" ? "default" : "outline"}
                        className="shrink-0"
                      >
                        {r.status === "approved" ? "מאושר" : "ממתין"}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground space-y-1">
                      <p>הורה: {r.parent_name}</p>
                      {r.parent_phone && <PhoneDisplay phone={r.parent_phone} showIcon size="sm" />}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="teachers" className="mt-3 space-y-3">
            {teachersLoading ? (
              <p className="text-center text-muted-foreground py-8">טוען...</p>
            ) : filteredTeachers.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין מורים פעילים בשלוחה זו</p>
            ) : (
              filteredTeachers.map((t) => (
                <Card key={t.id}>
                  <CardContent className="p-4">
                    <p className="font-semibold">
                      {t.first_name} {t.last_name}
                    </p>
                    <div className="mt-2 space-y-1">
                      {t.phone && <PhoneDisplay phone={t.phone} showIcon size="sm" />}
                      {t.email && <p className="text-xs text-muted-foreground">{t.email}</p>}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="attendance" className="mt-3 space-y-3">
            {attendanceLoading ? (
              <p className="text-center text-muted-foreground py-8">טוען...</p>
            ) : attendance.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">אין דיווחי נוכחות בשלוחה זו</p>
            ) : (
              attendance.map((report) => (
                <Card key={report.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span>דיווח מ-{new Date(report.report_date).toLocaleDateString("he-IL")}</span>
                      <span className="text-xs text-muted-foreground font-normal">
                        {report.teachers?.first_name} {report.teachers?.last_name}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-2">
                      {(report.report_lines ?? []).slice(0, 5).map((line: any, idx: number) => {
                        const student = line.enrollments?.students;
                        const st = statusLabel(line.status);
                        return (
                          <div key={idx} className="flex items-center justify-between text-sm border-b last:border-0 pb-2 last:pb-0">
                            <span className="truncate">
                              {student?.first_name} {student?.last_name}
                            </span>
                            <Badge variant={st.variant} className="text-[10px] shrink-0">
                              {st.label}
                            </Badge>
                          </div>
                        );
                      })}
                      {(report.report_lines ?? []).length > 5 && (
                        <p className="text-xs text-muted-foreground text-center">
                          +{(report.report_lines ?? []).length - 5} שורות נוספות
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default TeacherBranchCard;
