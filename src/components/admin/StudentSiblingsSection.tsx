import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Users, Search, X, ArrowRight } from "lucide-react";
import {
  useConfirmedSiblings,
  useSiblingCandidates,
  useLinkSiblings,
  useUnlinkSiblings,
  type SiblingCandidate,
} from "@/hooks/useSiblings";

interface Props {
  studentId: string;
}

const StudentSiblingsSection = ({ studentId }: Props) => {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { data: siblings = [], isLoading } = useConfirmedSiblings(studentId);
  const { data: candidates = [], isFetching: loadingCandidates } = useSiblingCandidates(studentId, dialogOpen);
  const linkMut = useLinkSiblings();
  const unlinkMut = useUnlinkSiblings();

  const unconfirmedCandidates = candidates.filter((c) => !c.already_linked);

  const handleLink = (c: SiblingCandidate) => {
    linkMut.mutate({
      studentAId: studentId,
      studentBId: c.id,
      matchScore: c.match_score,
      matchReason: c.match_reason,
    });
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-foreground text-base flex items-center gap-2">
          <Users className="h-4 w-4" /> אחים ואחיות ({siblings.length})
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="h-10 rounded-xl"
          onClick={() => setDialogOpen(true)}
        >
          <Search className="h-4 w-4" /> איתור אחים
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">טוען...</p>
      ) : siblings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          לא הוגדרו אחים. לחץ "איתור אחים" כדי למצוא אחים אפשריים לפי ת.ז. הורה, טלפון או שם משפחה.
        </p>
      ) : (
        <div className="space-y-2">
          {siblings.map((s) => (
            <div
              key={s.link_id}
              className="flex items-center justify-between rounded-xl border border-border p-3 gap-2 hover:bg-muted/50 transition-colors"
            >
              <button
                type="button"
                onClick={() => navigate(`/admin/students/${s.id}`)}
                className="flex-1 min-w-0 text-right flex items-center gap-2 group"
              >
                <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                <div className="min-w-0">
                  <div className="font-medium text-foreground text-sm truncate">
                    {s.first_name} {s.last_name}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    {s.grade && <span>כיתה {s.grade}</span>}
                    {s.match_reason && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {s.match_reason}
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                title="הסר קישור"
                onClick={() => {
                  if (confirm(`להסיר את הקישור בין התלמידים?`)) {
                    unlinkMut.mutate(s.link_id);
                  }
                }}
                disabled={unlinkMut.isPending}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>איתור אחים ואחיות</DialogTitle>
            <DialogDescription>
              המערכת מציעה תלמידים לפי ת.ז. הורה זהה (100%), טלפון הורה זהה (80%),
              או שם משפחה + עיר (40%). אשר כל התאמה שנראית נכונה.
            </DialogDescription>
          </DialogHeader>

          {loadingCandidates ? (
            <p className="text-sm text-muted-foreground py-4">מחפש...</p>
          ) : unconfirmedCandidates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">לא נמצאו מועמדים חדשים.</p>
          ) : (
            <div className="space-y-2">
              {unconfirmedCandidates.map((c) => (
                <div key={c.id} className="rounded-xl border border-border p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-medium text-foreground text-sm">
                      {c.first_name} {c.last_name}
                    </div>
                    <Badge
                      variant={c.match_score >= 100 ? "default" : c.match_score >= 80 ? "secondary" : "outline"}
                      className="text-[10px]"
                    >
                      {c.match_reason} · {c.match_score}%
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.grade && `כיתה ${c.grade}`}
                    {c.city && ` · ${c.city}`}
                    {c.parent_name && ` · הורה: ${c.parent_name}`}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      className="h-8 rounded-lg text-xs flex-1"
                      onClick={() => handleLink(c)}
                      disabled={linkMut.isPending}
                    >
                      אשר כאח/ות
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="h-11 rounded-xl">
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudentSiblingsSection;
