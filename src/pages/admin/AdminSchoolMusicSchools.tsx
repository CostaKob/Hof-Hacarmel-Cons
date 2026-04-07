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
import { Plus, ChevronLeft, ChevronDown, ChevronUp, CheckCircle2, XCircle, Search, Users, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const getTimeRange = (school: any) => {
  const day = school.day_of_week != null ? `יום ${DAY_NAMES[school.day_of_week]}` : null;
  const schedules: { start_time: string; end_time: string }[] = school.class_schedules || [];
  if (schedules.length === 0) return day;
  const starts = schedules.map((s) => s.start_time).filter(Boolean);
  const ends = schedules.map((s) => s.end_time).filter(Boolean);
  if (starts.length === 0 || ends.length === 0) return day;
  const first = starts.sort()[0];
  const last = ends.sort().reverse()[0];
  const timeStr = `${first}–${last}`;
  return day ? `${day}, ${timeStr}` : timeStr;
};

const ALL = "__all__";

const GENDER_LABELS: Record<string, string> = { male: "זכר", female: "נקבה", other: "אחר" };
const STATUS_LABELS: Record<string, string> = { new: "חדש", in_review: "בטיפול", assigned: "שויך", inactive: "לא פעיל" };

const DetailRow = ({ label, value }: { label: string; value?: string | null }) => (
  <div className="flex gap-2 text-sm">
    <span className="text-muted-foreground shrink-0">{label}:</span>
    <span className="text-foreground">{value || "—"}</span>
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

  // ── Schools data ──
  const { data: schools = [], isLoading } = useQuery({
    queryKey: ["school-music-schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_schools")
        .select("*, academic_years(name)")
        .order("school_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: groupCounts = {} } = useQuery({
    queryKey: ["school-music-groups-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_groups")
        .select("school_music_school_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((g: any) => {
        counts[g.school_music_school_id] = (counts[g.school_music_school_id] || 0) + 1;
      });
      return counts;
    },
  });

  // ── Students data ──
  const { data: students = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["school-music-students-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_students")
        .select("*, school_music_schools(id, school_name), instruments(id, name)")
        .order("student_last_name");
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
      const { error } = await supabase.from("school_music_students").update(data).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-music-students-all"] });
      toast.success("הפרטים עודכנו בהצלחה");
      setEditingId(null);
    },
    onError: () => toast.error("שגיאה בעדכון הפרטים"),
  });

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
        const full = `${s.student_first_name} ${s.student_last_name} ${s.parent_name} ${s.student_national_id}`.toLowerCase();
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
    });
  };

  const saveEdit = (id: string) => {
    updateMutation.mutate({ id, data: editForm });
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
      <Tabs value={tab} onValueChange={setTab} className="w-full">
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
            <p className="text-center text-muted-foreground py-8">לא נמצאו בתי ספר מנגנים</p>
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
                          <span>{groupCounts[s.id] || 0} קבוצות</span>
                          {getTimeRange(s) && <span>{getTimeRange(s)}</span>}
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
          {/* Search */}
          <div className="relative mb-3">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם, ת.ז, הורה..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-10 h-11 rounded-xl"
            />
          </div>

          {/* Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-4">
            <Select value={filterSchool} onValueChange={setFilterSchool}>
              <SelectTrigger className="rounded-xl h-10 text-sm">
                <SelectValue placeholder="בית ספר" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>כל בתי הספר</SelectItem>
                {filterOptions.schools.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterClass} onValueChange={setFilterClass}>
              <SelectTrigger className="rounded-xl h-10 text-sm">
                <SelectValue placeholder="כיתה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>כל הכיתות</SelectItem>
                {filterOptions.classes.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterTeacher} onValueChange={setFilterTeacher}>
              <SelectTrigger className="rounded-xl h-10 text-sm">
                <SelectValue placeholder="מורה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>כל המורים</SelectItem>
                {filterOptions.teachers.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterInstrument} onValueChange={setFilterInstrument}>
              <SelectTrigger className="rounded-xl h-10 text-sm">
                <SelectValue placeholder="כלי נגינה" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>כל הכלים</SelectItem>
                {filterOptions.instruments.map(([id, name]) => (
                  <SelectItem key={id} value={id}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filterCity} onValueChange={setFilterCity}>
              <SelectTrigger className="rounded-xl h-10 text-sm">
                <SelectValue placeholder="ישוב" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>כל הישובים</SelectItem>
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
                      {/* Summary row - clickable */}
                      <button
                        type="button"
                        className="w-full p-4 text-right flex items-start gap-3 hover:bg-muted/30 transition-colors touch-manipulation"
                        onClick={() => {
                          setExpandedId(isExpanded ? null : s.id);
                          if (isEditing && !isExpanded) setEditingId(null);
                        }}
                      >
                        <span className="text-xs text-muted-foreground w-6 shrink-0 text-center pt-0.5">{index + 1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-foreground">
                            {s.student_first_name} {s.student_last_name}
                          </p>
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground mt-1">
                            <span>🏫 {s.school_music_schools?.school_name || "—"}</span>
                            <span>📚 {s.class_name}</span>
                            <span>🎵 {s.instruments?.name || "—"}</span>
                            <span>👨‍🏫 {getStudentTeacher(s)}</span>
                            {s.city && <span>📍 {s.city}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={s.status === "assigned" ? "default" : "secondary"}
                            className="rounded-lg text-xs"
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
                              {/* View mode */}
                              <div className="flex justify-between items-center mb-3">
                                <h4 className="text-sm font-semibold text-foreground">פרטים מלאים</h4>
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
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground mb-1">פרטי תלמיד</p>
                                  <DetailRow label="שם פרטי" value={s.student_first_name} />
                                  <DetailRow label="שם משפחה" value={s.student_last_name} />
                                  <DetailRow label="ת.ז תלמיד" value={s.student_national_id} />
                                  <DetailRow label="מגדר" value={GENDER_LABELS[s.gender] || s.gender} />
                                  <DetailRow label="כיתה" value={s.class_name} />
                                  <DetailRow label="ישוב" value={s.city} />
                                </div>
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground mb-1">פרטי הורה</p>
                                  <DetailRow label="שם הורה" value={s.parent_name} />
                                  <DetailRow label="ת.ז הורה" value={s.parent_national_id} />
                                  <DetailRow label="טלפון" value={s.parent_phone} />
                                  <DetailRow label='דוא"ל' value={s.parent_email} />
                                </div>
                              </div>
                              <div className="mt-3 space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground mb-1">כלי נגינה</p>
                                <DetailRow label="כלי" value={s.instruments?.name} />
                                <DetailRow label="מספר סידורי" value={s.instrument_serial_number} />
                                <DetailRow label="מורה" value={getStudentTeacher(s)} />
                                <DetailRow label="בית ספר" value={s.school_music_schools?.school_name} />
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Edit mode */}
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
                                <p className="text-xs font-semibold text-muted-foreground">כלי נגינה</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">כלי נגינה</Label>
                                    <Select value={editForm.instrument_id || ""} onValueChange={(v) => setEditForm((p: any) => ({ ...p, instrument_id: v }))}>
                                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {allInstruments.map((i: any) => (
                                          <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <EditField label="מספר סידורי" field="instrument_serial_number" />
                                </div>
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
    </AdminLayout>
  );
};

export default AdminSchoolMusicSchools;
