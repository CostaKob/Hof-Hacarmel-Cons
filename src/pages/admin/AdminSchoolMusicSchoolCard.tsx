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
import { Pencil, Trash2, Plus, X, Check, Phone } from "lucide-react";
import { toast } from "sonner";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const AdminSchoolMusicSchoolCard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [newGroupInstrumentId, setNewGroupInstrumentId] = useState("");
  const [newGroupTeacherId, setNewGroupTeacherId] = useState("");
  const [showDeleteSchool, setShowDeleteSchool] = useState(false);
  const [editingCoordinator, setEditingCoordinator] = useState(false);
  const [editingConductor, setEditingConductor] = useState(false);
  const [editingCoordinatorHours, setEditingCoordinatorHours] = useState(false);
  const [editingConductorHours, setEditingConductorHours] = useState(false);
  const [coordHoursInput, setCoordHoursInput] = useState("");
  const [conductHoursInput, setConductHoursInput] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupInstrumentId, setEditGroupInstrumentId] = useState("");
  const [editGroupTeacherId, setEditGroupTeacherId] = useState("");
  const [editGroupHours, setEditGroupHours] = useState("");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["school-music-school", id] });
    queryClient.invalidateQueries({ queryKey: ["school-music-groups", id] });
    queryClient.invalidateQueries({ queryKey: ["school-music-schools"] });
  };

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

  const { data: groups = [] } = useQuery({
    queryKey: ["school-music-groups", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_groups")
        .select("*, instruments(name), teachers(first_name, last_name, phone)")
        .eq("school_music_school_id", id!);
      if (error) throw error;
      return data;
    },
    enabled: !!id,
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

  // --- Mutations ---
  const addGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("school_music_groups").insert({
        school_music_school_id: id!,
        instrument_id: newGroupInstrumentId,
        teacher_id: newGroupTeacherId,
      });
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setNewGroupInstrumentId(""); setNewGroupTeacherId(""); toast.success("הקבוצה נוספה"); },
    onError: () => toast.error("שגיאה בהוספת הקבוצה"),
  });

  const removeGroup = useMutation({
    mutationFn: async (groupId: string) => {
      const { error } = await supabase.from("school_music_groups").delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("הקבוצה הוסרה"); },
    onError: () => toast.error("שגיאה"),
  });

  const updateGroup = useMutation({
    mutationFn: async ({ groupId, instrumentId, teacherId, weeklyHours }: { groupId: string; instrumentId: string; teacherId: string; weeklyHours: string }) => {
      const hours = weeklyHours === "" ? null : Number(weeklyHours);
      const { error } = await supabase.from("school_music_groups").update({ instrument_id: instrumentId, teacher_id: teacherId, weekly_hours: hours } as any).eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); setEditingGroupId(null); toast.success("הקבוצה עודכנה"); },
    onError: () => toast.error("שגיאה"),
  });

  const setCoordinator = useMutation({
    mutationFn: async (teacherId: string | null) => {
      const { error } = await supabase.from("school_music_schools").update({ coordinator_teacher_id: teacherId }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("הרכז עודכן"); },
    onError: () => toast.error("שגיאה"),
  });

  const setConductor = useMutation({
    mutationFn: async (teacherId: string | null) => {
      const { error } = await supabase.from("school_music_schools").update({ conductor_teacher_id: teacherId }).eq("id", id!);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("המנצח עודכן"); },
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

  if (isLoading) return <AdminLayout title="טוען..." backPath="/admin/school-music-schools"><p className="text-center text-muted-foreground py-8">טוען...</p></AdminLayout>;
  if (!school) return <AdminLayout title="לא נמצא" backPath="/admin/school-music-schools"><p className="text-center text-muted-foreground py-8">לא נמצא</p></AdminLayout>;

  const coordinator = (school as any).coordinator;
  const conductor = (school as any).conductor;
  const classesCount = (school as any).classes_count || 0;
  const coordinatorHours: number | null = (school as any).coordinator_hours;
  const conductorHours: number | null = (school as any).conductor_hours;
  const effectiveCoordHours = coordinatorHours ?? classesCount;
  const effectiveConductHours = conductorHours ?? classesCount;
  const dayOfWeek = (school as any).day_of_week;
  const classSchedules: { start_time: string; end_time: string }[] = (school as any).class_schedules || [];
  const homeroomTeachers: { name: string; phone: string }[] = (school as any).homeroom_teachers || [];

  const PhoneLink = ({ phone }: { phone?: string | null }) => {
    if (!phone) return null;
    return (
      <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline" dir="ltr">
        <Phone className="h-3 w-3" />
        {phone}
      </a>
    );
  };

  return (
    <AdminLayout title={school.school_name} backPath="/admin/school-music-schools">
      <div className="space-y-5">
        {/* School Details */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg">פרטי בית הספר</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => navigate(`/admin/school-music-schools/${id}/edit`)}>
                <Pencil className="h-4 w-4 ml-1" /> עריכה
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setShowDeleteSchool(true)}>
                <Trash2 className="h-4 w-4 ml-1" /> מחיקה
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex gap-2"><span className="text-muted-foreground">שם:</span><span>{school.school_name}</span></div>
            <div className="flex gap-2"><span className="text-muted-foreground">שנה:</span><span>{(school as any).academic_years?.name || "—"}</span></div>
            {classesCount > 0 && <div className="flex gap-2"><span className="text-muted-foreground">כיתות בשכבה:</span><span>{classesCount}</span></div>}
            {dayOfWeek != null && <div className="flex gap-2"><span className="text-muted-foreground">יום:</span><span>{DAY_NAMES[dayOfWeek]}</span></div>}
            {school.notes && <div className="flex gap-2"><span className="text-muted-foreground">הערות:</span><span>{school.notes}</span></div>}
            <div className="flex gap-2 items-center"><span className="text-muted-foreground">סטטוס:</span><Badge variant={school.is_active ? "default" : "secondary"}>{school.is_active ? "פעיל" : "לא פעיל"}</Badge></div>
          </CardContent>
        </Card>

        {/* Class Schedules */}
        {classSchedules.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">שעות שיעורים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {classSchedules.map((s, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-xl border p-2.5 text-sm">
                    <span className="font-medium text-muted-foreground">כיתה {i + 1}</span>
                    <span dir="ltr">{s.start_time || "—"} – {s.end_time || "—"}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Homeroom Teachers */}
        {homeroomTeachers.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">מחנכות כיתות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {homeroomTeachers.map((ht, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-muted-foreground">כיתה {i + 1}:</span>
                      <span className="font-medium">{ht.name || "—"}</span>
                    </div>
                    <PhoneLink phone={ht.phone} />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Coordinator */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg">רכז</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {coordinator && !editingCoordinator ? (
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="font-medium">{coordinator.first_name} {coordinator.last_name}</p>
                  <PhoneLink phone={coordinator.phone} />
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditingCoordinator(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setCoordinator.mutate(null)}>
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Select onValueChange={(v) => { setCoordinator.mutate(v); setEditingCoordinator(false); }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="בחר רכז" /></SelectTrigger>
                  <SelectContent>
                    {allTeachers.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editingCoordinator && (
                  <Button variant="ghost" size="sm" onClick={() => setEditingCoordinator(false)}>ביטול</Button>
                )}
              </div>
            )}
            {coordinator && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">שעות ריכוז:</span>
                {editingCoordinatorHours ? (
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} className="w-20 h-7 text-xs rounded-lg text-center" value={coordHoursInput} onChange={(e) => setCoordHoursInput(e.target.value)} placeholder={String(classesCount)} />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { updateRoleHours.mutate({ field: "coordinator_hours", value: coordHoursInput === "" ? null : Number(coordHoursInput) }); }}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingCoordinatorHours(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Badge variant={coordinatorHours != null ? "default" : "secondary"}>{effectiveCoordHours}</Badge>
                    {coordinatorHours != null && <span className="text-xs text-muted-foreground">(ידני)</span>}
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setCoordHoursInput(coordinatorHours != null ? String(coordinatorHours) : ""); setEditingCoordinatorHours(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Conductor */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg">מנצח</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {conductor && !editingConductor ? (
              <div className="flex items-center justify-between rounded-xl border p-3">
                <div>
                  <p className="font-medium">{conductor.first_name} {conductor.last_name}</p>
                  <PhoneLink phone={conductor.phone} />
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => setEditingConductor(true)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setConductor.mutate(null)}>
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Select onValueChange={(v) => { setConductor.mutate(v); setEditingConductor(false); }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="בחר מנצח" /></SelectTrigger>
                  <SelectContent>
                    {allTeachers.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editingConductor && (
                  <Button variant="ghost" size="sm" onClick={() => setEditingConductor(false)}>ביטול</Button>
                )}
              </div>
            )}
            {conductor && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">שעות ניצוח:</span>
                {editingConductorHours ? (
                  <div className="flex items-center gap-1">
                    <Input type="number" min={0} className="w-20 h-7 text-xs rounded-lg text-center" value={conductHoursInput} onChange={(e) => setConductHoursInput(e.target.value)} placeholder={String(classesCount)} />
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { updateRoleHours.mutate({ field: "conductor_hours", value: conductHoursInput === "" ? null : Number(conductHoursInput) }); }}>
                      <Check className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingConductorHours(false)}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <Badge variant={conductorHours != null ? "default" : "secondary"}>{effectiveConductHours}</Badge>
                    {conductorHours != null && <span className="text-xs text-muted-foreground">(ידני)</span>}
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { setConductHoursInput(conductorHours != null ? String(conductorHours) : ""); setEditingConductorHours(true); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Hours Summary */}
        {classesCount > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">סיכום שעות שבועיות</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2">
                {/* Per-teacher breakdown */}
                {groups.map((g: any) => {
                  const hours = (g as any).weekly_hours ?? classesCount;
                  return (
                  <div key={g.id} className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{g.teachers?.first_name} {g.teachers?.last_name}</span>
                      <span className="text-muted-foreground">({g.instruments?.name})</span>
                    </div>
                    <Badge variant={hours !== classesCount ? "default" : "secondary"}>{hours} שעות קבוצה קטנה</Badge>
                  </div>
                  );
                })}
                {coordinator && (
                  <div className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{coordinator.first_name} {coordinator.last_name}</span>
                      <span className="text-muted-foreground">(רכז)</span>
                    </div>
                    <Badge variant="secondary">{classesCount} שעות ריכוז</Badge>
                  </div>
                )}
                {conductor && (
                  <div className="flex items-center justify-between rounded-xl border p-2.5 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{conductor.first_name} {conductor.last_name}</span>
                      <span className="text-muted-foreground">(מנצח)</span>
                    </div>
                    <Badge variant="secondary">{classesCount} שעות ניצוח</Badge>
                  </div>
                )}
                {/* Totals */}
                <div className="border-t pt-2 mt-1 space-y-1">
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>סה״כ שעות קבוצה קטנה</span>
                    <span>{groups.reduce((sum: number, g: any) => sum + ((g as any).weekly_hours ?? classesCount), 0)}</span>
                  </div>
                  {(coordinator || conductor) && (
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>סה״כ שעות ריכוז וניצוח</span>
                      <span>{(coordinator ? classesCount : 0) + (conductor ? classesCount : 0)}</span>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Groups */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">קבוצות ({groups.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2 pb-2 border-b">
              <Select value={newGroupInstrumentId} onValueChange={setNewGroupInstrumentId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="כלי נגינה" /></SelectTrigger>
                <SelectContent>
                  {allInstruments.map((i: any) => (
                    <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={newGroupTeacherId} onValueChange={setNewGroupTeacherId}>
                <SelectTrigger className="flex-1"><SelectValue placeholder="מורה" /></SelectTrigger>
                <SelectContent>
                  {allTeachers.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => addGroup.mutate()} disabled={!newGroupInstrumentId || !newGroupTeacherId || addGroup.isPending} className="shrink-0">
                <Plus className="h-4 w-4 ml-1" /> הוסף קבוצה
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {groups.map((g: any) => (
                editingGroupId === g.id ? (
                  <div key={g.id} className="rounded-xl border p-2.5 space-y-2">
                    <Select value={editGroupInstrumentId} onValueChange={setEditGroupInstrumentId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="כלי" /></SelectTrigger>
                      <SelectContent>
                        {allInstruments.map((i: any) => (
                          <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={editGroupTeacherId} onValueChange={setEditGroupTeacherId}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="מורה" /></SelectTrigger>
                      <SelectContent>
                        {allTeachers.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>{t.first_name} {t.last_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">שעות שבועיות (ריק = {classesCount} לפי שכבה)</Label>
                      <Input type="number" min={0} className="h-8 text-xs rounded-lg" value={editGroupHours} onChange={(e) => setEditGroupHours(e.target.value)} placeholder={String(classesCount)} />
                    </div>
                    <div className="flex gap-1 justify-end">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingGroupId(null)}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" className="h-7 px-2" onClick={() => updateGroup.mutate({ groupId: g.id, instrumentId: editGroupInstrumentId, teacherId: editGroupTeacherId, weeklyHours: editGroupHours })}>
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={g.id} className="flex items-center justify-between rounded-xl border p-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{g.instruments?.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{g.teachers?.first_name} {g.teachers?.last_name}</p>
                      <div className="flex items-center gap-2">
                        <PhoneLink phone={g.teachers?.phone} />
                        {(g as any).weekly_hours != null && (g as any).weekly_hours !== classesCount && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1">{(g as any).weekly_hours} ש׳</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-0.5 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingGroupId(g.id); setEditGroupInstrumentId(g.instrument_id); setEditGroupTeacherId(g.teacher_id); setEditGroupHours((g as any).weekly_hours != null ? String((g as any).weekly_hours) : ""); }}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeGroup.mutate(g.id)}>
                        <X className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                )
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDeleteSchool} onOpenChange={setShowDeleteSchool}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת בית ספר מנגן</AlertDialogTitle>
            <AlertDialogDescription>האם למחוק את בית הספר וכל הקבוצות שלו? פעולה זו אינה ניתנת לביטול.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogAction onClick={() => deleteSchool.mutate()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleteSchool.isPending ? "מוחק..." : "מחק"}
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminSchoolMusicSchoolCard;
