import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  primary: "ראשי",
  secondary: "משני",
};
const TYPE_LABELS: Record<string, string> = {
  individual: "פרטני",
  group: "קבוצתי",
};

const AdminEnrollments = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [instrumentFilter, setInstrumentFilter] = useState("all");

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["admin-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("*, students(first_name, last_name), teachers(first_name, last_name), instruments(name), schools(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["admin-teachers-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("id, first_name, last_name").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["admin-schools-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: instruments = [] } = useQuery({
    queryKey: ["admin-instruments-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = enrollments.filter((e: any) => {
    const studentName = `${e.students?.first_name ?? ""} ${e.students?.last_name ?? ""}`.toLowerCase();
    const teacherName = `${e.teachers?.first_name ?? ""} ${e.teachers?.last_name ?? ""}`.toLowerCase();
    if (search && !studentName.includes(search.toLowerCase()) && !teacherName.includes(search.toLowerCase())) return false;
    if (activeFilter === "active" && !e.is_active) return false;
    if (activeFilter === "inactive" && e.is_active) return false;
    if (teacherFilter !== "all" && e.teacher_id !== teacherFilter) return false;
    if (schoolFilter !== "all" && e.school_id !== schoolFilter) return false;
    if (instrumentFilter !== "all" && e.instrument_id !== instrumentFilter) return false;
    return true;
  });

  return (
    <AdminLayout title="שיוכים" backPath="/admin">
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם תלמיד או מורה..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <Button onClick={() => navigate("/admin/enrollments/new")}>
            <Plus className="h-4 w-4" />
            שיוך חדש
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="active">פעילים</SelectItem>
              <SelectItem value="inactive">לא פעילים</SelectItem>
            </SelectContent>
          </Select>
          <Select value={teacherFilter} onValueChange={setTeacherFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="מורה" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל המורים</SelectItem>
              {teachers.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="בית ספר" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל בתי הספר</SelectItem>
              {schools.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="כלי נגינה" /></SelectTrigger>
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
        <p className="text-center text-muted-foreground">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground">לא נמצאו שיוכים</p>
      ) : (
        <div className="space-y-2 pb-20 md:pb-0">
          {filtered.map((e: any) => (
            <Card key={e.id}>
              <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="font-medium text-foreground">
                    {e.students?.first_name} {e.students?.last_name}
                    <span className="mx-2 text-muted-foreground">←</span>
                    {e.teachers?.first_name} {e.teachers?.last_name}
                  </p>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>{e.instruments?.name}</span>
                    <span>·</span>
                    <span>{e.schools?.name}</span>
                    <span>·</span>
                    <span>{TYPE_LABELS[e.lesson_type] ?? e.lesson_type}</span>
                    <span>·</span>
                    <span>{e.lesson_duration_minutes} דק׳</span>
                    <span>·</span>
                    <span>{ROLE_LABELS[e.enrollment_role] ?? e.enrollment_role}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>מ-{e.start_date}</span>
                    {e.end_date && <span>עד {e.end_date}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={e.is_active ? "default" : "secondary"}>
                    {e.is_active ? "פעיל" : "לא פעיל"}
                  </Badge>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/enrollments/${e.id}/edit`)}>
                    עריכה
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminEnrollments;
