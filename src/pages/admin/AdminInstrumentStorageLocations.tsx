import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Trash2, Save } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface Location {
  id: string;
  name: string;
  is_active: boolean;
}

const AdminInstrumentStorageLocations = () => {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [edits, setEdits] = useState<Record<string, Partial<Location>>>({});

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ["admin-storage-locations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instrument_storage_locations")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as Location[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("שם המיקום חסר");
      const { error } = await supabase.from("instrument_storage_locations").insert({ name: trimmed });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["admin-storage-locations"] });
      qc.invalidateQueries({ queryKey: ["admin-storage-locations-list"] });
      toast.success("המיקום נוסף");
    },
    onError: (e: any) => toast.error(e.message?.includes("duplicate") ? "מיקום בשם זה כבר קיים" : "שגיאה בהוספה"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Location> }) => {
      const { error } = await supabase.from("instrument_storage_locations").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["admin-storage-locations"] });
      qc.invalidateQueries({ queryKey: ["admin-storage-locations-list"] });
      toast.success("נשמר");
    },
    onError: () => toast.error("שגיאה בעדכון"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("instrument_storage_locations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-storage-locations"] });
      qc.invalidateQueries({ queryKey: ["admin-storage-locations-list"] });
      toast.success("נמחק");
    },
    onError: (e: any) => toast.error(e.message?.includes("foreign key") ? "המיקום בשימוש על ידי כלים" : "שגיאה במחיקה"),
  });

  const setEdit = (id: string, patch: Partial<Location>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const hasEdit = (id: string) => !!edits[id];

  return (
    <AdminLayout title="מיקומי אחסון כלים" backPath="/admin/inventory-instruments">
      <div className="space-y-5 max-w-3xl">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-foreground text-base">הוספת מיקום חדש</h2>
          <div className="flex gap-2">
            <Input
              placeholder="שם המיקום (לדוגמה: מחסן ראשי, שלוחת זכרון יעקב)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addMutation.mutate(newName); }}
              className="h-12 rounded-xl"
            />
            <Button
              onClick={() => addMutation.mutate(newName)}
              disabled={addMutation.isPending || !newName.trim()}
              className="h-12 rounded-xl"
            >
              <Plus className="h-4 w-4" />
              הוספה
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-base">רשימת מיקומים</h2>
            <span className="text-sm text-muted-foreground">{locations.length} מיקומים</span>
          </div>

          {isLoading ? (
            <p className="text-center text-muted-foreground py-6">טוען...</p>
          ) : locations.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">אין מיקומים</p>
          ) : (
            <div className="space-y-2">
              {locations.map((c) => {
                const draft = edits[c.id] ?? {};
                const name = draft.name ?? c.name;
                const isActive = draft.is_active ?? c.is_active;
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-3 bg-background">
                    <Input
                      value={name}
                      onChange={(e) => setEdit(c.id, { name: e.target.value })}
                      className="h-10 rounded-lg flex-1 min-w-40"
                    />
                    <div className="flex items-center gap-2 px-2">
                      <Switch
                        checked={isActive}
                        onCheckedChange={(v) => setEdit(c.id, { is_active: v })}
                      />
                      <span className="text-xs text-muted-foreground">{isActive ? "פעיל" : "מוסתר"}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10 rounded-lg"
                      disabled={!hasEdit(c.id) || updateMutation.isPending}
                      onClick={() => updateMutation.mutate({ id: c.id, patch: edits[c.id] })}
                    >
                      <Save className="h-4 w-4" />
                      שמור
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-10 rounded-lg text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>למחוק את המיקום "{c.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            אם המיקום בשימוש על ידי כלים — המחיקה תיחסם.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>ביטול</AlertDialogCancel>
                          <AlertDialogAction onClick={() => deleteMutation.mutate(c.id)}>מחק</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminInstrumentStorageLocations;
