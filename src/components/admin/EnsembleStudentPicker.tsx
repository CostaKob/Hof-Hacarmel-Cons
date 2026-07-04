import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { sortByPerson } from "@/lib/sortHebrew";

interface Props {
  ensembleId: string;
  academicYearId: string;
  existingEnrollmentIds: Set<string>;
  onDone: () => void;
}

interface EnrollmentRow {
  id: string;
  student_id: string;
  students: { first_name: string; last_name: string } | null;
  instruments: { name: string } | null;
}

const EnsembleStudentPicker = ({ ensembleId, academicYearId, existingEnrollmentIds, onDone }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const { data: enrollments = [] } = useQuery({
    queryKey: ["ensemble-picker-enrollments", academicYearId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, student_id, students(first_name, last_name, is_active), instruments(name)")
        .eq("academic_year_id", academicYearId)
        .eq("is_active", true);
      if (error) throw error;
      const rows = (data || []).filter((r: any) => r.students?.is_active !== false) as any[];
      return sortByPerson(
        rows.map((r) => ({
          ...r,
          first_name: r.students?.first_name || "",
          last_name: r.students?.last_name || "",
        }))
      ) as unknown as EnrollmentRow[];
    },
    enabled: open && !!academicYearId,
  });

  const available = useMemo(
    () => enrollments.filter((e) => !existingEnrollmentIds.has(e.id)),
    [enrollments, existingEnrollmentIds]
  );

  const filtered = useMemo(() => {
    if (!search.trim()) return available;
    const q = search.trim().toLowerCase();
    return available.filter((e) => {
      const name = `${e.students?.first_name || ""} ${e.students?.last_name || ""}`.toLowerCase();
      const instr = (e.instruments?.name || "").toLowerCase();
      return name.includes(q) || instr.includes(q);
    });
  }, [available, search]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const rows = Array.from(selected).map((enrollmentId) => {
        const en = enrollments.find((e) => e.id === enrollmentId);
        return {
          ensemble_id: ensembleId,
          enrollment_id: enrollmentId,
          student_id: en?.student_id as string,
        };
      });
      const { error } = await supabase.from("ensemble_students").insert(rows);
      if (error) throw error;
      toast.success(`${selected.size} שיוכים נוספו להרכב`);
      setSelected(new Set());
      setSearch("");
      setOpen(false);
      onDone();
    } catch {
      toast.error("שגיאה בהוספה");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setSelected(new Set());
      setSearch("");
    }
  };

  useEffect(() => {
    if (!open) setSelected(new Set());
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="shrink-0">
          <Plus className="h-4 w-4 ml-1" /> הוסף תלמידים
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>הוספת תלמידים להרכב</DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש לפי שם או כלי..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          הרשימה מציגה שיוכים (תלמיד + כלי) של שנת הלימודים של ההרכב.
        </p>

        <ScrollArea className="h-72 border rounded-lg">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {available.length === 0 ? "כל השיוכים כבר בהרכב" : "לא נמצאו תוצאות"}
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((e) => (
                <label
                  key={e.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selected.has(e.id)}
                    onCheckedChange={() => toggle(e.id)}
                  />
                  <span className="text-sm">
                    {e.students?.first_name} {e.students?.last_name}
                    <span className="text-muted-foreground"> · {e.instruments?.name || "כלי"}</span>
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
  );
};

export default EnsembleStudentPicker;
