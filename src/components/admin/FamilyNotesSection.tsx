import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Pencil, Plus, StickyNote, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Props {
  parentNationalId: string;
  yearId?: string | null;
}

interface FamilyNoteRow {
  id: string;
  title: string | null;
  content: string;
  created_at: string;
  author_user_id: string | null;
  profiles?: { full_name: string | null } | null;
}

export function FamilyNotesSection({ parentNationalId, yearId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FamilyNoteRow | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const queryKey = ["family-notes", parentNationalId];

  const { data: notes = [], isLoading } = useQuery({
    queryKey,
    enabled: !!parentNationalId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("family_notes")
        .select("*, profiles:author_user_id(full_name)")
        .eq("parent_national_id", parentNationalId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FamilyNoteRow[];
    },
  });

  const openAdd = () => {
    setEditing(null);
    setTitle("");
    setContent("");
    setDialogOpen(true);
  };

  const openEdit = (n: FamilyNoteRow) => {
    setEditing(n);
    setTitle(n.title ?? "");
    setContent(n.content);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!content.trim()) {
      toast.error("יש להזין תוכן הערה");
      return;
    }
    setSubmitting(true);
    try {
      if (editing) {
        const { error } = await (supabase as any)
          .from("family_notes")
          .update({ title: title.trim() || null, content: content.trim() })
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("ההערה עודכנה");
      } else {
        const { error } = await (supabase as any).from("family_notes").insert({
          parent_national_id: parentNationalId,
          academic_year_id: yearId ?? null,
          author_user_id: user?.id ?? null,
          title: title.trim() || null,
          content: content.trim(),
        });
        if (error) throw error;
        toast.success("ההערה נשמרה");
      }
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey });
    } catch (e: any) {
      toast.error(e?.message ?? "שגיאה בשמירת ההערה");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await (supabase as any)
      .from("family_notes")
      .delete()
      .eq("id", deleteId);
    if (error) {
      toast.error("שגיאה במחיקה");
      return;
    }
    toast.success("ההערה נמחקה");
    setDeleteId(null);
    queryClient.invalidateQueries({ queryKey });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground flex items-center gap-2 text-base">
          <StickyNote className="h-4 w-4 text-primary" />
          הערות משפחה ({notes.length})
        </h2>
        <Button size="sm" className="rounded-xl h-10 px-4" onClick={openAdd}>
          <Plus className="ml-1 h-4 w-4" />
          הוסף הערה
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">טוען...</p>
      ) : notes.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-3">
          אין הערות משפחתיות עדיין
        </p>
      ) : (
        <div className="space-y-3">
          {notes.map((n) => (
            <div key={n.id} className="rounded-xl border border-border p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 space-y-1">
                  {n.title && (
                    <h3 className="font-semibold text-foreground text-sm">{n.title}</h3>
                  )}
                  <p className="text-sm text-foreground whitespace-pre-wrap">{n.content}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(n)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => setDeleteId(n.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{n.profiles?.full_name ?? "—"}</span>
                <span>{format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת הערה" : "הערת משפחה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="family-note-title">כותרת (אופציונלי)</Label>
              <Input
                id="family-note-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="כותרת קצרה..."
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="family-note-content">תוכן</Label>
              <Textarea
                id="family-note-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="לדוגמה: הורים גרושים, חלוקת תשלום..."
                rows={5}
                className="rounded-xl text-base"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              ביטול
            </Button>
            <Button onClick={handleSave} disabled={submitting || !content.trim()}>
              {editing ? "עדכן" : "הוסף"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת הערה</AlertDialogTitle>
            <AlertDialogDescription>
              האם למחוק את ההערה? פעולה זו אינה ניתנת לשחזור.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default FamilyNotesSection;
