import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Student {
  id: string;
  first_name: string;
  last_name: string;
}

interface Props {
  ensembleId: string;
  allStudents: Student[];
  existingStudentIds: Set<string>;
  onDone: () => void;
}

const EnsembleStudentPicker = ({ ensembleId, allStudents, existingStudentIds, onDone }: Props) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const availableStudents = useMemo(() => {
    return allStudents.filter((s) => !existingStudentIds.has(s.id));
  }, [allStudents, existingStudentIds]);

  const filtered = useMemo(() => {
    if (!search.trim()) return availableStudents;
    const q = search.trim().toLowerCase();
    return availableStudents.filter(
      (s) =>
        s.first_name.toLowerCase().includes(q) ||
        s.last_name.toLowerCase().includes(q) ||
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(q)
    );
  }, [availableStudents, search]);

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
      const rows = Array.from(selected).map((student_id) => ({
        ensemble_id: ensembleId,
        student_id,
      }));
      const { error } = await supabase.from("ensemble_students").insert(rows);
      if (error) throw error;
      toast.success(`${selected.size} תלמידים נוספו להרכב`);
      setSelected(new Set());
      setSearch("");
      setOpen(false);
      onDone();
    } catch {
      toast.error("שגיאה בהוספת תלמידים");
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
            placeholder="חיפוש תלמיד..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>

        <ScrollArea className="h-72 border rounded-lg">
          {filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">
              {availableStudents.length === 0 ? "כל התלמידים כבר בהרכב" : "לא נמצאו תלמידים"}
            </p>
          ) : (
            <div className="divide-y">
              {filtered.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/50 cursor-pointer transition-colors"
                >
                  <Checkbox
                    checked={selected.has(s.id)}
                    onCheckedChange={() => toggle(s.id)}
                  />
                  <span className="text-sm">{s.first_name} {s.last_name}</span>
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
