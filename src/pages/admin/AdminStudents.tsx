import { useState, useCallback, useMemo, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { saveListScrollPosition, useListStatePreservation } from "@/hooks/useListStatePreservation";
import AdminLayout from "@/components/admin/AdminLayout";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, FileSpreadsheet } from "lucide-react";
import StudentImportDialog from "@/components/admin/StudentImportDialog";

const AdminStudents = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [importOpen, setImportOpen] = useState(false);
  const { selectedYearId, years } = useAcademicYear();
  useListStatePreservation("/admin/students");

  useEffect(() => {
    sessionStorage.setItem("admin-students-return-url", `${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  const selectedYear = years.find((y) => y.id === selectedYearId);

  const search = searchParams.get("q") || "";
  const teacherFilter = searchParams.get("teacher") || "all";
  const schoolFilter = searchParams.get("school") || "all";
  const durationFilter = searchParams.get("duration") || "all";
  const cityFilter = searchParams.get("city") || "all";
  const statusFilter = searchParams.get("status") || "active";
  const gradeFilter = searchParams.get("grade") || "all";
  const levelFilter = searchParams.get("level") || "all";
  const paymentFilter = searchParams.get("payment") || "all";

  const setFilter = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === "") next.delete(key);
      else if (key === "status" && value === "active") next.delete(key);
      else if (key !== "status" && value === "all") next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-students-enrollments", selectedYearId],
    queryFn: async () => {
      let q = supabase
        .from("enrollments")
        .select("id, lesson_duration_minutes, is_active, academic_year_id, grade, students(id, first_name, last_name, city, is_active, grade, playing_level, student_status, national_id, parent_name, parent_phone, phone), teachers(id, first_name, last_name), schools(id, name), instruments(id, name)")
        .order("created_at", { ascending: false });
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]).sort((a: any, b: any) => {
        const nameA = `${a.students?.last_name ?? ""} ${a.students?.first_name ?? ""}`;
        const nameB = `${b.students?.last_name ?? ""} ${b.students?.first_name ?? ""}`;
        return nameA.localeCompare(nameB, "he");
      });
    },
  });

  const { data: yearPayments = [] } = useQuery({
    queryKey: ["admin-year-payments", selectedYearId],
    queryFn: async () => {
      if (!selectedYearId) return [];
      const { data, error } = await supabase
        .from("student_payments")
        .select("student_id, enrollment_id")
        .eq("academic_year_id", selectedYearId);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!selectedYearId,
  });

  const paidEnrollmentIds = useMemo(() => {
    return new Set<string>(yearPayments.map((p: any) => p.enrollment_id).filter(Boolean));
  }, [yearPayments]);

  const teachers = [...new Map(rows.map((r: any) => [r.teachers?.id, r.teachers] as [string, any]).filter(([id]) => id)).values()]
    .sort((a: any, b: any) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, "he"));
  const schools = [...new Map(rows.map((r: any) => [r.schools?.id, r.schools] as [string, any]).filter(([id]) => id)).values()]
    .sort((a: any, b: any) => (a.name ?? "").localeCompare(b.name ?? "", "he"));
  const cities = [...new Set(rows.map((r: any) => r.students?.city).filter(Boolean))].sort((a, b) => (a as string).localeCompare(b as string, "he"));
  const durations = [...new Set(rows.map((r: any) => r.lesson_duration_minutes))].sort((a, b) => a - b);

  const filtered = rows.filter((r: any) => {
    if (search) {
      const normalize = (s: string) => s.toLowerCase().replace(/['"׳״']/g, "").trim();
      const q = normalize(search);
      const searchStr = normalize(`${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""} ${r.students?.national_id ?? ""} ${r.students?.parent_name ?? ""} ${r.students?.parent_phone ?? ""} ${r.students?.phone ?? ""} ${r.grade ?? ""} ${r.students?.grade ?? ""} ${r.students?.city ?? ""} ${r.teachers?.first_name ?? ""} ${r.teachers?.last_name ?? ""} ${r.schools?.name ?? ""} ${r.instruments?.name ?? ""} ${r.students?.playing_level ?? ""} ${r.lesson_duration_minutes ?? ""}`);
      if (!searchStr.includes(q)) return false;
    }
    if (teacherFilter !== "all" && r.teachers?.id !== teacherFilter) return false;
    if (schoolFilter !== "all" && r.schools?.id !== schoolFilter) return false;
    if (durationFilter !== "all" && String(r.lesson_duration_minutes) !== durationFilter) return false;
    if (cityFilter !== "all" && r.students?.city !== cityFilter) return false;
    if (gradeFilter !== "all") {
      const stripMarks = (s: string) => (s ?? "").replace(/['"׳״']/g, "").trim();
      const rowGrade = stripMarks(r.grade ?? r.students?.grade ?? "");
      if (rowGrade !== stripMarks(gradeFilter)) return false;
    }
    if (levelFilter !== "all" && r.students?.playing_level !== levelFilter) return false;
    if (statusFilter === "active" && (!r.is_active || r.students?.student_status === "הפסיק")) return false;
    if (statusFilter === "stopped" && (r.is_active && r.students?.student_status !== "הפסיק")) return false;
    if (paymentFilter === "paid" && !paidEnrollmentIds.has(r.id)) return false;
    if (paymentFilter === "unpaid" && paidEnrollmentIds.has(r.id)) return false;
    return true;
  });

  return (
    <AdminLayout title="תלמידים" backPath="/admin">
      {/* Search + New */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש: שם, ת.ז, הורה, טלפון, מורה, שלוחה, עיר, כלי..."
            value={search}
            onChange={(e) => setFilter("q", e.target.value)}
            className="pr-9 h-12 rounded-xl"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="h-12 rounded-xl text-base" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            ייבוא מאקסל
          </Button>
          <Button className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/students/new")}>
            <Plus className="h-4 w-4" />
            תלמיד חדש
          </Button>
        </div>
      </div>

      <StudentImportDialog open={importOpen} onOpenChange={setImportOpen} />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={teacherFilter} onValueChange={(v) => setFilter("teacher", v)}>
          <SelectTrigger className="w-40 h-11 rounded-xl"><SelectValue placeholder="מורים" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">מורים</SelectItem>
            {(teachers as any[]).map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={schoolFilter} onValueChange={(v) => setFilter("school", v)}>
          <SelectTrigger className="w-40 h-11 rounded-xl"><SelectValue placeholder="בתי ספר" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">בתי ספר</SelectItem>
            {(schools as any[]).map((s: any) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={durationFilter} onValueChange={(v) => setFilter("duration", v)}>
          <SelectTrigger className="w-36 h-11 rounded-xl"><SelectValue placeholder="משך שיעור" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">משך שיעור</SelectItem>
            {durations.map((d) => (
              <SelectItem key={d} value={String(d)}>{d} דק׳</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={cityFilter} onValueChange={(v) => setFilter("city", v)}>
          <SelectTrigger className="w-36 h-11 rounded-xl"><SelectValue placeholder="עיר מגורים" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">עיר מגורים</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c as string} value={c as string}>{c as string}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setFilter("status", v)}>
          <SelectTrigger className="w-32 h-11 rounded-xl"><SelectValue placeholder="סטטוס" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">פעילים</SelectItem>
            <SelectItem value="all">סטטוס</SelectItem>
            <SelectItem value="stopped">הפסיקו</SelectItem>
          </SelectContent>
        </Select>

        <Select value={gradeFilter} onValueChange={(v) => setFilter("grade", v)}>
          <SelectTrigger className="w-32 h-11 rounded-xl"><SelectValue placeholder="כיתה" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כיתה</SelectItem>
            {["א'","ב'","ג'","ד'","ה'","ו'","ז'","ח'","ט'","י'","י\"א","י\"ב","בוגר"].map((g) => (
              <SelectItem key={g} value={g}>{g}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={levelFilter} onValueChange={(v) => setFilter("level", v)}>
          <SelectTrigger className="w-32 h-11 rounded-xl"><SelectValue placeholder="רמת לימוד" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">רמת לימוד</SelectItem>
            {["א","ב","ג"].map((l) => (
              <SelectItem key={l} value={l}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={paymentFilter} onValueChange={(v) => setFilter("payment", v)}>
          <SelectTrigger className="w-36 h-11 rounded-xl"><SelectValue placeholder="תשלומים" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">תשלומים</SelectItem>
            <SelectItem value="paid">שולם</SelectItem>
            <SelectItem value="unpaid">לא שולם</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Card-based list */}
      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {rows.length === 0 && selectedYear
            ? `אין נתונים לשנת ${selectedYear.name}`
            : "לא נמצאו תלמידים"}
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-2">{filtered.length} תלמידים</p>
          <div className="space-y-2">
            {filtered.map((r: any, index: number) => {
              const isPaid = paidEnrollmentIds.has(r.id);
              return (
                <div
                  key={r.id}
                  onClick={() => {
                    saveListScrollPosition("/admin/students");
                    navigate(`/admin/students/${r.students?.id}`, {
                      state: { returnTo: `${location.pathname}${location.search}` },
                    });
                  }}
                  className={`flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99] ${!r.students?.is_active ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">{index + 1}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground">
                        {r.students?.first_name} {r.students?.last_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                        <span>{r.instruments?.name}</span>
                        <span>·</span>
                        <span>{r.schools?.name}</span>
                        <span>·</span>
                        <span>{r.lesson_duration_minutes} דק׳</span>
                        {r.teachers && (
                          <>
                            <span>·</span>
                            <span>{r.teachers.first_name} {r.teachers.last_name}</span>
                          </>
                        )}
                        {(r.grade ?? r.students?.grade) && (
                          <>
                            <span>·</span>
                            <span className={r.students?.grade === "יב" || r.students?.grade === "בוגר" ? "font-bold text-amber-600 dark:text-amber-400" : ""}>
                              כיתה {r.students?.grade}
                            </span>
                            {r.grade && r.grade !== r.students?.grade && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400 text-amber-600 dark:text-amber-400">
                                שיוך: {r.grade}
                              </Badge>
                            )}
                          </>
                        )}
                        {r.students?.playing_level && (
                          <>
                            <span>·</span>
                            <span>רמה {r.students.playing_level}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mr-3 shrink-0">
                    <Badge
                      variant="outline"
                      className={`rounded-lg text-xs ${isPaid ? "bg-green-500/10 text-green-700 border-green-500/30" : "bg-destructive/10 text-destructive border-destructive/30"}`}
                    >
                      {isPaid ? "שולם" : "לא שולם"}
                    </Badge>
                    <Badge variant={(!r.is_active || r.students?.student_status === "הפסיק") ? "outline" : "default"} className={`rounded-lg ${(!r.is_active || r.students?.student_status === "הפסיק") ? "text-destructive border-destructive" : ""}`}>
                      {!r.is_active ? "רישום לא פעיל" : r.students?.student_status === "הפסיק" ? "הפסיק" : "פעיל"}
                    </Badge>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminStudents;
