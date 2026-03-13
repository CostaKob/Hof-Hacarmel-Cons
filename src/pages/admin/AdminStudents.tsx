import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Search } from "lucide-react";

const AdminStudents = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [durationFilter, setDurationFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");

  // Fetch enrollment-based rows with joins
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-students-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, lesson_duration_minutes, is_active, students(id, first_name, last_name, city, is_active), teachers(id, first_name, last_name), schools(id, name), instruments(id, name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Extract unique filter options
  const teachers = [...new Map(rows.map((r: any) => [r.teachers?.id, r.teachers]).filter(([id]: any) => id)).values()];
  const schools = [...new Map(rows.map((r: any) => [r.schools?.id, r.schools]).filter(([id]: any) => id)).values()];
  const cities = [...new Set(rows.map((r: any) => r.students?.city).filter(Boolean))].sort();
  const durations = [...new Set(rows.map((r: any) => r.lesson_duration_minutes))].sort((a, b) => a - b);

  const filtered = rows.filter((r: any) => {
    const name = `${r.students?.first_name ?? ""} ${r.students?.last_name ?? ""}`.toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (teacherFilter !== "all" && r.teachers?.id !== teacherFilter) return false;
    if (schoolFilter !== "all" && r.schools?.id !== schoolFilter) return false;
    if (durationFilter !== "all" && String(r.lesson_duration_minutes) !== durationFilter) return false;
    if (cityFilter !== "all" && r.students?.city !== cityFilter) return false;
    if (activeFilter === "active" && !r.is_active) return false;
    if (activeFilter === "inactive" && r.is_active) return false;
    return true;
  });

  return (
    <AdminLayout title="תלמידים" backPath="/admin">
      {/* Search + New */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם תלמיד..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Button onClick={() => navigate("/admin/students/new")}>
          <Plus className="h-4 w-4" />
          תלמיד חדש
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Select value={teacherFilter} onValueChange={setTeacherFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="מורה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל המורים</SelectItem>
            {(teachers as any[]).map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={schoolFilter} onValueChange={setSchoolFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="בית ספר" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל בתי הספר</SelectItem>
            {(schools as any[]).map((s: any) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={durationFilter} onValueChange={setDurationFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="משך שיעור" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל המשכים</SelectItem>
            {durations.map((d) => (
              <SelectItem key={d} value={String(d)}>{d} דק׳</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="עיר" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הערים</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c as string} value={c as string}>{c as string}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={activeFilter} onValueChange={setActiveFilter}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="active">פעילים</SelectItem>
            <SelectItem value="inactive">לא פעילים</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <p className="text-center text-muted-foreground">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground">לא נמצאו תלמידים</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">שם תלמיד</TableHead>
                <TableHead className="text-right">מורה</TableHead>
                <TableHead className="text-right">בית ספר</TableHead>
                <TableHead className="text-right">כלי נגינה</TableHead>
                <TableHead className="text-right">משך שיעור</TableHead>
                <TableHead className="text-right">עיר</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right">פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.students?.first_name} {r.students?.last_name}</TableCell>
                  <TableCell>{r.teachers?.first_name} {r.teachers?.last_name}</TableCell>
                  <TableCell>{r.schools?.name}</TableCell>
                  <TableCell>{r.instruments?.name}</TableCell>
                  <TableCell>{r.lesson_duration_minutes} דק׳</TableCell>
                  <TableCell>{r.students?.city || "—"}</TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? "default" : "secondary"}>
                      {r.is_active ? "פעיל" : "לא פעיל"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button variant="outline" size="sm" onClick={() => navigate(`/admin/students/${r.students?.id}`)}>
                      כרטיס תלמיד
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <p className="mt-2 text-sm text-muted-foreground">{filtered.length} שורות</p>
    </AdminLayout>
  );
};

export default AdminStudents;
