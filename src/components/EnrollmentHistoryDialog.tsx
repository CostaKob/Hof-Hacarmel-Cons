import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS_HE } from "@/lib/lessonCounts";

interface Props {
  enrollmentId: string | null;
  studentName?: string;
  onOpenChange: (open: boolean) => void;
}

const STATUS_COLOR: Record<string, string> = {
  present: "bg-green-500/10 text-green-700 border-green-500/30",
  double_lesson: "bg-blue-500/10 text-blue-700 border-blue-500/30",
  justified_absence: "bg-yellow-500/10 text-yellow-700 border-yellow-500/30",
  unjustified_absence: "bg-red-500/10 text-red-700 border-red-500/30",
  vacation: "bg-muted text-muted-foreground border-border",
};

const EnrollmentHistoryDialog = ({ enrollmentId, studentName, onOpenChange }: Props) => {
  const { data, isLoading } = useQuery({
    queryKey: ["enrollment-history", enrollmentId],
    enabled: !!enrollmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_lines")
        .select("id, status, notes, reports!inner(report_date, notes)")
        .eq("enrollment_id", enrollmentId!);
      if (error) throw error;
      const rows = (data ?? []).map((l: any) => ({
        id: l.id,
        status: l.status,
        lineNotes: l.notes as string | null,
        reportNotes: l.reports?.notes as string | null,
        date: l.reports?.report_date as string,
      }));
      rows.sort((a, b) => (a.date < b.date ? 1 : -1));
      return rows;
    },
  });

  return (
    <Dialog open={!!enrollmentId} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle className="text-right">
            היסטוריית שיעורים{studentName ? ` — ${studentName}` : ""}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : !data || data.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין דיווחים לתלמיד זה</p>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">סה״כ {data.length} דיווחים</div>
            {data.map((r) => (
              <div key={r.id} className="rounded-xl border border-border bg-card p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {new Date(r.date).toLocaleDateString("he-IL", {
                      day: "2-digit", month: "2-digit", year: "numeric", weekday: "short",
                    })}
                  </span>
                  <Badge variant="outline" className={`text-[11px] ${STATUS_COLOR[r.status] ?? ""}`}>
                    {STATUS_LABELS_HE[r.status] ?? r.status}
                  </Badge>
                </div>
                {r.lineNotes && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">הערה: </span>
                    <span className="whitespace-pre-wrap">{r.lineNotes}</span>
                  </div>
                )}
                {r.reportNotes && (
                  <div className="text-xs text-muted-foreground">
                    <span>הערת דיווח יומי: </span>
                    <span className="whitespace-pre-wrap">{r.reportNotes}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default EnrollmentHistoryDialog;
