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
import { Pencil, Trash2, Plus, X, Check, Phone, ChevronDown, ChevronUp, Music, Copy } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const AdminSchoolMusicSchoolCard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
  const [newClassHomeroomName, setNewClassHomeroomName] = useState("");
  const [newClassHomeroomPhone, setNewClassHomeroomPhone] = useState("");
  const [newClassDay, setNewClassDay] = useState("");
  const [newClassStart, setNewClassStart] = useState("");
  const [newClassEnd, setNewClassEnd] = useState("");
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [editClassForm, setEditClassForm] = useState<any>({});
  const [deleteClassId, setDeleteClassId] = useState<string | null>(null);

  // Group state
  const [addingGroupForClassId, setAddingGroupForClassId] = useState<string | null>(null);
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
    queryClient.invalidateQueries({ queryKey: ["school-music-class-groups", id] });
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
        .from("school_music_classes")
        .select("*")
        .eq("school_music_school_id", id!)
        .order("class_name");
      if (error) throw error;
      return data as any[];
    },
    enabled: !!id,
  });

  const { data: classGroups = [] } = useQuery({
    queryKey: ["school-music-class-groups", id],
    queryFn: async () => {
      const classIds = classes.map((c: any) => c.id);
      if (classIds.length === 0) return [];
      const { data, error } = await supabase
        .from("school_music_class_groups" as any)
        .select("*, instruments(name), teachers(first_name, last_name, phone)")
        .in("school_music_class_id", classIds);
      if (error) throw error;
      return data as any[];
    },
    enabled: classes.length > 0,
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
        homeroom_teacher_name: newClassHomeroomName || null,
        homeroom_teacher_phone: newClassHomeroomPhone || null,
        day_of_week: newClassDay ? Number(newClassDay) : null,
        start_time: newClassStart || null,
        end_time: newClassEnd || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setAddingClass(false);
      setNewClassName(""); setNewClassHomeroomName(""); setNewClassHomeroomPhone("");
      setNewClassDay(""); setNewClassStart(""); setNewClassEnd("");
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

  // Group mutations
  const addGroup = useMutation({
    mutationFn: async (classId: string) => {
      const { error } = await supabase.from("school_music_class_groups" as any).insert({
        school_music_class_id: classId,
        instrument_id: newGroupInstrumentId,
        teacher_id: newGroupTeacherId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setAddingGroupForClassId(null);
      setNewGroupInstrumentId(""); setNewGroupTeacherId("");
      toast.success("הקבוצה נוספה");
    },
    onError: () => toast.error("שגיאה"),
  });

  const removeGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from("school_music_class_groups" as any).delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("הקבוצה הוסרה"); },
    onError: () => toast.error("שגיאה"),
  });

  const duplicateClass = useMutation({
    mutationFn: async (sourceClassId: string) => {
      const source = classes.find((c: any) => c.id === sourceClassId);
      if (!source) throw new Error("Class not found");

      const { data: insertedClass, error: classErr } = await supabase
        .from("school_music_classes" as any)
        .insert({
          school_music_school_id: id!,
          class_name: `${source.class_name} (עותק)`,
          homeroom_teacher_name: source.homeroom_teacher_name || null,
          homeroom_teacher_phone: source.homeroom_teacher_phone || null,
          day_of_week: source.day_of_week,
          start_time: source.start_time || null,
          end_time: source.end_time || null,
          notes: source.notes || null,
        })
        .select("id, class_name, homeroom_teacher_name, homeroom_teacher_phone, day_of_week, start_time, end_time, notes")
        .single();

      const newClass = insertedClass as any;

      if (classErr || !newClass) throw classErr ?? new Error("Failed to create duplicated class");

      const { data: sourceGroups, error: sourceGroupsErr } = await supabase
        .from("school_music_class_groups" as any)
        .select("instrument_id, teacher_id, weekly_hours, instruments(name), teachers(first_name, last_name)")
        .eq("school_music_class_id", sourceClassId);

      if (sourceGroupsErr) throw sourceGroupsErr;

      const copiedGroups = (sourceGroups ?? []).map((group: any) => ({
        school_music_class_id: newClass.id,
        instrument_id: group.instrument_id,
        teacher_id: group.teacher_id,
        ...(group.weekly_hours !== undefined ? { weekly_hours: group.weekly_hours } : {}),
      }));

      if (copiedGroups.length > 0) {
        const { error: groupErr } = await supabase
          .from("school_music_class_groups" as any)
          .insert(copiedGroups);

        if (groupErr) throw groupErr;
      }

      return {
        sourceClassId,
        newClass,
        copiedGroupsCount: copiedGroups.length,
        copiedGroupsPreview: (sourceGroups ?? []).slice(0, 3).map((group: any) => ({
          instrument: group.instruments?.name ?? "—",
          teacher: `${group.teachers?.first_name ?? ""} ${group.teachers?.last_name ?? ""}`.trim() || "—",
        })),
      };
    },
    onSuccess: ({ newClass, copiedGroupsCount }: any) => {
      invalidate();
      setExpandedClasses(prev => new Set(prev).add(newClass.id));
      setEditingClassId(newClass.id);
      setEditClassForm({
        class_name: newClass.class_name,
        homeroom_teacher_name: newClass.homeroom_teacher_name || "",
        homeroom_teacher_phone: newClass.homeroom_teacher_phone || "",
        day_of_week: newClass.day_of_week != null ? String(newClass.day_of_week) : "",
        start_time: newClass.start_time?.slice(0, 5) || "",
        end_time: newClass.end_time?.slice(0, 5) || "",
        notes: newClass.notes || "",
      });
      toast.success(`הכיתה שוכפלה עם ${copiedGroupsCount} קבוצות`);
    },
    onError: () => toast.error("שגיאה בשכפול"),
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

  const getGroupsForClass = (classId: string) => classGroups.filter((g: any) => g.school_music_class_id === classId);

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
            {(school as any).principal_name && (
              <div className="flex gap-2 items-center">
                <span className="text-muted-foreground">מנהל/ת:</span>
                <span>{(school as any).principal_name}</span>
                <PhoneLink phone={(school as any).principal_phone} />
              </div>
            )}
            {(school as any).vice_principal_name && (
              <div className="flex gap-2 items-center">
                <span className="text-muted-foreground">סגן/ית:</span>
                <span>{(school as any).vice_principal_name}</span>
                <PhoneLink phone={(school as any).vice_principal_phone} />
              </div>
            )}
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
            <Button size="sm" className="h-9 rounded-xl" onClick={() => { setAddingClass(true); setNewClassDay(dayOfWeek != null ? String(dayOfWeek) : ""); }}>
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
                    <Label className="text-xs">יום</Label>
                    <Select value={newClassDay} onValueChange={setNewClassDay}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="יום" /></SelectTrigger>
                      <SelectContent>
                        {DAY_NAMES.map((name, i) => (
                          <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">משעה</Label>
                    <Input type="time" value={newClassStart} onChange={(e) => setNewClassStart(e.target.value)} className="h-9 text-xs rounded-lg" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">עד שעה</Label>
                    <Input type="time" value={newClassEnd} onChange={(e) => setNewClassEnd(e.target.value)} className="h-9 text-xs rounded-lg" />
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
              const groups = getGroupsForClass(cls.id);
              const isEditingThis = editingClassId === cls.id;
              const dayName = cls.day_of_week != null ? DAY_NAMES[cls.day_of_week] : null;
              const timeStr = [cls.start_time?.slice(0, 5), cls.end_time?.slice(0, 5)].filter(Boolean).join("–");

              return (
                <div key={cls.id} className="rounded-xl border border-border overflow-hidden">
                  {/* Class header */}
                  <button
                    type="button"
                    className="w-full p-3 flex items-center justify-between hover:bg-muted/30 transition-colors"
                    onClick={() => toggleClass(cls.id)}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-wrap">
                      <span className="font-semibold text-sm">{cls.class_name}</span>
                      {dayName && <Badge variant="outline" className="text-xs">יום {dayName}</Badge>}
                      {timeStr && <Badge variant="outline" className="text-xs" dir="ltr">{timeStr}</Badge>}
                      {cls.homeroom_teacher_name && (
                        <span className="text-xs text-muted-foreground">מחנכת: {cls.homeroom_teacher_name}</span>
                      )}
                      <Badge variant="outline" className="text-xs">{groups.length} קבוצות</Badge>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="שכפל כיתה" onClick={(e) => {
                        e.stopPropagation();
                        duplicateClass.mutate(cls.id);
                      }}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => {
                        e.stopPropagation();
                        setEditingClassId(cls.id);
                        setEditClassForm({
                          class_name: cls.class_name,
                          homeroom_teacher_name: cls.homeroom_teacher_name || "",
                          homeroom_teacher_phone: cls.homeroom_teacher_phone || "",
                          day_of_week: cls.day_of_week != null ? String(cls.day_of_week) : "",
                          start_time: cls.start_time?.slice(0, 5) || "",
                          end_time: cls.end_time?.slice(0, 5) || "",
                          notes: cls.notes || "",
                        });
                      }}>
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
                          <Label className="text-xs">יום</Label>
                          <Select value={editClassForm.day_of_week} onValueChange={(v) => setEditClassForm((p: any) => ({ ...p, day_of_week: v }))}>
                            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="יום" /></SelectTrigger>
                            <SelectContent>
                              {DAY_NAMES.map((name, i) => (
                                <SelectItem key={i} value={String(i)}>{name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">משעה</Label>
                          <Input type="time" value={editClassForm.start_time} onChange={(e) => setEditClassForm((p: any) => ({ ...p, start_time: e.target.value }))} className="h-9 text-xs rounded-lg" />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">עד שעה</Label>
                          <Input type="time" value={editClassForm.end_time} onChange={(e) => setEditClassForm((p: any) => ({ ...p, end_time: e.target.value }))} className="h-9 text-xs rounded-lg" />
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
                        <Button size="sm" onClick={() => {
                          const payload = {
                            class_name: editClassForm.class_name,
                            homeroom_teacher_name: editClassForm.homeroom_teacher_name || null,
                            homeroom_teacher_phone: editClassForm.homeroom_teacher_phone || null,
                            day_of_week: editClassForm.day_of_week ? Number(editClassForm.day_of_week) : null,
                            start_time: editClassForm.start_time || null,
                            end_time: editClassForm.end_time || null,
                            notes: editClassForm.notes || null,
                          };
                          updateClass.mutate({ classId: cls.id, data: payload });
                        }}>שמור</Button>
                      </div>
                    </div>
                  )}

                  {/* Expanded: Groups */}
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
                          <Music className="h-3.5 w-3.5" /> קבוצות ({groups.length})
                        </h4>
                        <Button size="sm" variant="outline" className="h-7 text-xs rounded-lg" onClick={() => { setAddingGroupForClassId(cls.id); setNewGroupInstrumentId(""); setNewGroupTeacherId(""); }}>
                          <Plus className="h-3 w-3" /> קבוצה
                        </Button>
                      </div>

                      {/* Groups list */}
                      <div className="space-y-1.5">
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

                        {groups.length === 0 && addingGroupForClassId !== cls.id && (
                          <p className="text-xs text-muted-foreground text-center py-2">אין קבוצות. לחץ "קבוצה+" להוספה.</p>
                        )}

                        {/* Add group */}
                        {addingGroupForClassId === cls.id && (
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
                              <Button size="sm" className="h-8 text-xs" disabled={!newGroupInstrumentId || !newGroupTeacherId} onClick={() => addGroup.mutate(cls.id)}>הוסף</Button>
                              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setAddingGroupForClassId(null)}>ביטול</Button>
                            </div>
                          </div>
                        )}
                      </div>
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
            <AlertDialogDescription>האם למחוק את בית הספר וכל הכיתות והקבוצות שלו? פעולה זו אינה ניתנת לביטול.</AlertDialogDescription>
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
            <AlertDialogDescription>האם למחוק את הכיתה וכל הקבוצות שלה?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={() => deleteClassId && deleteClass.mutate(deleteClassId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">מחק</AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminSchoolMusicSchoolCard;
