import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { useListStatePreservation, usePersistedState } from "@/hooks/useListStatePreservation";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ChevronLeft } from "lucide-react";
import { sortByName, sortByPerson } from "@/lib/sortHebrew";
import PageTitle from "@/components/PageTitle";

const TYPE_LABELS: Record<string, string> = { individual: "פרטני", group: "קבוצתי" };

const AdminEnrollments = () => {
  const navigate = useNavigate();
  const { selectedYearId, years } = useAcademicYear();
  const selectedYear = years.find((y) => y.id === selectedYearId);
  useListStatePreservation("/admin/enrollments");

  const [search, setSearch] = usePersistedState<string>("/admin/enrollments", "search", "");
  const [activeFilter, setActiveFilter] = usePersistedState<string>("/admin/enrollments", "active", "all");
  const [teacherFilter, setTeacherFilter] = usePersistedState<string>("/admin/enrollments", "teacher", "all");
  const [schoolFilter, setSchoolFilter] = usePersistedState<string>("/admin/enrollments", "school", "all");
  const [instrumentFilter, setInstrumentFilter] = usePersistedState<string>("/admin/enrollments", "instrument", "all");

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["admin-enrollments", selectedYearId],
    queryFn: async () => {
      let q = supabase
        .from("enrollments")
        .select("*, students(first_name, last_name, national_id, parent_name, parent_phone, parent_national_id, phone, grade, city), teachers(first_name, last_name), instruments(name), schools(name)")
        .order("created_at", { ascending: false });
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const parentNationalIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of enrollments) {
      const id = (e as any).students?.parent_national_id;
      if (id) ids.add(id);
    }
    return Array.from(ids);
  }, [enrollments]);

  const { data: familyNotes = [] } = useQuery({
    queryKey: ["admin-enrollments-family-notes", parentNationalIds, selectedYearId],
    enabled: parentNationalIds.length > 0,
    queryFn: async () => {
      let q = (supabase as any)
        .from("family_notes")
        .select("id, title, content, parent_national_id, academic_year_id, created_at")
        .in("parent_national_id", parentNationalIds)
        .order("created_at", { ascending: false });
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { id: string; title: string | null; content: string | null; parent_national_id: string; academic_year_id: string | null; created_at: string }[];
    },
  });

  const notesByParentId = useMemo(() => {
    const map = new Map<string, typeof familyNotes[0]>();
    for (const n of familyNotes) {
      if (!map.has(n.parent_national_id)) map.set(n.parent_national_id, n);
    }
    return map;
  }, [familyNotes]);

  const { data: teachers = [] } = useQuery({
    queryKey: ["admin-teachers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("id, first_name, last_name");
      if (error) throw error;
      return sortByPerson(data);
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["admin-schools-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name");
      if (error) throw error;
      return sortByName(data);
    },
  });

  const { data: instruments = [] } = useQuery({
    queryKey: ["admin-instruments-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name");
      if (error) throw error;
      return sortByName(data);
    },
  });

  const filtered = enrollments.filter((e: any) => {
    if (search) {
      const q = search.toLowerCase();
      const searchStr = `${e.students?.first_name ?? ""} ${e.students?.last_name ?? ""} ${e.teachers?.first_name ?? ""} ${e.teachers?.last_name ?? ""} ${e.students?.national_id ?? ""} ${e.students?.parent_name ?? ""} ${e.students?.parent_phone ?? ""} ${e.students?.phone ?? ""} ${e.grade ?? ""} ${e.students?.grade ?? ""} ${e.students?.city ?? ""} ${e.schools?.name ?? ""} ${e.instruments?.name ?? ""}`.toLowerCase();
      if (!searchStr.includes(q)) return false;
    }
    if (activeFilter === "active" && !e.is_active) return false;
    if (activeFilter === "inactive" && e.is_active) return false;
    if (teacherFilter !== "all" && e.teacher_id !== teacherFilter) return false;
    if (schoolFilter !== "all" && e.school_id !== schoolFilter) return false;
    if (instrumentFilter !== "all" && e.instrument_id !== instrumentFilter) return false;
    return true;
  });

  return (
    <AdminLayout title="שיוכים" backPath="/admin">
      <PageTitle title="ניהול שיוכים" />
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש: שם, ת.ז, הורה, טלפון, מורה, שלוחה, ישוב מגורים, כלי..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 h-12 rounded-xl"
            />
          </div>
          <Button className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/enrollments/new")}>
            <Plus className="h-4 w-4" />
            שיוך חדש
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-32 h-11 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="active">פעילים</SelectItem>
              <SelectItem value="inactive">לא פעילים</SelectItem>
            </SelectContent>
          </Select>
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger className="w-40 h-11 rounded-xl"><SelectValue placeholder="מורה" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל המורים</SelectItem>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger className="w-40 h-11 rounded-xl"><SelectValue placeholder="בית ספר" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל בתי הספר</SelectItem>
              {schools.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
            <SelectTrigger className="w-40 h-11 rounded-xl"><SelectValue placeholder="כלי נגינה" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הכלים</SelectItem>
              {instruments.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>


      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">
          {enrollments.length === 0 && selectedYear
            ? `אין נתונים לשנת ${selectedYear.name}`
            : "לא נמצאו שיוכים"}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((e: any) => (
            <div
              key={e.id}
              onClick={() => navigate(`/admin/enrollments/${e.id}/edit`)}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
            >
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground">
                  {e.students?.first_name} {e.students?.last_name}
                  <span className="mx-1.5 text-muted-foreground">←</span>
                  {e.teachers?.first_name} {e.teachers?.last_name}
                </p>
                <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                  <span>{e.instruments?.name}</span>
                  <span>·</span>
                  <span>{e.schools?.name}</span>
                  <span>·</span>
                  <span>{e.lesson_duration_minutes} דק׳</span>
                  <span>·</span>
                  <span>{TYPE_LABELS[e.lesson_type] ?? e.lesson_type}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 mr-3">
                <Badge variant={e.is_active ? "default" : "secondary"} className="rounded-lg">
                  {e.is_active ? "פעיל" : "לא פעיל"}
                </Badge>
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminEnrollments;
