import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { useSchoolMusicTeachers } from "@/hooks/useSchoolMusicTeachers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChevronLeft, AlertCircle } from "lucide-react";
import { format, addDays, parseISO } from "date-fns";
import PageTitle from "@/components/PageTitle";

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

const SchoolMusicAttendanceList = ({ variant = "teacher" as "teacher" | "admin" }) => {
  const { id: schoolId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeYear } = useAcademicYear();

  const today = format(new Date(), "yyyy-MM-dd");
  const monthAgo = format(addDays(new Date(), -30), "yyyy-MM-dd");

  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate, setEndDate] = useState(today);
  const [teacherFilter, setTeacherFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: school } = useQuery({
    queryKey: ["school-music-school-basic", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_schools")
        .select("id, school_name, operating_days, day_of_week")
        .eq("id", schoolId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: teachers = [] } = useSchoolMusicTeachers(schoolId);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["teacher-attendance-list", schoolId, startDate, endDate],
    enabled: !!schoolId && !!startDate && !!endDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_attendance")
        .select("id, attendance_date, status, notes, teacher_id")
        .eq("school_music_school_id", schoolId!)
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

  const operatingDays: number[] = useMemo(() => {
    const od = (school as any)?.operating_days;
    if (Array.isArray(od) && od.length > 0) return od;
    const dow = (school as any)?.day_of_week;
    return dow != null ? [dow] : [];
  }, [school]);

  // Compute "missing report" days
  const missingDays = useMemo(() => {
    if (operatingDays.length === 0) return [];
    const reportedDates = new Set(rows.map((r: any) => r.attendance_date));
    const out: string[] = [];
    const start = parseISO(startDate);
    const end = parseISO(endDate);
    const todayD = parseISO(today);
    for (let d = new Date(start); d <= end && d <= todayD; d = addDays(d, 1)) {
      if (operatingDays.includes(d.getDay())) {
        const ds = format(d, "yyyy-MM-dd");
        if (!reportedDates.has(ds)) out.push(ds);
      }
    }
    return out.sort().reverse();
  }, [operatingDays, rows, startDate, endDate, today]);

  const filtered = rows.filter((r: any) => {
    if (teacherFilter !== "all" && r.teacher_id !== teacherFilter) return false;
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    return true;
  });

  const backPath = variant === "admin"
    ? `/admin/school-music-schools/${schoolId}`
    : `/teacher/school-music-schools/${schoolId}`;
  const newPath = variant === "admin"
    ? `/admin/school-music-schools/${schoolId}/attendance/new`
    : `/teacher/school-music-schools/${schoolId}/attendance/new`;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <PageTitle title="רשימת נוכחות ביס מנגן" />
      <header className="bg-primary px-5 pb-5 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Button variant="ghost" size="icon" className="text-primary-foreground shrink-0" onClick={() => navigate(backPath)}>
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold truncate">דוח נוכחות</h1>
            <p className="text-xs text-primary-foreground/80 truncate">{school?.school_name ?? "—"}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => navigate(newPath)} className="rounded-xl">
            דיווח חדש
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 -mt-3 pb-8 space-y-4">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm grid gap-3 sm:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">מתאריך</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">עד תאריך</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-11 rounded-xl" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">מורה</Label>
            <Select value={teacherFilter} onValueChange={setTeacherFilter}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">הכל</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                ))}
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

        {missingDays.length > 0 && teacherFilter === "all" && statusFilter === "all" && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold text-amber-900">
              <AlertCircle className="h-4 w-4" />
              ימי פעילות ללא דיווח ({missingDays.length})
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {missingDays.slice(0, 30).map((d) => (
                <Badge key={d} variant="outline" className="border-amber-400 text-amber-900">{d}</Badge>
              ))}
              {missingDays.length > 30 && <span className="text-xs text-amber-800">+{missingDays.length - 30}</span>}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">תאריך</TableHead>
                <TableHead className="text-right">מורה</TableHead>
                <TableHead className="text-right">סטטוס</TableHead>
                <TableHead className="text-right">הערות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">טוען...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">אין רשומות בטווח שנבחר</TableCell></TableRow>
              ) : (
                filtered.map((r: any) => {
                  const t = teacherById[r.teacher_id];
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{r.attendance_date}</TableCell>
                      <TableCell>{t ? `${t.first_name} ${t.last_name}` : "—"}</TableCell>
                      <TableCell><Badge variant={STATUS_VARIANT(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge></TableCell>
                      <TableCell className="text-muted-foreground text-xs">{r.notes || "—"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </main>
    </div>
  );
};

export default SchoolMusicAttendanceList;
