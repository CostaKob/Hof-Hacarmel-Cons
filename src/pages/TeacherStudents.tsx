import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTeacherProfile, useTeacherAllEnrollments } from "@/hooks/useTeacherData";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Search, User, ChevronLeft } from "lucide-react";

const TeacherStudents = () => {
  const navigate = useNavigate();
  const { selectedYearId } = useAcademicYear();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { data: enrollments, isLoading: enrollmentsLoading } = useTeacherAllEnrollments(teacher?.id, selectedYearId);

  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [instrumentFilter, setInstrumentFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("active");

  const schools = useMemo(() => {
    if (!enrollments) return [];
    const unique = new Map<string, string>();
    enrollments.forEach((e) => {
      if (e.schools) unique.set(e.school_id, e.schools.name);
    });
    return Array.from(unique, ([id, name]) => ({ id, name }));
  }, [enrollments]);

  const instruments = useMemo(() => {
    if (!enrollments) return [];
    const unique = new Map<string, string>();
    enrollments.forEach((e) => {
      if (e.instruments) unique.set(e.instrument_id, e.instruments.name);
    });
    return Array.from(unique, ([id, name]) => ({ id, name }));
  }, [enrollments]);

  const filtered = useMemo(() => {
    if (!enrollments) return [];
    return enrollments
      .filter((e) => {
        const studentName = `${e.students?.first_name ?? ""} ${e.students?.last_name ?? ""}`;
        if (search && !studentName.includes(search)) return false;
        if (schoolFilter !== "all" && e.school_id !== schoolFilter) return false;
        if (instrumentFilter !== "all" && e.instrument_id !== instrumentFilter) return false;
        if (activeFilter === "active" && (!e.is_active || (e.students as any)?.student_status === "הפסיק")) return false;
        if (activeFilter === "inactive" && (e.is_active && (e.students as any)?.student_status !== "הפסיק")) return false;
        return true;
      })
      .sort((a, b) => {
        const nameA = `${a.students?.first_name ?? ""} ${a.students?.last_name ?? ""}`;
        const nameB = `${b.students?.first_name ?? ""} ${b.students?.last_name ?? ""}`;
        return nameA.localeCompare(nameB, "he");
      });
  }, [enrollments, search, schoolFilter, instrumentFilter, activeFilter]);

  const isLoading = teacherLoading || enrollmentsLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary px-5 pb-6 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => navigate("/teacher")}
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold">התלמידים שלי ({filtered.length})</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם תלמיד..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10 h-12 rounded-2xl bg-card shadow-sm border-border text-base"
          />
        </div>

        {/* Filters */}
        <div className="grid grid-cols-3 gap-3">
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger className="h-11 rounded-xl bg-card">
              <SelectValue placeholder="כל בתי הספר" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל בתי הספר</SelectItem>
              {schools.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
            <SelectTrigger className="h-11 rounded-xl bg-card">
              <SelectValue placeholder="כל הכלים" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הכלים</SelectItem>
              {instruments.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="h-11 rounded-xl bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">פעילים</SelectItem>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="inactive">לא פעילים</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Results */}
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">לא נמצאו רישומים</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((enrollment, index) => (
              <button
                key={enrollment.id}
                onClick={() => navigate(`/teacher/students/${enrollment.id}`)}
                className={`flex w-full items-center gap-3 rounded-2xl bg-card p-4 shadow-sm border text-right transition-all active:scale-[0.98] hover:shadow-md ${!enrollment.is_active || (enrollment.students as any)?.student_status === "הפסיק" ? "border-destructive/30" : "border-primary/30"}`}
              >
                <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${!enrollment.is_active || (enrollment.students as any)?.student_status === "הפסיק" ? "bg-destructive/10" : "bg-primary/10"}`}>
                  <span className={`text-sm font-bold ${!enrollment.is_active || (enrollment.students as any)?.student_status === "הפסיק" ? "text-destructive" : "text-primary"}`}>{index + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">
                    {enrollment.students?.first_name} {enrollment.students?.last_name}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                    <span>{enrollment.instruments?.name}</span>
                    <span>·</span>
                    <span>{enrollment.lesson_duration_minutes} דק׳</span>
                    <span>·</span>
                    <span>{enrollment.schools?.name}</span>
                  </div>
                </div>
                {(!enrollment.is_active || (enrollment.students as any)?.student_status === "הפסיק") && (
                  <Badge variant="outline" className="rounded-lg text-destructive border-destructive shrink-0">לא פעיל</Badge>
                )}
                <ChevronLeft className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherStudents;
