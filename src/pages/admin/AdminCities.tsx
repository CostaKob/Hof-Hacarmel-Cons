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

interface City {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

const AdminCities = () => {
  const qc = useQueryClient();
  const [newName, setNewName] = useState("");
  const [edits, setEdits] = useState<Record<string, Partial<City>>>({});

  const { data: cities = [], isLoading } = useQuery({
    queryKey: ["admin-cities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cities")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data as City[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("שם הישוב חסר");
      const { error } = await supabase.from("cities").insert({ name: trimmed });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewName("");
      qc.invalidateQueries({ queryKey: ["admin-cities"] });
      qc.invalidateQueries({ queryKey: ["cities-active"] });
      toast.success("הישוב נוסף");
    },
    onError: (e: any) => toast.error(e.message?.includes("duplicate") ? "ישוב בשם זה כבר קיים" : "שגיאה בהוספה"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<City> }) => {
      const { error } = await supabase.from("cities").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[vars.id];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["admin-cities"] });
      qc.invalidateQueries({ queryKey: ["cities-active"] });
      toast.success("נשמר");
    },
    onError: () => toast.error("שגיאה בעדכון"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("cities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-cities"] });
      qc.invalidateQueries({ queryKey: ["cities-active"] });
      toast.success("נמחק");
    },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  const setEdit = (id: string, patch: Partial<City>) => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const hasEdit = (id: string) => !!edits[id];

  return (
    <AdminLayout title="ישובי מגורים" backPath="/admin">
      <div className="space-y-5 max-w-3xl">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-foreground text-base">הוספת ישוב חדש</h2>
          <div className="flex gap-2">
            <Input
              placeholder="שם הישוב"
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
          <p className="text-xs text-muted-foreground">
            ישובים פעילים יוצגו בטפסי ההרשמה. בכל טופס יש אפשרות "אחר" להזנה חופשית של ישוב שלא ברשימה.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-foreground text-base">רשימת ישובים</h2>
            <span className="text-sm text-muted-foreground">{cities.length} ישובים</span>
          </div>

          {isLoading ? (
            <p className="text-center text-muted-foreground py-6">טוען...</p>
          ) : cities.length === 0 ? (
            <p className="text-center text-muted-foreground py-6">אין ישובים</p>
          ) : (
            <div className="space-y-2">
              {cities.map((c) => {
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
                          <AlertDialogTitle>למחוק את הישוב "{c.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>
                            המחיקה לא תשפיע על תלמידים שכבר משויכים לישוב — הטקסט יישאר בכרטיסיהם.
                            כדי להסתיר ישוב מטופסי ההרשמה במקום למחוק, ניתן להעביר אותו ל"מוסתר".
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

export default AdminCities;
