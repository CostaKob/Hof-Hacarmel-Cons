import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Wrench, Trash2, Pencil, X, Check } from "lucide-react";

interface Props {
  inventoryInstrumentId: string;
}

interface RepairForm {
  sent_date: string;
  return_date: string;
  issue_description: string;
  treatment_description: string;
  technician_name: string;
}

const emptyForm = (): RepairForm => ({
  sent_date: format(new Date(), "yyyy-MM-dd"),
  return_date: "",
  issue_description: "",
  treatment_description: "",
  technician_name: "",
});

const InstrumentRepairsSection = ({ inventoryInstrumentId }: Props) => {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RepairForm>(emptyForm());
  const [toDelete, setToDelete] = useState<string | null>(null);

  const { data: repairs = [] } = useQuery({
    queryKey: ["instrument-repairs", inventoryInstrumentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instrument_repairs")
        .select("*")
        .eq("inventory_instrument_id", inventoryInstrumentId)
        .order("sent_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        inventory_instrument_id: inventoryInstrumentId,
        sent_date: form.sent_date,
        return_date: form.return_date || null,
        issue_description: form.issue_description.trim() || null,
        treatment_description: form.treatment_description.trim() || null,
        technician_name: form.technician_name.trim() || null,
      };
      if (editingId) {
        const { error } = await supabase.from("instrument_repairs").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("instrument_repairs").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instrument-repairs", inventoryInstrumentId] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instrument", inventoryInstrumentId] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      toast.success(editingId ? "התיקון עודכן" : "התיקון נוסף");
      setShowAdd(false);
      setEditingId(null);
      setForm(emptyForm());
    },
    onError: (e: any) => toast.error(e.message || "שגיאה"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("instrument_repairs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instrument-repairs", inventoryInstrumentId] });
      toast.success("התיקון נמחק");
      setToDelete(null);
    },
    onError: (e: any) => toast.error(e.message || "שגיאה"),
  });

  const closeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("instrument_repairs")
        .update({ return_date: format(new Date(), "yyyy-MM-dd") })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instrument-repairs", inventoryInstrumentId] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instrument", inventoryInstrumentId] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      toast.success("התיקון נסגר והכלי הוחזר לזמין");
    },
    onError: (e: any) => toast.error(e.message || "שגיאה"),
  });

  const startEdit = (r: any) => {
    setEditingId(r.id);
    setForm({
      sent_date: r.sent_date,
      return_date: r.return_date || "",
      issue_description: r.issue_description || "",
      treatment_description: r.treatment_description || "",
      technician_name: r.technician_name || "",
    });
    setShowAdd(true);
  };

  const cancelEdit = () => {
    setShowAdd(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground text-base flex items-center gap-2">
          <Wrench className="h-4 w-4" /> היסטוריית תיקונים ({repairs.length})
        </h2>
        {!showAdd && (
          <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> תיקון חדש
          </Button>
        )}
      </div>

      {showAdd && (
        <div className="rounded-xl border border-border p-4 bg-background space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">תאריך שליחה *</Label>
              <Input
                type="date"
                value={form.sent_date}
                onChange={(e) => setForm({ ...form, sent_date: e.target.value })}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">תאריך חזרה</Label>
              <Input
                type="date"
                value={form.return_date}
                onChange={(e) => setForm({ ...form, return_date: e.target.value })}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">ספק / טכנאי</Label>
              <Input
                value={form.technician_name}
                onChange={(e) => setForm({ ...form, technician_name: e.target.value })}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">תיאור התקלה</Label>
              <Textarea
                value={form.issue_description}
                onChange={(e) => setForm({ ...form, issue_description: e.target.value })}
                className="rounded-xl min-h-16"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">תיאור הטיפול</Label>
              <Textarea
                value={form.treatment_description}
                onChange={(e) => setForm({ ...form, treatment_description: e.target.value })}
                className="rounded-xl min-h-16"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="rounded-xl"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.sent_date}
            >
              {saveMutation.isPending ? "שומר..." : editingId ? "עדכון" : "הוספה"}
            </Button>
            <Button type="button" size="sm" variant="outline" className="rounded-xl" onClick={cancelEdit}>
              ביטול
            </Button>
          </div>
        </div>
      )}

      {repairs.length === 0 ? (
        <p className="text-sm text-muted-foreground">אין תיקונים רשומים</p>
      ) : (
        <div className="space-y-2">
          {repairs.map((r: any) => {
            const isOpen = !r.return_date;
            return (
              <div key={r.id} className="rounded-xl border border-border p-3 bg-background">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">
                      {format(new Date(r.sent_date), "dd/MM/yyyy")}
                      {r.return_date && ` — ${format(new Date(r.return_date), "dd/MM/yyyy")}`}
                    </span>
                    {isOpen ? (
                      <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">פתוח</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">סגור</Badge>
                    )}
                    {r.technician_name && (
                      <span className="text-xs text-muted-foreground">· {r.technician_name}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {isOpen && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-green-700 hover:bg-green-50"
                        title="סגירת תיקון (תאריך חזרה היום)"
                        onClick={() => closeMutation.mutate(r.id)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => startEdit(r)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                      onClick={() => setToDelete(r.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {r.issue_description && (
                  <p className="text-xs text-foreground mt-1">
                    <span className="font-medium">תקלה: </span>{r.issue_description}
                  </p>
                )}
                {r.treatment_description && (
                  <p className="text-xs text-foreground mt-0.5">
                    <span className="font-medium">טיפול: </span>{r.treatment_description}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת תיקון</AlertDialogTitle>
            <AlertDialogDescription>למחוק את רשומת התיקון? הפעולה אינה הפיכה.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) deleteMutation.mutate(toDelete);
              }}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default InstrumentRepairsSection;
