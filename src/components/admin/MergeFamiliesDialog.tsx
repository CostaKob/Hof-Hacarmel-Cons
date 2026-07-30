import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Users, AlertTriangle, Merge } from "lucide-react";
import { toast } from "sonner";

export interface MergeCandidate {
  parent_national_id: string;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  children_count: number;
  children_names: string[];
  match_reason: string | null;
  score: number;
}

export const useMergeCandidates = (nationalId?: string, enabled = true) =>
  useQuery({
    queryKey: ["family-merge-candidates", nationalId],
    enabled: !!nationalId && enabled,
    queryFn: async (): Promise<MergeCandidate[]> => {
      const { data, error } = await (supabase as any).rpc(
        "find_family_merge_candidates",
        { _national_id: nationalId },
      );
      if (error) throw error;
      return (data ?? []) as MergeCandidate[];
    },
  });

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentNationalId: string;
  parentName?: string | null;
}

const MergeFamiliesDialog = ({
  open,
  onOpenChange,
  parentNationalId,
  parentName,
}: Props) => {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const { data: candidates = [], isLoading } = useMergeCandidates(
    parentNationalId,
    open,
  );

  const mergeMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      const { data, error } = await (supabase as any).rpc("merge_families", {
        _target_national_id: parentNationalId,
        _source_national_id: sourceId,
      });
      if (error) throw error;
      return data as {
        children_count: number;
        links_added: number;
        siblings_added: number;
      };
    },
    onSuccess: (res) => {
      toast.success(
        `המשפחות מוזגו — ${res.children_count} ילדים בתא, ${res.siblings_added} קישורי אחים נוספו`,
      );
      qc.invalidateQueries({ queryKey: ["families-list"] });
      qc.invalidateQueries({ queryKey: ["family-details"] });
      qc.invalidateQueries({ queryKey: ["family-merge-candidates"] });
      setSelected(null);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "המיזוג נכשל"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto overscroll-contain text-right">
        <DialogHeader className="text-right">
          <DialogTitle className="text-right">מיזוג משפחות</DialogTitle>
          <DialogDescription className="text-right">
            צירוף תא משפחתי אחר אל {parentName || "משפחה זו"} — כל הילדים יקושרו
            לשני ההורים ויסומנו כאחים.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : candidates.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            לא נמצאו תאים משפחתיים דומים
          </div>
        ) : (
          <div className="space-y-2">
            {candidates.map((c) => (
              <button
                key={c.parent_national_id}
                type="button"
                onClick={() =>
                  setSelected(
                    selected === c.parent_national_id
                      ? null
                      : c.parent_national_id,
                  )
                }
                className={`w-full text-right rounded-xl border p-3 transition-all ${
                  selected === c.parent_national_id
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-primary" />
                      <span className="font-medium truncate">
                        {c.parent_name || "ללא שם"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      ת.ז. {c.parent_national_id}
                      {c.parent_phone ? ` · ${c.parent_phone}` : ""}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">
                      {(c.children_names || []).join(" · ")}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="secondary">{c.children_count} ילדים</Badge>
                    {c.match_reason && (
                      <span className="text-[11px] text-muted-foreground">
                        {c.match_reason}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {selected && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="text-right">
              המיזוג יקשר את כל הילדים לשני ההורים ויוסיף קישורי אחים. הפעולה
              משפיעה על חישובי הנחות ועל התא המשפחתי — לא ניתן לבטל אוטומטית.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl w-full sm:w-auto"
            onClick={() => onOpenChange(false)}
          >
            ביטול
          </Button>
          <Button
            type="button"
            className="h-12 rounded-xl w-full sm:w-auto"
            disabled={!selected || mergeMutation.isPending}
            onClick={() => selected && mergeMutation.mutate(selected)}
          >
            {mergeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin ms-2" />
            ) : (
              <Merge className="h-4 w-4 ms-2" />
            )}
            מזג משפחות
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MergeFamiliesDialog;
