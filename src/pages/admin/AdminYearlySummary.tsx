import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import YearlySummaryTable, { YearlySummaryCards } from "@/components/YearlySummaryTable";
import { emptyStatusCounts, calcTotal, type EnrollmentSummaryRow, type StatusCounts } from "@/lib/lessonCounts";

function useAllEnrollments() {
  return useQuery({
    queryKey: ["admin-all-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, is_active, lesson_duration_minutes, student_id, teacher_id, school_id, instrument_id, students(first_name, last_name), teachers(first_name, last_name), instruments(name), schools(name)");
      if (error) throw error;
      return data;
    },
  });
}

function useAllReportLines() {
  return useQuery({
    queryKey: ["admin-all-report-lines"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_lines")
        .select("enrollment_id, status");
      if (error) throw error;
      return data;
    },
  });
}

const AdminYearlySummary = () => {
  const { data: enrollments, isLoading: eLoading } = useAllEnrollments();
  const { data: lines, isLoading: lLoading } = useAllReportLines();

  const [search, setSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("active");

  const rows = useMemo<EnrollmentSummaryRow[]>(() => {
    if (!enrollments || !lines) return [];

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
        teacherName: `${e.teachers?.first_name ?? ""} ${e.teachers?.last_name ?? ""}`.trim(),
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
    return rows
      .filter((r) => {
        if (search && !r.studentName.includes(search)) return false;
        if (teacherFilter !== "all" && r.teacherName !== teacherFilter) return false;
        if (schoolFilter !== "all" && r.schoolName !== schoolFilter) return false;
        if (activeFilter === "active" && !r.isActive) return false;
        if (activeFilter === "inactive" && r.isActive) return false;
        return true;
      })
      .sort((a, b) => a.studentName.localeCompare(b.studentName, "he"));
  }, [rows, search, teacherFilter, schoolFilter, activeFilter]);

  const teacherOptions = useMemo(() => {
    const names = new Set(rows.map((r) => r.teacherName).filter(Boolean));
    return Array.from(names).sort();
  }, [rows]);

  const schoolOptions = useMemo(() => {
    const names = new Set(rows.map((r) => r.schoolName).filter(Boolean));
    return Array.from(names).sort();
  }, [rows]);

  const isLoading = eLoading || lLoading;

  return (
    <AdminLayout title="סיכום שיעורים שנתי - כלל המערכת" backPath="/admin">
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="w-full sm:w-48 space-y-1">
            <Label className="text-xs text-muted-foreground">חיפוש תלמיד/ה</Label>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="שם תלמיד..." className="h-10 rounded-xl bg-card" />
          </div>
          <div className="w-full sm:w-48 space-y-1">
            <Label className="text-xs text-muted-foreground">מורה</Label>
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger className="h-10 rounded-xl bg-card"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                {teacherOptions.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
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
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="active">פעיל</SelectItem>
                <SelectItem value="inactive">לא פעיל</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-12">טוען...</p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-2">{filtered.length} רישומים</p>
            <div className="hidden md:block">
              <YearlySummaryTable rows={filtered} showTeacher />
            </div>
            <div className="md:hidden">
              <YearlySummaryCards rows={filtered} showTeacher />
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminYearlySummary;
