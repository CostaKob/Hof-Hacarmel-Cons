import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, ChevronLeft, ChevronDown, ChevronUp, CheckCircle2, XCircle, Search, Users, Pencil, Save, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { useListStatePreservation, usePersistedState } from "@/hooks/useListStatePreservation";
const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const getDayName = (school: any) => {
  return school.day_of_week != null ? `יום ${DAY_NAMES[school.day_of_week]}` : null;
};

const ALL = "__all__";

const GENDER_LABELS: Record<string, string> = { male: "זכר", female: "נקבה", other: "אחר" };
const STATUS_LABELS: Record<string, string> = { new: "חדש", in_review: "בטיפול", assigned: "שויך", inactive: "לא פעיל" };

const DetailRow = ({ label, value, dir: fieldDir }: { label: string; value?: string | null; dir?: string }) => (
  <div className="flex gap-2 text-sm py-0.5">
    <span className="text-muted-foreground shrink-0">{label}:</span>
    <span className="text-foreground font-medium" dir={fieldDir}>{value || "—"}</span>
  </div>
);

const AdminSchoolMusicSchools = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("schools");

  // ── Students tab state ──
  const [search, setSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState(ALL);
  const [filterClass, setFilterClass] = useState(ALL);
  const [filterTeacher, setFilterTeacher] = useState(ALL);
  const [filterInstrument, setFilterInstrument] = useState(ALL);
  const [filterCity, setFilterCity] = useState(ALL);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addForm, setAddForm] = useState<Record<string, any>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const { activeYear } = useAcademicYear();
  const { selectedYearId, years } = useAcademicYear();
  const selectedYear = years.find((y) => y.id === selectedYearId);

  // ── Schools data ──
  const { data: schools = [], isLoading } = useQuery({
    queryKey: ["school-music-schools", selectedYearId],
    queryFn: async () => {
      let q = supabase
        .from("school_music_schools")
        .select("*, academic_years(name)")
        .order("school_name");
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: classCounts = {} } = useQuery({
    queryKey: ["school-music-classes-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_classes" as any)
        .select("school_music_school_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data as any[]).forEach((g: any) => {
        counts[g.school_music_school_id] = (counts[g.school_music_school_id] || 0) + 1;
      });
      return counts;
    },
  });

  // ── Students data ──
  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["school-music-students-all", selectedYearId],
    queryFn: async () => {
      let q = supabase
        .from("school_music_students")
        .select("*, school_music_schools(id, school_name), instruments(id, name)")
        .order("student_last_name");
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: groups = [] } = useQuery({
    queryKey: ["school-music-groups-with-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_groups")
        .select("school_music_school_id, instrument_id, teacher_id, teachers(first_name, last_name)");
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Class groups for edit filtering ──
  const { data: allClassGroups = [] } = useQuery({
    queryKey: ["school-music-class-groups-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_class_groups" as any)
        .select("id, school_music_class_id, instrument_id, teacher_id, instruments(name), teachers(first_name, last_name)");
      if (error) throw error;
      return data as any[] ?? [];
    },
  });

  // ── Classes for edit filtering ──
  const { data: allClasses = [] } = useQuery({
    queryKey: ["school-music-classes-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_classes" as any)
        .select("id, class_name, school_music_school_id");
      if (error) throw error;
      return data as any[] ?? [];
    },
  });

  const { data: allInstruments = [] } = useQuery({
    queryKey: ["all-instruments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  // ── Update mutation ──
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, any> }) => {
      const { error } = await supabase.from("school_music_students").update(data as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-music-students-all"] });
      toast.success("הפרטים עודכנו בהצלחה");
      setEditingId(null);
    },
    onError: () => toast.error("שגיאה בעדכון הפרטים"),
  });

  // ── Create mutation ──
  const createMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const { error } = await supabase.from("school_music_students").insert(data as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-music-students-all"] });
      toast.success("התלמיד נוסף בהצלחה");
      setAddDialogOpen(false);
      setAddForm({});
    },
    onError: () => toast.error("שגיאה בהוספת התלמיד"),
  });

  // ── Delete mutation ──
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("school_music_students").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-music-students-all"] });
      toast.success("התלמיד נמחק בהצלחה");
      setExpandedId(null);
      setDeleteId(null);
    },
    onError: () => toast.error("שגיאה במחיקת התלמיד"),
  });

  const openAddDialog = () => {
    setAddForm({
      student_first_name: "",
      student_last_name: "",
      student_national_id: "",
      gender: "",
      class_name: "",
      city: "",
      parent_name: "",
      parent_national_id: "",
      parent_phone: "",
      parent_email: "",
      school_music_school_id: "",
      instrument_id: "",
      instrument_serial_number: "",
      status: "new",
      academic_year_id: activeYear?.id || null,
    });
    setAddDialogOpen(true);
  };

  const submitAdd = () => {
    if (!addForm.student_first_name || !addForm.student_last_name || !addForm.student_national_id || !addForm.school_music_school_id || !addForm.class_name || !addForm.parent_name || !addForm.parent_national_id || !addForm.parent_phone || !addForm.parent_email) {
      toast.error("יש למלא את כל שדות החובה");
      return;
    }
    const payload = { ...addForm };
    if (!payload.instrument_id) delete payload.instrument_id;
    if (!payload.gender) delete payload.gender;
    createMutation.mutate(payload);
  };
  // ── Derive filter options ──
  const filterOptions = useMemo(() => {
    const schoolSet = new Map<string, string>();
    const classSet = new Set<string>();
    const teacherSet = new Map<string, string>();
    const instrumentSet = new Map<string, string>();
    const citySet = new Set<string>();

    students.forEach((s: any) => {
      if (s.school_music_schools) schoolSet.set(s.school_music_schools.id, s.school_music_schools.school_name);
      if (s.class_name) classSet.add(s.class_name);
      if (s.instruments) instrumentSet.set(s.instruments.id, s.instruments.name);
      if (s.city) citySet.add(s.city);
    });

    groups.forEach((g: any) => {
      if (g.teachers && g.teacher_id) {
        teacherSet.set(g.teacher_id, `${g.teachers.first_name} ${g.teachers.last_name}`);
      }
    });

    return {
      schools: Array.from(schoolSet.entries()).sort((a, b) => a[1].localeCompare(b[1], "he")),
      classes: Array.from(classSet).sort((a, b) => a.localeCompare(b, "he")),
      teachers: Array.from(teacherSet.entries()).sort((a, b) => a[1].localeCompare(b[1], "he")),
      instruments: Array.from(instrumentSet.entries()).sort((a, b) => a[1].localeCompare(b[1], "he")),
      cities: Array.from(citySet).sort((a, b) => a.localeCompare(b, "he")),
    };
  }, [students, groups]);

  const teacherSchoolMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    groups.forEach((g: any) => {
      if (!map.has(g.teacher_id)) map.set(g.teacher_id, new Set());
      map.get(g.teacher_id)!.add(g.school_music_school_id);
    });
    return map;
  }, [groups]);

  const instrumentTeacherMap = useMemo(() => {
    const map = new Map<string, Map<string, string>>();
    groups.forEach((g: any) => {
      const key = `${g.school_music_school_id}_${g.instrument_id}`;
      if (g.teachers) {
        if (!map.has(key)) map.set(key, new Map());
        map.get(key)!.set(g.teacher_id, `${g.teachers.first_name} ${g.teachers.last_name}`);
      }
    });
    return map;
  }, [groups]);

  const getStudentTeacher = (student: any): string => {
    const key = `${student.school_music_school_id}_${student.instrument_id}`;
    const teachers = instrumentTeacherMap.get(key);
    if (!teachers || teachers.size === 0) return "—";
    return Array.from(teachers.values())[0];
  };

  const filtered = useMemo(() => {
    return students.filter((s: any) => {
      if (filterSchool !== ALL && s.school_music_school_id !== filterSchool) return false;
      if (filterClass !== ALL && s.class_name !== filterClass) return false;
      if (filterInstrument !== ALL && s.instrument_id !== filterInstrument) return false;
      if (filterCity !== ALL && (s.city || "") !== filterCity) return false;
      if (filterTeacher !== ALL) {
        const schoolsForTeacher = teacherSchoolMap.get(filterTeacher);
        if (!schoolsForTeacher || !schoolsForTeacher.has(s.school_music_school_id)) return false;
        const key = `${s.school_music_school_id}_${s.instrument_id}`;
        const teachers = instrumentTeacherMap.get(key);
        if (!teachers || !teachers.has(filterTeacher)) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const full = `${s.student_first_name} ${s.student_last_name} ${s.parent_name} ${s.student_national_id} ${s.parent_phone || ""} ${s.parent_email || ""} ${s.class_name || ""} ${s.city || ""}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [students, filterSchool, filterClass, filterTeacher, filterInstrument, filterCity, search, teacherSchoolMap, instrumentTeacherMap]);

  const startEditing = (s: any) => {
    setEditingId(s.id);
    setEditForm({
      student_first_name: s.student_first_name,
      student_last_name: s.student_last_name,
      student_national_id: s.student_national_id,
      gender: s.gender || "",
      class_name: s.class_name,
      city: s.city || "",
      parent_name: s.parent_name,
      parent_national_id: s.parent_national_id,
      parent_phone: s.parent_phone,
      parent_email: s.parent_email,
      instrument_id: s.instrument_id || "",
      instrument_serial_number: s.instrument_serial_number || "",
      status: s.status,
      school_music_class_id: s.school_music_class_id || "",
      school_music_class_group_id: s.school_music_class_group_id || "",
      school_music_school_id: s.school_music_school_id || "",
    });
  };

  // Get instruments available in a specific class
  const getClassInstruments = (classId: string) => {
    if (!classId) return [];
    const groupsForClass = allClassGroups.filter((g: any) => g.school_music_class_id === classId);
    const seen = new Set<string>();
    return groupsForClass
      .filter((g: any) => g.instruments && !seen.has(g.instrument_id) && seen.add(g.instrument_id))
      .map((g: any) => ({ id: g.instrument_id, name: g.instruments.name }))
      .sort((a: any, b: any) => a.name.localeCompare(b.name, "he"));
  };

  // Find matching group for class + instrument
  const findMatchingGroup = (classId: string, instrumentId: string) => {
    if (!classId || !instrumentId) return null;
    return allClassGroups.find((g: any) => g.school_music_class_id === classId && g.instrument_id === instrumentId) || null;
  };

  // Get classes for a school
  const getSchoolClasses = (schoolId: string) => {
    if (!schoolId) return [];
    return allClasses.filter((c: any) => c.school_music_school_id === schoolId);
  };

  const saveEdit = (studentId: string) => {
    // Auto-assign group based on class + instrument
    const matchingGroup = findMatchingGroup(editForm.school_music_class_id, editForm.instrument_id);
    const payload = {
      ...editForm,
      school_music_class_group_id: matchingGroup?.id || null,
    };
    updateMutation.mutate({ id: studentId, data: payload });
  };

  const EditField = ({ label, field, type = "text", dir }: { label: string; field: string; type?: string; dir?: string }) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        value={editForm[field] || ""}
        onChange={(e) => setEditForm((p: any) => ({ ...p, [field]: e.target.value }))}
        type={type}
        dir={dir}
        className="h-9"
      />
    </div>
  );

  return (
    <AdminLayout title="בתי ספר מנגנים" backPath="/admin">
      <Tabs dir="rtl" value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="schools" className="flex-1">בתי ספר</TabsTrigger>
            <TabsTrigger value="students" className="flex-1">
            <Users className="h-4 w-4 ml-1.5" />
            תלמידי בית ספר מנגן
          </TabsTrigger>
        </TabsList>

        {/* ── Schools Tab ── */}
        <TabsContent value="schools">
          <div className="mb-4 flex justify-start">
            <Button className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/school-music-schools/new")}>
              <Plus className="h-4 w-4" /> צור בית ספר חדש
            </Button>
          </div>

          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">טוען...</p>
          ) : schools.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {selectedYear ? `אין נתונים לשנת ${selectedYear.name}` : "לא נמצאו בתי ספר מנגנים"}
            </p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-2">{schools.length} בתי ספר</p>
              <div className="space-y-2">
                {schools.map((s: any, index: number) => (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/admin/school-music-schools/${s.id}`)}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">{index + 1}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground truncate">{s.school_name}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
                          <span>{(s as any).academic_years?.name || "—"}</span>
                          <span>{classCounts[s.id] || 0} כיתות</span>
                          {getDayName(s) && <span>{getDayName(s)}</span>}
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1">
                            רכז: {s.coordinator_teacher_id ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/50" />}
                          </span>
                          <span className="flex items-center gap-1">
                            מנצח: {s.conductor_teacher_id ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/50" />}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={s.is_active ? "default" : "secondary"} className="rounded-lg">
                        {s.is_active ? "פעיל" : "לא פעיל"}
                      </Badge>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Students Tab ── */}
        <TabsContent value="students">
          {/* Search + Add button */}
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי שם, ת.ז, הורה..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9 h-12 rounded-xl"
              />
            </div>
            <Button className="h-12 rounded-xl text-base" onClick={openAddDialog}>
              <Plus className="h-4 w-4" />
              תלמיד חדש
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            <Select value={filterSchool} onValueChange={setFilterSchool}>
              <SelectTrigger className="w-40 h-11 rounded-xl"><SelectValue placeholder="בית ספר" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>בית ספר</SelectItem>
                {filterOptions.schools.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="w-32 h-11 rounded-xl"><SelectValue placeholder="כיתה" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>כיתה</SelectItem>
                {filterOptions.classes.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterTeacher} onValueChange={setFilterTeacher}>
              <SelectTrigger className="w-40 h-11 rounded-xl"><SelectValue placeholder="מורה" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>מורה</SelectItem>
                {filterOptions.teachers.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterInstrument} onValueChange={setFilterInstrument}>
              <SelectTrigger className="w-36 h-11 rounded-xl"><SelectValue placeholder="כלי נגינה" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>כלי נגינה</SelectItem>
                {filterOptions.instruments.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterCity} onValueChange={setFilterCity}>
              <SelectTrigger className="w-36 h-11 rounded-xl"><SelectValue placeholder="ישוב" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>ישוב</SelectItem>
                {filterOptions.cities.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Students list */}
          {studentsLoading ? (
            <p className="text-center text-muted-foreground py-8">טוען...</p>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">לא נמצאו תלמידים</p>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-2">{filtered.length} תלמידים</p>
              <div className="space-y-2">
                {filtered.map((s: any, index: number) => {
                  const isExpanded = expandedId === s.id;
                  const isEditing = editingId === s.id;

                  return (
                    <div
                      key={s.id}
                      className="rounded-xl border border-border bg-card shadow-sm overflow-hidden transition-all"
                    >
                      {/* Summary row - matching AdminStudents style */}
                      <button
                        type="button"
                        className="w-full p-4 flex items-center justify-between hover:bg-muted/30 transition-colors touch-manipulation"
                        onClick={() => {
                          setExpandedId(isExpanded ? null : s.id);
                          if (isEditing && !isExpanded) setEditingId(null);
                        }}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">{index + 1}</span>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground text-right">
                              {s.student_first_name} {s.student_last_name}
                            </p>
                            <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                              <span>{s.school_music_schools?.school_name || "—"}</span>
                              <span>·</span>
                              <span>{s.class_name}</span>
                              <span>·</span>
                              <span>{s.instruments?.name || "—"}</span>
                              <span>·</span>
                              <span>{getStudentTeacher(s)}</span>
                              {s.city && (
                                <>
                                  <span>·</span>
                                  <span>{s.city}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mr-3 shrink-0">
                          <Badge
                            variant={s.status === "assigned" ? "default" : "outline"}
                            className={`rounded-lg text-xs ${s.status === "inactive" ? "text-destructive border-destructive" : ""}`}
                          >
                            {STATUS_LABELS[s.status] || s.status}
                          </Badge>
                          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {/* Expanded details */}
                      {isExpanded && (
                        <div className="border-t border-border px-4 pb-4 pt-3">
                          {!isEditing ? (
                            <>
                              <div className="flex justify-between items-center mb-3">
                                <h4 className="text-sm font-semibold text-foreground">פרטים מלאים</h4>
                                <div className="flex gap-2">
                                   <Button
                                     variant="outline"
                                     size="icon"
                                     className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                                     onClick={(e) => { e.stopPropagation(); setDeleteId(s.id); }}
                                   >
                                     <Trash2 className="h-3.5 w-3.5" />
                                   </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 rounded-lg"
                                    onClick={(e) => { e.stopPropagation(); startEditing(s); }}
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                    עריכה
                                  </Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground mb-1 mt-1">פרטי תלמיד</p>
                                  <DetailRow label="שם פרטי" value={s.student_first_name} />
                                  <DetailRow label="שם משפחה" value={s.student_last_name} />
                                  <DetailRow label="ת.ז תלמיד" value={s.student_national_id} />
                                  <DetailRow label="מגדר" value={GENDER_LABELS[s.gender] || s.gender} />
                                  <DetailRow label="כיתה" value={s.class_name} />
                                  <DetailRow label="ישוב" value={s.city} />
                                </div>
                                <div>
                                  <p className="text-xs font-semibold text-muted-foreground mb-1 mt-1">פרטי הורה</p>
                                  <DetailRow label="שם הורה" value={s.parent_name} />
                                  <DetailRow label="ת.ז הורה" value={s.parent_national_id} />
                                  <DetailRow label="טלפון" value={s.parent_phone} dir="ltr" />
                                  <DetailRow label='דוא"ל' value={s.parent_email} dir="ltr" />
                                </div>
                              </div>
                              <div className="mt-2">
                                <p className="text-xs font-semibold text-muted-foreground mb-1 mt-1">כלי נגינה</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
                                  <DetailRow label="כלי" value={s.instruments?.name} />
                                  <DetailRow label="מספר סידורי" value={s.instrument_serial_number} />
                                  <DetailRow label="מורה" value={getStudentTeacher(s)} />
                                  <DetailRow label="בית ספר" value={s.school_music_schools?.school_name} />
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div className="flex justify-between items-center mb-3">
                                <h4 className="text-sm font-semibold text-foreground">עריכת פרטים</h4>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-8 gap-1.5 rounded-lg"
                                    onClick={() => setEditingId(null)}
                                  >
                                    <X className="h-3.5 w-3.5" />
                                    ביטול
                                  </Button>
                                  <Button
                                    size="sm"
                                    className="h-8 gap-1.5 rounded-lg"
                                    disabled={updateMutation.isPending}
                                    onClick={() => saveEdit(s.id)}
                                  >
                                    <Save className="h-3.5 w-3.5" />
                                    שמור
                                  </Button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                                <div className="space-y-3">
                                  <p className="text-xs font-semibold text-muted-foreground">פרטי תלמיד</p>
                                  <EditField label="שם פרטי" field="student_first_name" />
                                  <EditField label="שם משפחה" field="student_last_name" />
                                  <EditField label="ת.ז תלמיד" field="student_national_id" />
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">מגדר</Label>
                                    <Select value={editForm.gender} onValueChange={(v) => setEditForm((p: any) => ({ ...p, gender: v }))}>
                                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="male">זכר</SelectItem>
                                        <SelectItem value="female">נקבה</SelectItem>
                                        <SelectItem value="other">אחר</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <EditField label="כיתה" field="class_name" />
                                  <EditField label="ישוב" field="city" />
                                </div>
                                <div className="space-y-3">
                                  <p className="text-xs font-semibold text-muted-foreground">פרטי הורה</p>
                                  <EditField label="שם הורה" field="parent_name" />
                                  <EditField label="ת.ז הורה" field="parent_national_id" />
                                  <EditField label="טלפון" field="parent_phone" type="tel" dir="ltr" />
                                  <EditField label='דוא"ל' field="parent_email" type="email" dir="ltr" />
                                </div>
                              </div>

                              <div className="mt-3 space-y-3">
                                <p className="text-xs font-semibold text-muted-foreground">כלי נגינה ושיוך</p>
                                {/* Class selector (filtered by school) */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">כיתה</Label>
                                    <Select
                                      value={editForm.school_music_class_id || ""}
                                      onValueChange={(v) => setEditForm((p: any) => ({ ...p, school_music_class_id: v, instrument_id: "" }))}
                                    >
                                      <SelectTrigger className="h-9"><SelectValue placeholder="בחר כיתה" /></SelectTrigger>
                                      <SelectContent>
                                        {getSchoolClasses(editForm.school_music_school_id).map((c: any) => (
                                          <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">כלי נגינה</Label>
                                    <Select
                                      value={editForm.instrument_id || ""}
                                      onValueChange={(v) => setEditForm((p: any) => ({ ...p, instrument_id: v }))}
                                      disabled={!editForm.school_music_class_id}
                                    >
                                      <SelectTrigger className="h-9">
                                        <SelectValue placeholder={editForm.school_music_class_id ? "בחר כלי" : "בחר קודם כיתה"} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {getClassInstruments(editForm.school_music_class_id).map((i: any) => (
                                          <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </div>
                                {/* Show assigned group */}
                                {editForm.school_music_class_id && editForm.instrument_id && (() => {
                                  const mg = findMatchingGroup(editForm.school_music_class_id, editForm.instrument_id);
                                  if (!mg) return <p className="text-xs text-destructive">לא נמצאה קבוצה מתאימה לכיתה וכלי שנבחרו</p>;
                                  return (
                                    <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2 text-sm">
                                      <span className="text-muted-foreground">קבוצה:</span>
                                      <span className="font-medium">{mg.instruments?.name} – {mg.teachers?.first_name} {mg.teachers?.last_name}</span>
                                    </div>
                                  );
                                })()}
                                <EditField label="מספר סידורי" field="instrument_serial_number" />
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">סטטוס</Label>
                                  <Select value={editForm.status} onValueChange={(v) => setEditForm((p: any) => ({ ...p, status: v }))}>
                                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="new">חדש</SelectItem>
                                      <SelectItem value="in_review">בטיפול</SelectItem>
                                      <SelectItem value="assigned">שויך</SelectItem>
                                      <SelectItem value="inactive">לא פעיל</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Add Student Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>הוספת תלמיד חדש</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">שם פרטי *</Label>
                <Input value={addForm.student_first_name || ""} onChange={(e) => setAddForm(p => ({ ...p, student_first_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">שם משפחה *</Label>
                <Input value={addForm.student_last_name || ""} onChange={(e) => setAddForm(p => ({ ...p, student_last_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">ת.ז תלמיד *</Label>
                <Input value={addForm.student_national_id || ""} onChange={(e) => setAddForm(p => ({ ...p, student_national_id: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">מגדר</Label>
                <Select value={addForm.gender || ""} onValueChange={(v) => setAddForm(p => ({ ...p, gender: v }))}>
                  <SelectTrigger><SelectValue placeholder="בחר" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">זכר</SelectItem>
                    <SelectItem value="female">נקבה</SelectItem>
                    <SelectItem value="other">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">בית ספר מנגן *</Label>
                <Select value={addForm.school_music_school_id || ""} onValueChange={(v) => setAddForm(p => ({ ...p, school_music_school_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="בחר בית ספר" /></SelectTrigger>
                  <SelectContent>
                    {schools.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.school_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">כיתה *</Label>
                <Input value={addForm.class_name || ""} onChange={(e) => setAddForm(p => ({ ...p, class_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">ישוב</Label>
                <Input value={addForm.city || ""} onChange={(e) => setAddForm(p => ({ ...p, city: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">כלי נגינה</Label>
                <Select value={addForm.instrument_id || ""} onValueChange={(v) => setAddForm(p => ({ ...p, instrument_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="בחר כלי" /></SelectTrigger>
                  <SelectContent>
                    {allInstruments.map((i: any) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs font-semibold text-muted-foreground mt-2">פרטי הורה</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">שם הורה *</Label>
                <Input value={addForm.parent_name || ""} onChange={(e) => setAddForm(p => ({ ...p, parent_name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">ת.ז הורה *</Label>
                <Input value={addForm.parent_national_id || ""} onChange={(e) => setAddForm(p => ({ ...p, parent_national_id: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">טלפון הורה *</Label>
                <Input value={addForm.parent_phone || ""} onChange={(e) => setAddForm(p => ({ ...p, parent_phone: e.target.value }))} type="tel" dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">דוא"ל הורה *</Label>
                <Input value={addForm.parent_email || ""} onChange={(e) => setAddForm(p => ({ ...p, parent_email: e.target.value }))} type="email" dir="ltr" />
              </div>
            </div>
            <div className="flex justify-start gap-2 pt-2">
              <Button onClick={submitAdd} disabled={createMutation.isPending}>
                {createMutation.isPending ? "שומר..." : "הוסף תלמיד"}
              </Button>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>ביטול</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת תלמיד</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק תלמיד זה? פעולה זו אינה ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              מחק
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminSchoolMusicSchools;
