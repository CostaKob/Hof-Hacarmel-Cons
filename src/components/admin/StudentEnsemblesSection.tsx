import { useMemo, useState } from "react";
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
import { Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { ENSEMBLE_TYPE_LABELS } from "@/lib/ensembleConstants";

interface Props {
  studentId: string;
}

const StudentEnsemblesSection = ({ studentId }: Props) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { activeYear, selectedYearId } = useAcademicYear();
  const yearId = selectedYearId || activeYear?.id;
  const yearName = activeYear?.name;

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["student-ensembles", studentId, yearId] });
    queryClient.invalidateQueries({ queryKey: ["ensemble-students"] });
  };

  const { data: studentEnsembles = [] } = useQuery({
    queryKey: ["student-ensembles", studentId, yearId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ensemble_students")
        .select("id, ensemble_id, ensembles!inner(id, name, ensemble_type, academic_year_id, is_active)")
        .eq("student_id", studentId)
        .eq("ensembles.academic_year_id", yearId!);
      if (error) throw error;
      return data || [];
    },
    enabled: !!studentId && !!yearId,
  });

  const { data: yearEnsembles = [] } = useQuery({
    queryKey: ["ensembles-by-year", yearId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ensembles")
        .select("id, name, ensemble_type")
        .eq("academic_year_id", yearId!)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: !!yearId && open,
  });

  const existingIds = useMemo(
    () => new Set(studentEnsembles.map((es: any) => es.ensemble_id)),
    [studentEnsembles]
  );

  const available = useMemo(
    () => yearEnsembles.filter((e: any) => !existingIds.has(e.id)),
    [yearEnsembles, existingIds]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.trim().toLowerCase();
    return available.filter((e: any) => e.name.toLowerCase().includes(q));
  }, [available, search]);

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
    }
  };

  const handleSave = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const rows = Array.from(selected).map((ensemble_id) => ({
        ensemble_id,
        student_id: studentId,
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

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-foreground text-base">
          הרכבים {yearName ? `· ${yearName}` : ""}
          <span className="text-muted-foreground font-normal"> ({studentEnsembles.length})</span>
        </h2>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 ml-1" /> הוסף להרכב
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>הוספת התלמיד להרכבים{yearName ? ` · ${yearName}` : ""}</DialogTitle>
            </DialogHeader>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש הרכב..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
            <ScrollArea className="h-72 border rounded-lg">
              {filtered.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  {available.length === 0 ? "התלמיד כבר משויך לכל ההרכבים בשנה זו" : "לא נמצאו הרכבים"}
                </p>
              ) : (
                <div className="divide-y">
                  {filtered.map((e: any) => (
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
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </ScrollArea>
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground">
                {selected.size > 0 ? `${selected.size} נבחרו` : ""}
              </span>
              <Button onClick={handleSave} disabled={selected.size === 0 || saving}>
                {saving ? "שומר..." : `הוסף ${selected.size > 0 ? `(${selected.size})` : ""}`}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {studentEnsembles.length === 0 ? (
        <p className="text-sm text-muted-foreground">התלמיד לא משויך להרכבים בשנה זו</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {studentEnsembles.map((es: any) => (
            <Badge
              key={es.id}
              variant="secondary"
              className="text-sm gap-1.5 pl-3 pr-1.5 py-1.5 cursor-pointer hover:bg-accent transition-colors"
              onClick={() => navigate(`/admin/ensembles/${es.ensemble_id}`)}
            >
              {es.ensembles?.name}
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
          ))}
        </div>
      )}
    </div>
  );
};

export default StudentEnsemblesSection;
