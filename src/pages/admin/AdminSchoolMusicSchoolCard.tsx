import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Trash2, Plus, X, Check, Phone, ChevronDown, ChevronUp, Clock, Music } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const AdminSchoolMusicSchoolCard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // UI state
  const [showDeleteSchool, setShowDeleteSchool] = useState(false);
  const [editingCoordinator, setEditingCoordinator] = useState(false);
  const [editingConductor, setEditingConductor] = useState(false);
  const [editingCoordinatorHours, setEditingCoordinatorHours] = useState(false);
  const [editingConductorHours, setEditingConductorHours] = useState(false);
  const [coordHoursInput, setCoordHoursInput] = useState("");
  const [conductHoursInput, setConductHoursInput] = useState("");

  // Class state
  const [addingClass, setAddingClass] = useState(false);
  const [newClassName, setNewClassName] = useState("");
  const [newClassGrade, setNewClassGrade] = useState("");
  const [newClassHomeroomName, setNewClassHomeroomName] = useState("");
  const [newClassHomeroomPhone, setNewClassHomeroomPhone] = useState("");
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editClassForm, setEditClassForm] = useState<any>({});
  const [deleteClassId, setDeleteClassId] = useState<string | null>(null);

  // Session state
  const [addingSessionForClassId, setAddingSessionForClassId] = useState<string | null>(null);
  const [newSessionDay, setNewSessionDay] = useState("");
  const [newSessionStart, setNewSessionStart] = useState("");
  const [newSessionEnd, setNewSessionEnd] = useState("");
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);

  // Group state
  const [addingGroupForSessionId, setAddingGroupForSessionId] = useState<string | null>(null);
  const [newGroupInstrumentId, setNewGroupInstrumentId] = useState("");
  const [newGroupTeacherId, setNewGroupTeacherId] = useState("");

  // Expanded classes
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  const toggleClass = (classId: string) => {
    setExpandedClasses(prev => {
      const next = new Set(prev);
      next.has(classId) ? next.delete(classId) : next.add(classId);
      return next;
    });
  };

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["school-music-school", id] });
    queryClient.invalidateQueries({ queryKey: ["school-music-classes", id] });
    queryClient.invalidateQueries({ queryKey: ["school-music-sessions", id] });
    queryClient.invalidateQueries({ queryKey: ["school-music-session-groups", id] });
    queryClient.invalidateQueries({ queryKey: ["school-music-schools"] });
  };

  // ── Queries ──
  const { data: school, isLoading } = useQuery({
    queryKey: ["school-music-school", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_schools")
        .select("*, academic_years(name), coordinator:teachers!school_music_schools_coordinator_teacher_id_fkey(id, first_name, last_name, phone), conductor:teachers!school_music_schools_conductor_teacher_id_fkey(id, first_name, last_name, phone)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["school-music-classes", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_classes" as any)
        .select("*")
        .eq("school_music_school_id", id!)
        .order("class_name");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["school-music-sessions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_sessions" as any)
        .select("*")
        .eq("school_music_school_id", id!)
        .order("start_time");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  const { data: sessionGroups = [] } = useQuery({
    queryKey: ["school-music-session-groups", id],
    queryFn: async () => {
      const sessionIds = sessions.map((s: any) => s.id);
      if (sessionIds.length === 0) return [];
      const { data, error } = await supabase
        .from("school_music_session_groups" as any)
        .select("*, instruments(name), teachers(first_name, last_name, phone)")
        .in("school_music_session_id", sessionIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: sessions.length > 0,
  });

  const { data: allTeachers = [] } = useQuery({
    queryKey: ["all-teachers-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("id, first_name, last_name, phone").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data;
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

  // ── Mutations ──
  const setCoordinator = useMutation({
    mutationFn: async (teacherId: string | null) => {
      const { error } = await supabase.from("school_music_schools").update({ coordinator_teacher_id: teacherId }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditingCoordinator(false); toast.success("הרכז עודכן"); },
    onError: () => toast.error("שגיאה"),
  });

  const setConductor = useMutation({
    mutationFn: async (teacherId: string | null) => {
      const { error } = await supabase.from("school_music_schools").update({ conductor_teacher_id: teacherId }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditingConductor(false); toast.success("המנצח עודכן"); },
    onError: () => toast.error("שגיאה"),
  });

  const updateRoleHours = useMutation({
    mutationFn: async ({ field, value }: { field: "coordinator_hours" | "conductor_hours"; value: number | null }) => {
      const { error } = await supabase.from("school_music_schools").update({ [field]: value } as any).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditingCoordinatorHours(false); setEditingConductorHours(false); toast.success("השעות עודכנו"); },
    onError: () => toast.error("שגיאה"),
  });

  const deleteSchool = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("school_music_schools").delete().eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-music-schools"] });
      toast.success("בית הספר נמחק");
      navigate("/admin/school-music-schools");
    },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  // Class mutations
  const addClass = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("school_music_classes" as any).insert({
        school_music_school_id: id!,
        class_name: newClassName,
        grade_level: newClassGrade || null,
        homeroom_teacher_name: newClassHomeroomName || null,
        homeroom_teacher_phone: newClassHomeroomPhone || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setAddingClass(false);
      setNewClassName(""); setNewClassGrade(""); setNewClassHomeroomName(""); setNewClassHomeroomPhone("");
      toast.success("הכיתה נוספה");
    },
    onError: () => toast.error("שגיאה"),
  });

  const updateClass = useMutation({
    mutationFn: async ({ classId, data }: { classId: string; data: any }) => {
      const { error } = await supabase.from("school_music_classes" as any).update(data).eq("id", classId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditingClassId(null); toast.success("הכיתה עודכנה"); },
    onError: () => toast.error("שגיאה"),
  });

  const deleteClass = useMutation({
    mutationFn: async (classId: string) => {
      const { error } = await supabase.from("school_music_classes" as any).delete().eq("id", classId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setDeleteClassId(null); toast.success("הכיתה נמחקה"); },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  // Session mutations
  const addSession = useMutation({
    mutationFn: async (classId: string) => {
      const { error } = await supabase.from("school_music_sessions" as any).insert({
        school_music_school_id: id!,
        school_music_class_id: classId,
        day_of_week: newSessionDay ? Number(newSessionDay) : null,
        start_time: newSessionStart || null,
        end_time: newSessionEnd || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setAddingSessionForClassId(null);
      setNewSessionDay(""); setNewSessionStart(""); setNewSessionEnd("");
      toast.success("המפגש נוסף");
    },
    onError: () => toast.error("שגיאה"),
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.from("school_music_sessions" as any).delete().eq("id", sessionId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setDeleteSessionId(null); toast.success("המפגש נמחק"); },
    onError: () => toast.error("שגיאה"),
  });

  // Group mutations
  const addGroup = useMutation({
    mutationFn: async (sessionId: string) => {
      const { error } = await supabase.from("school_music_session_groups" as any).insert({
        school_music_session_id: sessionId,
        instrument_id: newGroupInstrumentId,
        teacher_id: newGroupTeacherId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setAddingGroupForSessionId(null);
      setNewGroupInstrumentId(""); setNewGroupTeacherId("");
      toast.success("הקבוצה נוספה");
    },
    onError: () => toast.error("שגיאה"),
  });

  const removeGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from("school_music_session_groups" as any).delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("הקבוצה הוסרה"); },
    onError: () => toast.error("שגיאה"),
  });

  if (isLoading) return <AdminLayout title="טוען..." backPath="/admin/school-music-schools"><p className="text-center text-muted-foreground py-8">טוען...</p></AdminLayout>;
  if (!school) return <AdminLayout title="לא נמצא" backPath="/admin/school-music-schools"><p className="text-center text-muted-foreground py-8">לא נמצא</p></AdminLayout>;

  const coordinator = (school as any).coordinator;
  const conductor = (school as any).conductor;
  const coordinatorHours: number | null = (school as any).coordinator_hours;
  const conductorHours: number | null = (school as any).conductor_hours;
  const classesCount = classes.length;
  const effectiveCoordHours = coordinatorHours ?? classesCount;
  const effectiveConductHours = conductorHours ?? classesCount;
  const dayOfWeek = (school as any).day_of_week;

  const PhoneLink = ({ phone }: { phone?: string | null }) => {
    if (!phone) return null;
    return (
      <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" dir="ltr">
        <Phone className="h-3 w-3" />
        {phone}
      </a>
    );
  };

  const getSessionsForClass = (classId: string) => sessions.filter((s: any) => s.school_music_class_id === classId);
  const getGroupsForSession = (sessionId: string) => sessionGroups.filter((g: any) => g.school_music_session_id === sessionId);

  const RoleSection = ({ title, person, isEditing, setIsEditing, onSet, hours, effectiveHours, hoursField, isEditingHours, setIsEditingHours, hoursInput, setHoursInput }: any) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {person && !isEditing ? (
          <div className="flex items-center justify-between rounded-xl border p-3">
            <div>
              <p className="font-medium">{person.first_name} {person.last_name}</p>
              <PhoneLink phone={person.phone} />
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => setIsEditing(true)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" onClick={() => onSet(null)}><X className="h-4 w-4 text-destructive" /></Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <Select onValueChange={(v) => { onSet(v); setIsEditing(false); }}>
              <SelectTrigger className="flex-1"><SelectValue placeholder={`בחר ${title}`} /></SelectTrigger>
              <SelectContent>
                {allTeachers.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEditing && <Button variant="ghost" size="sm" onClick={() => setIsEditing(false)}>ביטול</Button>}
          </div>
        )}
        {person && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">שעות {title === "רכז" ? "ריכוז" : "ניצוח"}:</span>
            {isEditingHours ? (
              <div className="flex items-center gap-1">
                <Input type="number" min={0} className="w-20 h-7 text-xs rounded-lg text-center" value={hoursInput} onChange={(e: any) => setHoursInput(e.target.value)} placeholder={String(classesCount)} />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => updateRoleHours.mutate({ field: hoursField, value: hoursInput === "" ? null : Number(hoursInput) })}><Check className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setIsEditingHours(false)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Badge variant={hours != null ? "default" : "secondary"}>{effectiveHours}</Badge>
                {hours != null && <span className="text-xs text-muted-foreground">(ידני)</span>}
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setHoursInput(hours != null ? String(hours) : ""); setIsEditingHours(true); }}><Pencil className="h-3 w-3" /></Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AdminLayout title={school.school_name} backPath="/admin/school-music-schools">
      <div className="space-y-5">
        {/* School Details */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg">פרטי בית הספר</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl text-destructive hover:bg-destructive/10" onClick={() => setShowDeleteSchool(true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button variant="outline" className="h-11 rounded-xl" onClick={() => navigate(`/admin/school-music-schools/${id}/edit`)}>
                <Pencil className="h-4 w-4" /> עריכה
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2"><span className="text-muted-foreground">שם:</span><span>{school.school_name}</span></div>
            <div className="flex gap-2"><span className="text-muted-foreground">שנה:</span><span>{(school as any).academic_years?.name || "—"}</span></div>
            {dayOfWeek != null && <div className="flex gap-2"><span className="text-muted-foreground">יום פעילות:</span><span>{DAY_NAMES[dayOfWeek]}</span></div>}
            {school.notes && <div className="flex gap-2"><span className="text-muted-foreground">הערות:</span><span>{school.notes}</span></div>}
            <div className="flex gap-2 items-center"><span className="text-muted-foreground">סטטוס:</span><Badge variant={school.is_active ? "default" : "secondary"}>{school.is_active ? "פעיל" : "לא פעיל"}</Badge></div>
          </CardContent>
        </Card>

        {/* Coordinator */}
        <RoleSection
          title="רכז" person={coordinator} isEditing={editingCoordinator} setIsEditing={setEditingCoordinator}
          onSet={(v: string | null) => setCoordinator.mutate(v)}
          hours={coordinatorHours} effectiveHours={effectiveCoordHours} hoursField="coordinator_hours"
          isEditingHours={editingCoordinatorHours} setIsEditingHours={setEditingCoordinatorHours}
          hoursInput={coordHoursInput} setHoursInput={setCoordHoursInput}
        />

        {/* Conductor */}
        <RoleSection
          title="מנצח" person={conductor} isEditing={editingConductor} setIsEditing={setEditingConductor}
          onSet={(v: string | null) => setConductor.mutate(v)}
          hours={conductorHours} effectiveHours={effectiveConductHours} hoursField="conductor_hours"
          isEditingHours={editingConductorHours} setIsEditingHours={setEditingConductorHours}
          hoursInput={conductHoursInput} setHoursInput={setConductHoursInput}
        />

        {/* ═══ CLASSES ═══ */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg">כיתות ({classes.length})</CardTitle>
            <Button size="sm" className="h-9 rounded-xl" onClick={() => setAddingClass(true)}>
              <Plus className="h-4 w-4" /> כיתה חדשה
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Add class form */}
            {addingClass && (
              <div className="rounded-xl border border-primary/30 bg-muted/30 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">שם כיתה *</Label>
                    <Input value={newClassName} onChange={(e) => setNewClassName(e.target.value)} className="h-9 rounded-lg" placeholder="לדוגמה: ד1" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">שכבה</Label>
                    <Input value={newClassGrade} onChange={(e) => setNewClassGrade(e.target.value)} className="h-9 rounded-lg" placeholder="לדוגמה: ד" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">שם מחנכת</Label>
                    <Input value={newClassHomeroomName} onChange={(e) => setNewClassHomeroomName(e.target.value)} className="h-9 rounded-lg" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">טלפון מחנכת</Label>
                    <Input value={newClassHomeroomPhone} onChange={(e) => setNewClassHomeroomPhone(e.target.value)} className="h-9 rounded-lg" dir="ltr" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" onClick={() => setAddingClass(false)}>ביטול</Button>
                  <Button size="sm" disabled={!newClassName || addClass.isPending} onClick={() => addClass.mutate()}>הוסף</Button>
                </div>
              </div>
            )}

            {classes.length === 0 && !addingClass && (
              <p className="text-sm text-muted-foreground text-center py-4">אין כיתות עדיין. לחץ על "כיתה חדשה" להוספה.</p>
            )}

            {/* Class list */}
            {classes.map((cls: any) => {
              const isExpanded = expandedClasses.has(cls.id);
              const classSessions = getSessionsForClass(cls.id);
              const isEditingThis = editingClassId === cls.id;

              return (
                <div key={cls.id} className="rounded-xl border border-border overflow-hidden">
                  {/* Class header */}
                  <button
                    type="button"
                    className="w-full p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                    onClick={() => toggleClass(cls.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-semibold text-sm">{cls.class_name}</span>
                      {cls.grade_level && <Badge variant="secondary" className="text-xs">{cls.grade_level}</Badge>}
                      {cls.homeroom_teacher_name && (
                        <span className="text-xs text-muted-foreground">מחנכת: {cls.homeroom_teacher_name}</span>
                      )}
                      <Badge variant="outline" className="text-xs">{classSessions.length} מפגשים</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setEditingClassId(cls.id); setEditClassForm({ class_name: cls.class_name, grade_level: cls.grade_level || "", homeroom_teacher_name: cls.homeroom_teacher_name || "", homeroom_teacher_phone: cls.homeroom_teacher_phone || "", notes: cls.notes || "" }); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setDeleteClassId(cls.id); }}>
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </Button>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {/* Edit class form */}
                  {isEditingThis && (
                    <div className="border-t p-3 bg-muted/20 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label className="text-xs">שם כיתה</Label>
                          <Input value={editClassForm.class_name} onChange={(e) => setEditClassForm((p: any) => ({ ...p, class_name: e.target.value }))} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">שכבה</Label>
                          <Input value={editClassForm.grade_level} onChange={(e) => setEditClassForm((p: any) => ({ ...p, grade_level: e.target.value }))} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">שם מחנכת</Label>
                          <Input value={editClassForm.homeroom_teacher_name} onChange={(e) => setEditClassForm((p: any) => ({ ...p, homeroom_teacher_name: e.target.value }))} className="h-9 rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">טלפון מחנכת</Label>
                          <Input value={editClassForm.homeroom_teacher_phone} onChange={(e) => setEditClassForm((p: any) => ({ ...p, homeroom_teacher_phone: e.target.value }))} className="h-9 rounded-lg" dir="ltr" />
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setEditingClassId(null)}>ביטול</Button>
                        <Button size="sm" onClick={() => updateClass.mutate({ classId: cls.id, data: editClassForm })}>שמור</Button>
                      </div>
                    </div>
                  )}

                  {/* Expanded: Sessions */}
                  {isExpanded && (
                    <div className="border-t px-3 pb-3 pt-2 space-y-3">
                      {/* Homeroom info */}
                      {(cls.homeroom_teacher_name || cls.homeroom_teacher_phone) && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>מחנכת: {cls.homeroom_teacher_name || "—"}</span>
                          <PhoneLink phone={cls.homeroom_teacher_phone} />
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" /> מפגשים ({classSessions.length})
                        </h4>
                        <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => { setAddingSessionForClassId(cls.id); setNewSessionDay(dayOfWeek != null ? String(dayOfWeek) : ""); }}>
                          <Plus className="h-3 w-3" /> מפגש
                        </Button>
                      </div>

                      {/* Add session form */}
                      {addingSessionForClassId === cls.id && (
                        <div className="rounded-lg border border-primary/30 bg-muted/20 p-2.5 space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">יום</Label>
                              <Select value={newSessionDay} onValueChange={setNewSessionDay}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="יום" /></SelectTrigger>
                                <SelectContent>
                                  {DAY_NAMES.map((name, i) => (
                                    <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">משעה</Label>
                              <Input type="time" value={newSessionStart} onChange={(e) => setNewSessionStart(e.target.value)} className="h-8 text-xs rounded-lg" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">עד שעה</Label>
                              <Input type="time" value={newSessionEnd} onChange={(e) => setNewSessionEnd(e.target.value)} className="h-8 text-xs rounded-lg" />
                            </div>
                          </div>
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setAddingSessionForClassId(null)}>ביטול</Button>
                            <Button size="sm" className="h-7 text-xs" onClick={() => addSession.mutate(cls.id)}>הוסף</Button>
                          </div>
                        </div>
                      )}

                      {classSessions.length === 0 && addingSessionForClassId !== cls.id && (
                        <p className="text-xs text-muted-foreground text-center py-2">אין מפגשים. לחץ "מפגש+" להוספה.</p>
                      )}

                      {/* Sessions list */}
                      {classSessions.map((session: any) => {
                        const groups = getGroupsForSession(session.id);
                        const dayName = session.day_of_week != null ? DAY_NAMES[session.day_of_week] : "";
                        const timeStr = [session.start_time?.slice(0, 5), session.end_time?.slice(0, 5)].filter(Boolean).join("–");

                        return (
                          <div key={session.id} className="rounded-lg border bg-card p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 text-sm">
                                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="font-medium">{dayName && `יום ${dayName}`}{timeStr && `, ${timeStr}`}</span>
                                <Badge variant="outline" className="text-xs">{groups.length} קבוצות</Badge>
                              </div>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDeleteSessionId(session.id)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>

                            {/* Groups in session */}
                            <div className="space-y-1.5 mr-5">
                              {groups.map((g: any) => (
                                <div key={g.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                    <span className="font-medium">{g.instruments?.name}</span>
                                    <span className="text-muted-foreground">–</span>
                                    <span className="text-muted-foreground">{g.teachers?.first_name} {g.teachers?.last_name}</span>
                                  </div>
                                  <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => removeGroup.mutate(g.id)}>
                                    <X className="h-3 w-3 text-destructive" />
                                  </Button>
                                </div>
                              ))}

                              {/* Add group */}
                              {addingGroupForSessionId === session.id ? (
                                <div className="flex flex-col sm:flex-row gap-2 rounded-lg border border-primary/30 bg-muted/20 p-2">
                                  <Select value={newGroupInstrumentId} onValueChange={setNewGroupInstrumentId}>
                                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="כלי נגינה" /></SelectTrigger>
                                    <SelectContent>
                                      {allInstruments.map((i: any) => (
                                        <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Select value={newGroupTeacherId} onValueChange={setNewGroupTeacherId}>
                                    <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="מורה" /></SelectTrigger>
                                    <SelectContent>
                                      {allTeachers.map((t: any) => (
                                        <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <div className="flex gap-1">
                                    <Button size="sm" className="h-8 text-xs" disabled={!newGroupInstrumentId || !newGroupTeacherId} onClick={() => addGroup.mutate(session.id)}>הוסף</Button>
                                    <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAddingGroupForSessionId(null)}>ביטול</Button>
                                  </div>
                                </div>
                              ) : (
                                <Button size="sm" variant="ghost" className="h-7 text-xs w-full" onClick={() => { setAddingGroupForSessionId(session.id); setNewGroupInstrumentId(""); setNewGroupTeacherId(""); }}>
                                  <Plus className="h-3 w-3" /> קבוצה חדשה
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Delete school dialog */}
      <AlertDialog open={showDeleteSchool} onOpenChange={setShowDeleteSchool}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת בית ספר מנגן</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את בית הספר וכל הכיתות, המפגשים והקבוצות שלו? פעולה זו אינה ניתנת לביטול.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={() => deleteSchool.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteSchool.isPending ? "מוחק..." : "מחק"}
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete class dialog */}
      <AlertDialog open={!!deleteClassId} onOpenChange={(open) => !open && setDeleteClassId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת כיתה</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את הכיתה וכל המפגשים והקבוצות שלה?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={() => deleteClassId && deleteClass.mutate(deleteClassId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete session dialog */}
      <AlertDialog open={!!deleteSessionId} onOpenChange={(open) => !open && setDeleteSessionId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת מפגש</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את המפגש וכל הקבוצות בתוכו?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={() => deleteSessionId && deleteSession.mutate(deleteSessionId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminSchoolMusicSchoolCard;
