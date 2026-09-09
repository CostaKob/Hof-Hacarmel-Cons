import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StickyNote, Search, X } from "lucide-react";
import { format } from "date-fns";
import { sortHebrew } from "@/lib/sortHebrew";

interface NoteRow {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  student_id: string;
  author_user_id: string | null;
  students?: { first_name: string; last_name: string } | null;
  enrollments?: {
    teacher_id: string | null;
    school_id: string | null;
    schools?: { name: string } | null;
    instruments?: { name: string } | null;
  } | null;
}

const ALL = "all";

const AdminPedagogicalNotes = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [teacherId, setTeacherId] = useState<string>(ALL);
  const [schoolId, setSchoolId] = useState<string>(ALL);
  const [studentId, setStudentId] = useState<string>(ALL);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["pedagogical-notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_notes")
        .select(
          "id, title, content, created_at, student_id, author_user_id, students(first_name, last_name), enrollments(teacher_id, school_id, schools(name), instruments(name))"
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as NoteRow[];
    },
  });

  const { data: teachers = [] } = useQuery({
    queryKey: ["notes-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("id, user_id, first_name, last_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const teacherByUser = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    teachers.forEach((t: any) => {
      if (t.user_id) m.set(t.user_id, { id: t.id, name: `${t.first_name} ${t.last_name}` });
    });
    return m;
  }, [teachers]);

  const teacherById = useMemo(() => {
    const m = new Map<string, string>();
    teachers.forEach((t: any) => m.set(t.id, `${t.first_name} ${t.last_name}`));
    return m;
  }, [teachers]);

  /** Enriched rows */
  const rows = useMemo(() => {
    return notes.map((n) => {
      const author = n.author_user_id ? teacherByUser.get(n.author_user_id) : undefined;
      const enrollmentTeacher = n.enrollments?.teacher_id ? teacherById.get(n.enrollments.teacher_id) : undefined;
      return {
        ...n,
        authorTeacherId: author?.id ?? n.enrollments?.teacher_id ?? null,
        authorName: author?.name ?? enrollmentTeacher ?? "לא ידוע",
        studentName: n.students ? `${n.students.first_name} ${n.students.last_name}` : "—",
        schoolIdVal: n.enrollments?.school_id ?? null,
        schoolName: n.enrollments?.schools?.name ?? null,
        instrumentName: n.enrollments?.instruments?.name ?? null,
      };
    });
  }, [notes, teacherByUser, teacherById]);

  const teacherOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (r.authorTeacherId) m.set(r.authorTeacherId, r.authorName);
    });
    return [...m.entries()].sort((a, b) => sortHebrew(a[1], b[1]));
  }, [rows]);

  const schoolOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      if (r.schoolIdVal && r.schoolName) m.set(r.schoolIdVal, r.schoolName);
    });
    return [...m.entries()].sort((a, b) => sortHebrew(a[1], b[1]));
  }, [rows]);

  const studentOptions = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => m.set(r.student_id, r.studentName));
    return [...m.entries()].sort((a, b) => sortHebrew(a[1], b[1]));
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (teacherId !== ALL && r.authorTeacherId !== teacherId) return false;
      if (schoolId !== ALL && r.schoolIdVal !== schoolId) return false;
      if (studentId !== ALL && r.student_id !== studentId) return false;
      if (q) {
        const hay = `${r.studentName} ${r.authorName} ${r.title ?? ""} ${r.content} ${r.schoolName ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, search, teacherId, schoolId, studentId]);

  const teachersWithNotes = teacherOptions.length;
  const hasFilters = teacherId !== ALL || schoolId !== ALL || studentId !== ALL || search.trim() !== "";

  return (
    <AdminLayout title="הערות פדגוגיות" backPath="/admin">
      <PageTitle title="הערות פדגוגיות" />
      <div className="space-y-4">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-foreground">{rows.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">סה״כ הערות</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-foreground">{teachersWithNotes}</div>
            <div className="text-xs text-muted-foreground mt-0.5">מורים שכתבו הערות</div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-foreground">{studentOptions.length}</div>
            <div className="text-xs text-muted-foreground mt-0.5">תלמידים עם הערות</div>
          </div>
        </div>

        {/* Filters */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש בטקסט ההערה, שם תלמיד או מורה"
              className="h-12 rounded-xl pr-10"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Select value={studentId} onValueChange={setStudentId}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="כל התלמידים" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>כל התלמידים</SelectItem>
                {studentOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="כל המורים" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>כל המורים</SelectItem>
                {teacherOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="כל השלוחות" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>כל השלוחות</SelectItem>
                {schoolOptions.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="text-primary"
              onClick={() => { setSearch(""); setTeacherId(ALL); setSchoolId(ALL); setStudentId(ALL); }}
            >
              <X className="h-4 w-4 ml-1" />
              ניקוי סינון
            </Button>
          )}
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-muted-foreground text-sm">טוען...</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            <StickyNote className="h-6 w-6 mx-auto mb-2 opacity-60" />
            אין הערות להצגה
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">מוצגות {filtered.length} הערות</p>
            {filtered.map((n) => (
              <div key={n.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    className="font-semibold text-foreground hover:text-primary text-right"
                    onClick={() => navigate(`/admin/students/${n.student_id}`)}
                  >
                    {n.studentName}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}
                  </span>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <Badge variant="outline">{n.authorName}</Badge>
                  {n.instrumentName && <Badge variant="outline">{n.instrumentName}</Badge>}
                  {n.schoolName && <Badge variant="outline">{n.schoolName}</Badge>}
                </div>
                {n.title && <p className="mt-2 font-medium text-sm text-foreground">{n.title}</p>}
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">{n.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminPedagogicalNotes;
