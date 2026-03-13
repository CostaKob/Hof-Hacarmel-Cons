import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTeacherProfile, useTeacherEnrollments } from "@/hooks/useTeacherData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Search, User } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  primary: "ראשי",
  secondary: "משני",
};

const TeacherStudents = () => {
  const navigate = useNavigate();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { data: enrollments, isLoading: enrollmentsLoading } = useTeacherEnrollments(teacher?.id);

  const [search, setSearch] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [instrumentFilter, setInstrumentFilter] = useState("all");

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
    return enrollments.filter((e) => {
      const studentName = `${e.students?.first_name ?? ""} ${e.students?.last_name ?? ""}`;
      if (search && !studentName.includes(search)) return false;
      if (schoolFilter !== "all" && e.school_id !== schoolFilter) return false;
      if (instrumentFilter !== "all" && e.instrument_id !== instrumentFilter) return false;
      return true;
    });
  }, [enrollments, search, schoolFilter, instrumentFilter]);

  const isLoading = teacherLoading || enrollmentsLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/teacher")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">התלמידים שלי</h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם תלמיד..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger>
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
            <SelectTrigger>
              <SelectValue placeholder="כל הכלים" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הכלים</SelectItem>
              {instruments.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
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
            {filtered.map((enrollment) => (
              <Card key={enrollment.id} className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <p className="font-semibold text-foreground truncate">
                        {enrollment.students?.first_name} {enrollment.students?.last_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <span>{enrollment.instruments?.name}</span>
                        <span>·</span>
                        <span>{enrollment.lesson_duration_minutes} דק׳</span>
                        <span>·</span>
                        <span>{enrollment.schools?.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {ROLE_LABELS[enrollment.enrollment_role] ?? enrollment.enrollment_role}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => navigate(`/teacher/students/${enrollment.id}`)}
                  >
                    כרטיס תלמיד
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherStudents;
