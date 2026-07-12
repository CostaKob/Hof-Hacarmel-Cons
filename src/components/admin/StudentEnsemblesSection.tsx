import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, X, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { ENSEMBLE_TYPE_LABELS } from "@/lib/ensembleConstants";

interface Enrollment {
  id: string;
  instrument_id: string;
  instruments?: { name?: string } | null;
  schools?: { name?: string } | null;
}

interface Props {
  studentId: string;
  enrollments: Enrollment[];
}

const StudentEnsemblesSection = ({ studentId, enrollments }: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeYear, selectedYearId } = useAcademicYear();
  const yearId = selectedYearId || activeYear?.id;
  const yearName = activeYear?.name;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState<string>("");

  const enrollmentIds = useMemo(() => enrollments.map((e) => e.id), [enrollments]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["student-ensembles", studentId, yearId] });
    queryClient.invalidateQueries({ queryKey: ["ensemble-students"] });
  };

  const { data: memberships = [] } = useQuery({
    queryKey: ["student-ensembles", studentId, yearId, enrollmentIds.join(",")],
    queryFn: async () => {
      // Rows attached via enrollment (per-instrument)
      let byEnr: any[] = [];
      if (enrollmentIds.length > 0) {
        const { data, error } = await supabase
          .from("ensemble_students")
          .select("id, ensemble_id, enrollment_id, ensembles(id, name, ensemble_type)")
          .in("enrollment_id", enrollmentIds);
        if (error) throw error;
        byEnr = data || [];
      }
      // Legacy rows without enrollment_id (backfill couldn't match)
      const { data: legacy, error: legErr } = await supabase
        .from("ensemble_students")
        .select("id, ensemble_id, enrollment_id, ensembles!inner(id, name, ensemble_type, academic_year_id)")
        .eq("student_id", studentId)
        .is("enrollment_id", null)
        .eq("ensembles.academic_year_id", yearId!);
      if (legErr) throw legErr;
      return [...byEnr, ...(legacy || [])];
    },
    enabled: !!studentId && !!yearId,
  });

  const { data: yearEnsembles = [] } = useQuery({
    queryKey: ["ensembles-by-year", yearId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ensembles")
        .select(
          "id, name, ensemble_type, ensemble_staff(role, teachers(first_name, last_name))"
        )
        .eq("academic_year_id", yearId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!yearId && open,
  });

  // ensembles already used by the currently-selected enrollment
  const existingIdsForSelected = useMemo(() => {
    const s = new Set<string>();
    memberships.forEach((m: any) => {
      if (m.enrollment_id === enrollmentId) s.add(m.ensemble_id);
    });
    return s;
  }, [memberships, enrollmentId]);

  const available = useMemo(
    () => yearEnsembles.filter((e: any) => !existingIdsForSelected.has(e.id)),
    [yearEnsembles, existingIdsForSelected]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.trim().toLowerCase();
    return available.filter((e: any) => {
      const staffNames = (e.ensemble_staff || [])
        .map(
          (s: any) =>
            `${s.teachers?.first_name || ""} ${s.teachers?.last_name || ""}`.toLowerCase()
        )
        .join(" ");
      return e.name.toLowerCase().includes(q) || staffNames.includes(q);
    });
  }, [available, search]);

  useEffect(() => {
    if (open && !enrollmentId && enrollments.length === 1) {
      setEnrollmentId(enrollments[0].id);
    }
  }, [open, enrollmentId, enrollments]);

  const removeMutation = useMutation({
    mutationFn: async (rowId: string) => {
      const { error } = await supabase.from("ensemble_students").delete().eq("id", rowId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("ההרכב הוסר");
    },
    onError: () => toast.error("שגיאה בהסרה"),
  });

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setSelected(new Set());
      setSearch("");
      setEnrollmentId("");
    }
  };

  const handleSave = async () => {
    if (selected.size === 0 || !enrollmentId) return;
    setSaving(true);
    try {
      const rows = Array.from(selected).map((ensemble_id) => ({
        ensemble_id,
        student_id: studentId,
        enrollment_id: enrollmentId,
      }));
      const { error } = await supabase.from("ensemble_students").insert(rows);
      if (error) throw error;
      toast.success(`נוספו ${selected.size} הרכבים`);
      handleOpenChange(false);
      invalidate();
    } catch {
      toast.error("שגיאה בהוספה");
    } finally {
      setSaving(false);
    }
  };

  if (!yearId) return null;

  const staffLabel = (staff: any[]) => {
    const items = (staff || [])
      .filter((s: any) => ["conductor", "instructor"].includes(s.role))
      .map((s: any) => {
        const name = `${s.teachers?.first_name || ""} ${s.teachers?.last_name || ""}`.trim();
        const roleLabel = s.role === "conductor" ? "מנצח" : "מנחה";
        return `${roleLabel}: ${name}`;
      });
    if (items.length === 0) return null;
    return items.join(" · ");
  };

  const enrollmentLabel = (eId: string | null) => {
    if (!eId) return null;
    const e = enrollments.find((x) => x.id === eId);
    return e?.instruments?.name || null;
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-foreground text-base">
          הרכבים {yearName ? `· ${yearName}` : ""}
          <span className="text-muted-foreground font-normal"> ({memberships.length})</span>
        </h2>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button size="sm" disabled={enrollments.length === 0}>
              <Plus className="h-4 w-4 ml-1" /> הוסף להרכב
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>הוספת התלמיד להרכבים{yearName ? ` · ${yearName}` : ""}</DialogTitle>
            </DialogHeader>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">שיוך (כלי נגינה)</label>
              <Select value={enrollmentId} onValueChange={setEnrollmentId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue placeholder="בחר שיוך" />
                </SelectTrigger>
                <SelectContent>
                  {enrollments.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.instruments?.name || "כלי"} {e.schools?.name ? `· ${e.schools.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                ההרכב יקושר לשיוך הספציפי — ניתן לצרף את אותו התלמיד להרכב אחר עם כלי אחר.
              </p>
            </div>

            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש הרכב..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
                disabled={!enrollmentId}
              />
            </div>
            <ScrollArea className="h-60 border rounded-lg">
              {!enrollmentId ? (
                <p className="text-center text-muted-foreground py-8 text-sm">בחר שיוך כדי להציג הרכבים</p>
              ) : filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  {available.length === 0 ? "השיוך כבר מקושר לכל ההרכבים בשנה זו" : "לא נמצאו הרכבים"}
                </p>
              ) : (
                <div className="divide-y">
                  {filtered.map((e: any) => {
                    const staff = staffLabel(e.ensemble_staff);
                    return (
                      <label
                        key={e.id}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors"
                      >
                        <Checkbox
                          checked={selected.has(e.id)}
                          onCheckedChange={() => toggle(e.id)}
                        />
                        <span className="text-sm">
                          {e.name}
                          <span className="text-muted-foreground">
                            {" "}
                            · {ENSEMBLE_TYPE_LABELS[e.ensemble_type] || e.ensemble_type}
                            {staff && (
                              <span className="block text-xs text-muted-foreground/80 mt-0.5">
                                {staff}
                              </span>
                            )}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground">
                {selected.size > 0 ? `${selected.size} נבחרו` : ""}
              </span>
              <Button onClick={handleSave} disabled={selected.size === 0 || !enrollmentId || saving}>
                {saving ? "שומר..." : `הוסף ${selected.size > 0 ? `(${selected.size})` : ""}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {memberships.length === 0 ? (
        <p className="text-sm text-muted-foreground">התלמיד לא משויך להרכבים בשנה זו</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {memberships.map((es: any) => {
            const instr = enrollmentLabel(es.enrollment_id);
            const missing = !es.enrollment_id;
            return (
              <Badge
                key={es.id}
                variant="secondary"
                className="text-sm gap-1.5 pl-3 pr-1.5 py-1.5 cursor-pointer hover:bg-accent transition-colors"
                onClick={() => navigate(`/admin/ensembles/${es.ensemble_id}`)}
                title={missing ? "השיוך לכלי לא הוגדר — יש להסיר ולהוסיף מחדש" : undefined}
              >
                {es.ensembles?.name}
                {instr && <span className="text-muted-foreground">· {instr}</span>}
                {missing && <AlertCircle className="h-3 w-3 text-amber-600" />}
                <button
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (confirm("להסיר את התלמיד מההרכב?")) removeMutation.mutate(es.id);
                  }}
                  className="hover:text-destructive rounded-full p-0.5"
                  aria-label="הסר"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentEnsemblesSection;
