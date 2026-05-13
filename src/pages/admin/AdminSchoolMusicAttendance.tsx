import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import AdminLayout from "@/components/admin/AdminLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ClipboardEdit, Pencil } from "lucide-react";
import { toast } from "sonner";
import { format, addDays, parseISO } from "date-fns";

const STATUS_LABEL: Record<string, string> = {
  present: "הגיע/ה",
  absent: "לא הגיע/ה",
  double_lesson: "שיעור כפול",
  justified_absence: "היעדרות מוצדקת",
  unjustified_absence: "היעדרות לא מוצדקת",
  vacation: "חופשה",
};

const STATUS_VARIANT = (s: string): "default" | "secondary" | "destructive" =>
  s === "present" ? "default" : (s === "absent" || s === "unjustified_absence" ? "destructive" : "secondary");

const AdminSchoolMusicAttendance = () => {
  const { activeYear } = useAcademicYear();
  const today = format(new Date(), "yyyy-MM-dd");
  const monthAgo = format(addDays(new Date(), -30), "yyyy-MM-dd");

  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate, setEndDate] = useState(today);
  const [schoolFilter, setSchoolFilter] = useState("all");
  const [teacherFilter, setTeacherFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: schools = [] } = useQuery({
    queryKey: ["admin-attendance-schools", activeYear?.id],
    queryFn: async () => {
      let q = supabase.from("school_music_schools").select("id, school_name, operating_days, day_of_week").eq("is_active", true);
      if (activeYear?.id) q = q.eq("academic_year_id", activeYear.id);
      const { data, error } = await q.order("school_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["admin-attendance-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("id, first_name, last_name")
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const schoolIds = useMemo(() => schools.map((s) => s.id), [schools]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-attendance-rows", schoolIds.join(","), startDate, endDate],
    enabled: schoolIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_attendance")
        .select("id, school_music_school_id, teacher_id, attendance_date, status, notes")
        .in("school_music_school_id", schoolIds)
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .order("attendance_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const teacherById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const t of teachers) m[t.id] = t;
    return m;
  }, [teachers]);
  const schoolById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of schools) m[s.id] = s;
    return m;
  }, [schools]);

  const filteredRows = rows.filter((r: any) => {
    if (schoolFilter !== "all" && r.school_music_school_id !== schoolFilter) return false;
    if (teacherFilter !== "all" && r.teacher_id !== teacherFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  // Missing reports: school+date pairs where school operates that day but no rows
  const missing = useMemo(() => {
    if (statusFilter !== "all" || teacherFilter !== "all") return [];
    const todayD = parseISO(today);
    const out: { school: any; date: string }[] = [];
    const schoolsToCheck = schoolFilter === "all" ? schools : schools.filter((s) => s.id === schoolFilter);
    const reportedKey = new Set(rows.map((r: any) => `${r.school_music_school_id}::${r.attendance_date}`));
    for (const s of schoolsToCheck) {
      const od: number[] = Array.isArray((s as any).operating_days) && (s as any).operating_days.length > 0
        ? (s as any).operating_days
        : ((s as any).day_of_week != null ? [(s as any).day_of_week] : []);
      if (od.length === 0) continue;
      for (let d = parseISO(startDate); d <= parseISO(endDate) && d <= todayD; d = addDays(d, 1)) {
        if (od.includes(d.getDay())) {
          const ds = format(d, "yyyy-MM-dd");
          if (!reportedKey.has(`${s.id}::${ds}`)) out.push({ school: s, date: ds });
        }
      }
    }
    return out.sort((a, b) => b.date.localeCompare(a.date));
  }, [schools, schoolFilter, rows, startDate, endDate, today, statusFilter, teacherFilter]);

  return (
    <AdminLayout title="נוכחות מורים — בתי ספר מנגנים" backPath="/admin">
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm grid gap-3 sm:grid-cols-5">
          <div className="space-y-1">
            <Label className="text-xs">מתאריך</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">עד תאריך</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">בית ספר</Label>
            <Select value={schoolFilter} onValueChange={setSchoolFilter}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                {schools.map((s) => <SelectItem key={s.id} value={s.id}>{s.school_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">מורה</Label>
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">סטטוס</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                <SelectItem value="present">הגיע/ה</SelectItem>
                <SelectItem value="absent">לא הגיע/ה</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">תאריך</TableHead>
                <TableHead className="text-right">בית ספר</TableHead>
                <TableHead className="text-right">מורה</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right">הערות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">טוען...</TableCell></TableRow>
              ) : (
                <>
                  {missing.map((m, i) => (
                    <TableRow key={`missing-${i}`} className="bg-amber-50 hover:bg-amber-100">
                      <TableCell className="font-medium">{m.date}</TableCell>
                      <TableCell>{m.school.school_name}</TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell><Badge variant="destructive">טרם דווח</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-xs">לא הוגש דיווח ביום פעילות</TableCell>
                    </TableRow>
                  ))}
                  {filteredRows.map((r: any) => {
                    const t = teacherById[r.teacher_id];
                    const s = schoolById[r.school_music_school_id];
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.attendance_date}</TableCell>
                        <TableCell>{s?.school_name ?? "—"}</TableCell>
                        <TableCell>{t ? `${t.first_name} ${t.last_name}` : "—"}</TableCell>
                        <TableCell><Badge variant={STATUS_VARIANT(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge></TableCell>
                        <TableCell className="text-muted-foreground text-xs">{r.notes || "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  {missing.length === 0 && filteredRows.length === 0 && (
                    <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">אין נתונים בטווח שנבחר</TableCell></TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSchoolMusicAttendance;
