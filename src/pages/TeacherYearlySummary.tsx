import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useTeacherProfile, useTeacherAllEnrollments, useTeacherSchools } from "@/hooks/useTeacherData";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight } from "lucide-react";
import YearlySummaryTable, { YearlySummaryCards } from "@/components/YearlySummaryTable";
import { emptyStatusCounts, calcTotal, getExpectedLessons, type EnrollmentSummaryRow, type StatusCounts } from "@/lib/lessonCounts";
import AppLogo from "@/components/AppLogo";

function useTeacherReportLinesAll(teacherId: string | undefined) {
  return useQuery({
    queryKey: ["teacher-all-report-lines", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_lines")
        .select("enrollment_id, status, report_id, reports!inner(teacher_id)")
        .eq("reports.teacher_id", teacherId!);
      if (error) throw error;
      return data;
    },
  });
}

const TeacherYearlySummary = () => {
  const navigate = useNavigate();
  const { data: teacher, isLoading: tLoading } = useTeacherProfile();
  const { data: enrollments, isLoading: eLoading } = useTeacherAllEnrollments(teacher?.id);
  const { data: schools } = useTeacherSchools(teacher?.id);
  const { data: lines, isLoading: lLoading } = useTeacherReportLinesAll(teacher?.id);

  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("active");

  const rows = useMemo<EnrollmentSummaryRow[]>(() => {
    if (!enrollments || !lines) return [];

    // Build counts per enrollment_id
    const countsMap = new Map<string, StatusCounts>();
    for (const l of lines) {
      const c = countsMap.get(l.enrollment_id) ?? emptyStatusCounts();
      if (l.status in c) (c as any)[l.status]++;
      countsMap.set(l.enrollment_id, c);
    }

    return enrollments.map((e: any) => {
      const counts = countsMap.get(e.id) ?? emptyStatusCounts();
      return {
        enrollmentId: e.id,
        studentName: `${e.students?.first_name ?? ""} ${e.students?.last_name ?? ""}`.trim(),
        instrumentName: e.instruments?.name ?? "",
        schoolName: e.schools?.name ?? "",
        lessonDuration: e.lesson_duration_minutes,
        isActive: e.is_active,
        counts,
        totalLessons: calcTotal(counts),
      } satisfies EnrollmentSummaryRow;
    });
  }, [enrollments, lines]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (search && !r.studentName.includes(search)) return false;
      if (schoolFilter !== "all" && r.schoolName !== schoolFilter) return false;
      if (activeFilter === "active" && !r.isActive) return false;
      if (activeFilter === "inactive" && r.isActive) return false;
      return true;
    });
  }, [rows, search, schoolFilter, activeFilter]);

  const schoolOptions = useMemo(() => {
    const names = new Set(rows.map((r) => r.schoolName).filter(Boolean));
    return Array.from(names).sort();
  }, [rows]);

  const isLoading = tLoading || eLoading || lLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-5 pb-6 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <Button variant="ghost" size="icon" className="text-primary-foreground hover:bg-primary-foreground/10" onClick={() => navigate("/teacher")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <AppLogo size="sm" />
          <h1 className="text-lg font-bold">סיכום שיעורים שנתי</h1>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="w-full sm:w-48 space-y-1">
            <Label className="text-xs text-muted-foreground">חיפוש תלמיד/ה</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="שם תלמיד..." className="h-10 rounded-xl bg-card" />
          </div>
          <div className="w-full sm:w-48 space-y-1">
            <Label className="text-xs text-muted-foreground">בית ספר</Label>
            <Select value={schoolFilter} onValueChange={setSchoolFilter}>
              <SelectTrigger className="h-10 rounded-xl bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                {schoolOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-40 space-y-1">
            <Label className="text-xs text-muted-foreground">סטטוס</Label>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="h-10 rounded-xl bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">פעילים</SelectItem>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="inactive">לא פעילים</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-12">טוען...</p>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block">
              <YearlySummaryTable rows={filtered} />
            </div>
            {/* Mobile */}
            <div className="md:hidden">
              <YearlySummaryCards rows={filtered} />
            </div>
          </>
        )}
      </main>
    </div>
  );
};

export default TeacherYearlySummary;
