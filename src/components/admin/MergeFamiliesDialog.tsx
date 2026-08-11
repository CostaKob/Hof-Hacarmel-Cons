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
  const [mode, setMode] = useState<"same_parent" | "spouse" | null>(null);
  const { data: candidates = [], isLoading } = useMergeCandidates(
    parentNationalId,
    open,
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["families-list"] });
    qc.invalidateQueries({ queryKey: ["family-details"] });
    qc.invalidateQueries({ queryKey: ["family-merge-candidates"] });
    qc.invalidateQueries({ queryKey: ["students"] });
  };

  const mergeMutation = useMutation({
    mutationFn: async (sourceId: string) => {
      if (mode === "same_parent") {
        const { data, error } = await (supabase as any).rpc(
          "merge_duplicate_parents",
          {
            _keep_national_id: parentNationalId,
            _remove_national_id: sourceId,
          },
        );
        if (error) throw error;
        return { kind: "same_parent" as const, data };
      }
      const { data, error } = await (supabase as any).rpc("merge_families", {
        _target_national_id: parentNationalId,
        _source_national_id: sourceId,
      });
      if (error) throw error;
      return { kind: "spouse" as const, data };
    },
    onSuccess: (res: any) => {
      if (res.kind === "same_parent") {
        toast.success(
          `רשומות ההורה אוחדו — ${res.data?.moved ?? 0} ילדים הועברו`,
        );
      } else {
        toast.success(
          `המשפחות מוזגו — ${res.data?.children_count ?? 0} ילדים בתא, ${res.data?.siblings_added ?? 0} קישורי אחים נוספו`,
        );
      }
      invalidate();
      setSelected(null);
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "הפעולה נכשלה"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto overscroll-contain text-right">
        <DialogHeader className="text-right">
          <DialogTitle className="text-right">מיזוג משפחות</DialogTitle>
          <DialogDescription className="text-right">
            בחר תא משפחתי אחר לחיבור אל {parentName || "משפחה זו"}, ואז בחר את
            סוג הקשר.
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
          <div className="space-y-2">
            <div className="text-sm font-medium">בחר סוג הקשר (חובה):</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("spouse")}
                className={`text-right rounded-xl border p-3 text-sm transition-all ${
                  mode === "spouse"
                    ? "border-primary bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="font-medium">בן/בת זוג (מומלץ)</div>
                <div className="text-xs text-muted-foreground mt-1">
                  שני הורים שונים באותה משפחה (אבא ואמא). שני ההורים יישמרו,
                  הילדים יקושרו לשניהם ויסומנו כאחים.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("same_parent")}
                className={`text-right rounded-xl border p-3 text-sm transition-all ${
                  mode === "same_parent"
                    ? "border-destructive bg-destructive/5"
                    : "border-border bg-card"
                }`}
              >
                <div className="font-medium text-destructive">
                  אותו הורה (כפילות) — מוחק רשומה
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  רק אם מדובר באותו אדם שנשמר פעמיים (ת.ז. שגויה). הרשומה
                  השנייה תימחק לצמיתות וכל הילדים יעברו לרשומה זו.
                </div>
              </button>
            </div>
            {mode && (
              <Alert variant={mode === "same_parent" ? "destructive" : "default"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-right">
                  {mode === "same_parent"
                    ? "שים לב: רשומת ההורה השנייה תימחק ולא ניתן לשחזר אותה אוטומטית."
                    : "הפעולה משפיעה על התא המשפחתי ועל חישובי ההנחות — לא ניתן לבטל אוטומטית."}
                </AlertDescription>
              </Alert>
            )}
          </div>
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
            {mode === "same_parent" ? "אחד רשומות הורה" : "מזג משפחות"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MergeFamiliesDialog;
