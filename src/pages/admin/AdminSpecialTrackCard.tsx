import { useNavigate, useParams } from "react-router-dom";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { sortByPerson } from "@/lib/sortHebrew";
import { PhoneDisplay } from "@/components/PhoneDisplay";

export const SPECIAL_TRACKS: Record<
  string,
  { label: string; column: "is_junior_track" | "is_major_student" | "has_music_production_course" | "has_recital_track"; icon: string }
> = {
  "junior-track": { label: "מסלול חטיבה", column: "is_junior_track", icon: "📘" },
  "music-major": { label: "מגמת המוסיקה", column: "is_major_student", icon: "🎓" },
  "music-production": { label: "הפקה מוסיקלית", column: "has_music_production_course", icon: "🎚️" },
  "recital": { label: "מסלול רסיטל", column: "has_recital_track", icon: "🎼" },
};

const AdminSpecialTrackCard = () => {
  const { trackKey } = useParams<{ trackKey: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const track = trackKey ? SPECIAL_TRACKS[trackKey] : undefined;

  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["special-track-students", track?.column] });
    queryClient.invalidateQueries({ queryKey: ["special-track-all-students"] });
  };

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["special-track-students", track?.column],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, national_id, grade, city, phone, parent_phone")
        .eq(track!.column, true)
        .eq("is_active", true);
      if (error) throw error;
      return sortByPerson(data || []);
    },
    enabled: !!track,
  });

  const { data: allStudents = [] } = useQuery({
    queryKey: ["special-track-all-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name, grade, is_junior_track, is_major_student, has_music_production_course, has_recital_track")
        .eq("is_active", true);
      if (error) throw error;
      return sortByPerson(data || []);
    },
    enabled: pickerOpen,
  });

  const available = useMemo(
    () => allStudents.filter((s: any) => !s[track!.column]),
    [allStudents, track]
  );

  const filteredAvailable = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.trim().toLowerCase();
    return available.filter((s: any) =>
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
    );
  }, [available, search]);

  const removeStudent = useMutation({
    mutationFn: async (studentId: string) => {
      const { error } = await supabase
        .from("students")
        .update({ [track!.column]: false } as any)
        .eq("id", studentId);
      if (error) throw error;
    },
    onSuccess: () => { invalidate(); toast.success("הוסר מהמסלול"); },
    onError: () => toast.error("שגיאה"),
  });

  const addStudents = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("students")
        .update({ [track!.column]: true } as any)
        .in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success(`${selected.size} תלמידים נוספו`);
      setSelected(new Set());
      setSearch("");
      setPickerOpen(false);
    },
    onError: () => toast.error("שגיאה"),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!track) {
    return <AdminLayout title="לא נמצא" backPath="/admin/ensembles"><p className="text-center text-muted-foreground py-8">מסלול לא קיים</p></AdminLayout>;
  }

  return (
    <AdminLayout title={`${track.icon} ${track.label}`} backPath="/admin/ensembles">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle className="text-lg">תלמידים ({students.length})</CardTitle>
          <Dialog open={pickerOpen} onOpenChange={(v) => { setPickerOpen(v); if (!v) { setSelected(new Set()); setSearch(""); } }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 ml-1" /> הוסף תלמידים</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader><DialogTitle>הוספת תלמידים ל{track.label}</DialogTitle></DialogHeader>
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="חיפוש לפי שם..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-9"
                />
              </div>
              <ScrollArea className="h-72 border rounded-lg">
                {filteredAvailable.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8 text-sm">
                    {available.length === 0 ? "כל התלמידים כבר במסלול" : "לא נמצאו תוצאות"}
                  </p>
                ) : (
                  <div className="divide-y">
                    {filteredAvailable.map((s: any) => (
                      <label key={s.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 cursor-pointer">
                        <Checkbox checked={selected.has(s.id)} onCheckedChange={() => toggle(s.id)} />
                        <span className="text-sm">
                          {s.first_name} {s.last_name}
                          {s.grade && <span className="text-muted-foreground"> · כיתה {s.grade}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </ScrollArea>
              <div className="flex items-center justify-between pt-2">
                <span className="text-sm text-muted-foreground">{selected.size > 0 ? `${selected.size} נבחרו` : ""}</span>
                <Button
                  onClick={() => addStudents.mutate(Array.from(selected))}
                  disabled={selected.size === 0 || addStudents.isPending}
                >
                  {addStudents.isPending ? "שומר..." : `הוסף ${selected.size > 0 ? `(${selected.size})` : ""}`}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">טוען...</p>
          ) : students.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">אין תלמידים במסלול זה</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {students.map((s: any) => (
                <Badge
                  key={s.id}
                  variant="secondary"
                  className="text-sm gap-1.5 pl-3 pr-1.5 py-1.5 cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => navigate(`/admin/students/${s.id}`)}
                >
                  {s.first_name} {s.last_name}
                  {s.grade && <span className="text-muted-foreground">· {s.grade}</span>}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(`להסיר את ${s.first_name} ${s.last_name} מ${track.label}?`)) {
                        removeStudent.mutate(s.id);
                      }
                    }}
                    className="hover:text-destructive rounded-full p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminSpecialTrackCard;
