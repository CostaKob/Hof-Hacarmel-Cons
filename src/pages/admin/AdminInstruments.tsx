import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronLeft, Trash2 } from "lucide-react";
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

const AdminInstruments = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  const { data: instruments = [], isLoading } = useQuery({
    queryKey: ["admin-instruments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Block deletion if instrument is in use
      const [{ count: enrollCount }, { count: teacherCount }, { count: smgCount }, { count: smcgCount }] = await Promise.all([
        supabase.from("enrollments").select("id", { count: "exact", head: true }).eq("instrument_id", id),
        supabase.from("teacher_instruments").select("id", { count: "exact", head: true }).eq("instrument_id", id),
        supabase.from("school_music_groups").select("id", { count: "exact", head: true }).eq("instrument_id", id),
        supabase.from("school_music_class_groups").select("id", { count: "exact", head: true }).eq("instrument_id", id),
      ]);
      const total = (enrollCount ?? 0) + (teacherCount ?? 0) + (smgCount ?? 0) + (smcgCount ?? 0);
      if (total > 0) {
        throw new Error(`לא ניתן למחוק - כלי הנגינה בשימוש (${total} רשומות). יש להסיר את השיוכים תחילה.`);
      }
      const { error } = await supabase.from("instruments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-instruments"] });
      toast.success("כלי הנגינה נמחק");
      setToDelete(null);
    },
    onError: (err: any) => toast.error(err.message || "שגיאה במחיקה"),
  });

  const filtered = instruments.filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout title="כלי נגינה" backPath="/admin">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9 h-12 rounded-xl"
          />
        </div>
        <Button className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/instruments/new")}>
          <Plus className="h-4 w-4" /> כלי נגינה חדש
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו כלי נגינה</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-2">{filtered.length} כלי נגינה</p>
          <div className="space-y-2">
            {filtered.map((i, index) => (
              <div
                key={i.id}
                onClick={() => navigate(`/admin/instruments/${i.id}/edit`)}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">{index + 1}</span>
                  <span className="font-semibold text-foreground">{i.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      setToDelete({ id: i.id, name: i.name });
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת כלי נגינה</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את "{toDelete?.name}"? פעולה זו אינה הפיכה. אם הכלי משויך לתלמידים/מורים/קבוצות - המחיקה תחסם.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) deleteMutation.mutate(toDelete.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "מוחק..." : "מחק"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminInstruments;
