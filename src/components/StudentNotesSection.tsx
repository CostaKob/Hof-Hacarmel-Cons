import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  studentId: string;
  /** When provided, "צמוד לרישום" toggle is offered (teacher view) */
  enrollmentId?: string;
}

interface NoteRow {
  id: string;
  title: string | null;
  content: string;
  enrollment_id: string | null;
  author_user_id: string | null;
  created_at: string;
  profiles?: { full_name: string | null } | null;
}

export function StudentNotesSection({ studentId, enrollmentId }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NoteRow | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [attachToEnrollment, setAttachToEnrollment] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ["student-notes", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_notes")
        .select("*, profiles:author_user_id(full_name)")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as NoteRow[];
    },
  });

  const openAdd = () => {
    setEditing(null);
    setTitle("");
    setContent("");
    setAttachToEnrollment(true);
    setDialogOpen(true);
  };

  const openEdit = (n: NoteRow) => {
    setEditing(n);
    setTitle(n.title ?? "");
    setContent(n.content);
    setAttachToEnrollment(!!n.enrollment_id);
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
        const payload: any = {
          title: title.trim() || null,
          content: content.trim(),
        };
        if (enrollmentId) {
          payload.enrollment_id = attachToEnrollment ? enrollmentId : null;
        }
        const { error } = await supabase
          .from("student_notes")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
        toast.success("ההערה עודכנה");
      } else {
        const { error } = await supabase.from("student_notes").insert({
          student_id: studentId,
          enrollment_id: enrollmentId && attachToEnrollment ? enrollmentId : null,
          author_user_id: user?.id ?? null,
          title: title.trim() || null,
          content: content.trim(),
        });
        if (error) throw error;
        toast.success("ההערה נשמרה");
      }
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["student-notes", studentId] });
    } catch (e: any) {
      toast.error(e?.message ?? "שגיאה בשמירת ההערה");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("student_notes").delete().eq("id", deleteId);
    if (error) {
      toast.error("שגיאה במחיקה");
      return;
    }
    toast.success("ההערה נמחקה");
    setDeleteId(null);
    queryClient.invalidateQueries({ queryKey: ["student-notes", studentId] });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-foreground flex items-center gap-2 text-base">
          <StickyNote className="h-4 w-4 text-primary" />
          הערות ({notes.length})
        </h2>
        <Button size="sm" className="rounded-xl h-10 px-4" onClick={openAdd}>
          <Plus className="ml-1 h-4 w-4" />
          הוסף הערה
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">טוען...</p>
      ) : notes.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-4">אין הערות עדיין</p>
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
                  {(!user || n.author_user_id === user.id || !n.author_user_id || true) && (
                    <>
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
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{n.profiles?.full_name ?? "—"}</span>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs rounded-lg">
                    {n.enrollment_id ? "צמוד לרישום" : "כללי"}
                  </Badge>
                  <span>{format(new Date(n.created_at), "dd/MM/yyyy HH:mm")}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "עריכת הערה" : "הערה חדשה"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="note-title">כותרת (אופציונלי)</Label>
              <Input
                id="note-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="כותרת קצרה..."
                className="h-12 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="note-content">תוכן</Label>
              <Textarea
                id="note-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="תוכן ההערה..."
                rows={5}
                className="rounded-xl text-base"
              />
            </div>
            {enrollmentId && (
              <div className="flex items-center gap-2 pt-1">
                <Switch
                  id="attach-enrollment"
                  checked={attachToEnrollment}
                  onCheckedChange={setAttachToEnrollment}
                />
                <Label htmlFor="attach-enrollment" className="text-sm text-muted-foreground">
                  צמוד לרישום זה (כבה להערה כללית)
                </Label>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
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
            <AlertDialogDescription>האם למחוק את ההערה? פעולה זו אינה ניתנת לשחזור.</AlertDialogDescription>
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

export default StudentNotesSection;
