import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Archive, Copy, Eye, Loader2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

interface BroadcastRow {
  id: string;
  subject: string;
  body_html: string;
  audience: string | null;
  audience_label: string | null;
  recipients_count: number;
  failed_count: number;
  recipients: any;
  sent_by_name: string | null;
  created_at: string;
}

const formatDate = (iso: string) =>
  new Date(iso).toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const AdminBroadcastArchive = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<BroadcastRow | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["broadcast-archive"],
    queryFn: async (): Promise<BroadcastRow[]> => {
      const { data, error } = await supabase
        .from("broadcast_messages")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });

  const q = search.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) =>
          r.subject.toLowerCase().includes(q) ||
          (r.audience_label ?? "").toLowerCase().includes(q),
      )
    : rows;

  const duplicate = (row: BroadcastRow) => {
    navigate("/admin/bulk-message", {
      state: {
        duplicate: { subject: row.subject, body: row.body_html, audience: row.audience },
      },
    });
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error } = await supabase.from("broadcast_messages").delete().eq("id", deleteId);
    setDeleting(false);
    setDeleteId(null);
    if (error) {
      toast.error("מחיקה נכשלה");
      return;
    }
    toast.success("הדיוור נמחק מהארכיון");
    queryClient.invalidateQueries({ queryKey: ["broadcast-archive"] });
  };

  return (
    <AdminLayout title="ארכיון דיוורים" backPath="/admin/messaging">
      <PageTitle title="ארכיון דיוורים" />
      <div className="max-w-4xl space-y-4" dir="rtl">
        <div className="flex items-center gap-2">
          <Archive className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">כל הדיוורים שנשלחו</h2>
        </div>

        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש לפי נושא או קהל יעד"
          className="h-11 rounded-xl"
        />

        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> טוען...
          </div>
        ) : filtered.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-center text-muted-foreground">
            עדיין לא נשלחו דיוורים.
          </p>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div key={r.id} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3">
                <div className="space-y-1">
                  <p className="font-semibold">{r.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(r.created_at)}
                    {r.sent_by_name ? ` · ${r.sent_by_name}` : ""}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {r.audience_label && <Badge variant="secondary">{r.audience_label}</Badge>}
                    <Badge variant="outline" className="gap-1">
                      <Users className="h-3 w-3" />
                      {r.recipients_count} נמענים
                    </Badge>
                    {r.failed_count > 0 && (
                      <Badge variant="destructive">{r.failed_count} כשלים</Badge>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <Button variant="outline" className="h-11 rounded-xl w-full" onClick={() => setViewing(r)}>
                    <Eye className="h-4 w-4" /> צפייה
                  </Button>
                  <Button variant="outline" className="h-11 rounded-xl w-full" onClick={() => duplicate(r)}>
                    <Copy className="h-4 w-4" /> שכפול לדיוור חדש
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 rounded-xl w-full text-destructive"
                    onClick={() => setDeleteId(r.id)}
                  >
                    <Trash2 className="h-4 w-4" /> מחיקה
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto overscroll-contain" dir="rtl">
          <DialogHeader>
            <DialogTitle>{viewing?.subject}</DialogTitle>
          </DialogHeader>
          <div
            className="prose prose-sm max-w-none rounded-xl border border-border bg-background p-4 text-right"
            dir="rtl"
            dangerouslySetInnerHTML={{ __html: viewing?.body_html ?? "" }}
          />
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">
              נמענים ({Array.isArray(viewing?.recipients) ? viewing?.recipients.length : 0})
            </p>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-border p-3 text-xs space-y-1">
              {(Array.isArray(viewing?.recipients) ? viewing?.recipients : []).map((rc: any, i: number) => (
                <div key={i} className="flex flex-wrap gap-2">
                  <span className="font-medium">{rc.parentName || "—"}</span>
                  <span className="text-muted-foreground">{rc.email}</span>
                  {rc.studentName && <span className="text-muted-foreground">({rc.studentName})</span>}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>למחוק את הדיוור מהארכיון?</AlertDialogTitle>
            <AlertDialogDescription>
              הפעולה מוחקת רק את הרישום בארכיון — המיילים שכבר נשלחו אינם מושפעים.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel className="h-11 rounded-xl">ביטול</AlertDialogCancel>
            <AlertDialogAction className="h-11 rounded-xl" onClick={handleDelete} disabled={deleting}>
              {deleting ? "מוחק..." : "מחיקה"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminBroadcastArchive;
