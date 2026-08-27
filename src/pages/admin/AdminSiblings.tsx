import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Search, ArrowLeft, AlertTriangle, Link2, Loader2 } from "lucide-react";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import {
  usePendingSiblingPairs,
  useLinkSiblings,
  useDismissSiblingPair,
  useAutoLinkSiblings,
} from "@/hooks/useSiblings";
import { saveListScrollPosition, usePersistedState } from "@/hooks/useListStatePreservation";

const AdminSiblings = () => {
  const navigate = useNavigate();
  const { selectedYearId, activeYear } = useAcademicYear();
  const yearId = selectedYearId ?? activeYear?.id ?? null;
  const { data: pairs = [], isLoading } = usePendingSiblingPairs(yearId);
  const linkMut = useLinkSiblings();
  const dismissMut = useDismissSiblingPair();
  const autoMut = useAutoLinkSiblings();
  const routeKey = "/admin/siblings";
  const [q, setQ] = usePersistedState(routeKey, "search", "");
  const autoRan = useRef<string | null>(null);

  // Certain matches (same parent ID) are linked automatically on entry
  useEffect(() => {
    if (!yearId || autoRan.current === yearId) return;
    autoRan.current = yearId;
    autoMut.mutate(yearId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yearId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return pairs;
    return pairs.filter(
      (p) =>
        p.student_a_name.toLowerCase().includes(term) ||
        p.student_b_name.toLowerCase().includes(term) ||
        (p.parent_a_name || "").toLowerCase().includes(term) ||
        (p.parent_b_name || "").toLowerCase().includes(term),
    );
  }, [pairs, q]);

  const certain = filtered.filter((p) => p.match_score >= 100);
  const review = filtered.filter((p) => p.match_score < 100);

  const renderPair = (p: (typeof pairs)[number]) => (
    <div
      key={`${p.student_a_id}-${p.student_b_id}`}
      className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-3"
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">
            {p.student_a_name} · {p.student_b_name}
          </span>
        </div>
        <Badge variant={p.match_score >= 100 ? "default" : p.match_score >= 80 ? "secondary" : "outline"}>
          {p.match_reason} · {p.match_score}%
        </Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 text-xs text-muted-foreground">
        <button
          type="button"
          onClick={() => {
            saveListScrollPosition(routeKey);
            navigate(`/admin/students/${p.student_a_id}`);
          }}
          className="text-right rounded-xl border border-border p-2 hover:bg-muted/50"
        >
          <div className="text-foreground font-medium">{p.student_a_name}</div>
          <div>
            {p.student_a_grade ? `כיתה ${p.student_a_grade}` : ""}
            {p.parent_a_name ? ` · הורה: ${p.parent_a_name}` : ""}
            {p.parent_a_phone ? ` · ${p.parent_a_phone}` : ""}
          </div>
        </button>
        <button
          type="button"
          onClick={() => {
            saveListScrollPosition(routeKey);
            navigate(`/admin/students/${p.student_b_id}`);
          }}
          className="text-right rounded-xl border border-border p-2 hover:bg-muted/50"
        >
          <div className="text-foreground font-medium">{p.student_b_name}</div>
          <div>
            {p.student_b_grade ? `כיתה ${p.student_b_grade}` : ""}
            {p.parent_b_name ? ` · הורה: ${p.parent_b_name}` : ""}
            {p.parent_b_phone ? ` · ${p.parent_b_phone}` : ""}
          </div>
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          type="button"
          className="h-11 rounded-xl w-full sm:flex-1"
          disabled={linkMut.isPending}
          onClick={() =>
            linkMut.mutate({
              studentAId: p.student_a_id,
              studentBId: p.student_b_id,
              matchScore: p.match_score,
              matchReason: p.match_reason,
            })
          }
        >
          כן, אחים — חבר
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl w-full sm:w-auto"
          disabled={dismissMut.isPending}
          onClick={() =>
            dismissMut.mutate({ studentAId: p.student_a_id, studentBId: p.student_b_id })
          }
        >
          לא, לא אחים
        </Button>
      </div>
    </div>
  );

  return (
    <AdminLayout title="אחים ואחיות" backPath="/admin">
      <PageTitle title="אחים ואחיות" />

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש לפי שם תלמיד או הורה"
              className="h-12 rounded-xl pr-10"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl w-full sm:w-auto"
            disabled={autoMut.isPending}
            onClick={() => autoMut.mutate(yearId)}
          >
            {autoMut.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin ms-2" />
            ) : (
              <Link2 className="h-4 w-4 ms-2" />
            )}
            חבר אוטומטית לפי ת.ז. הורה
          </Button>
        </div>

        <div className="rounded-2xl border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          מוצגות רק התאמות בין תלמידים עם שיוך בשנה הנבחרת. אחים עם ת.ז. הורה זהה מחוברים אוטומטית.
        </div>

        <div className="text-sm text-muted-foreground">
          {isLoading ? "טוען..." : `${filtered.length} התאמות ממתינות לטיפול`}
        </div>

        {certain.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              ודאיים (ת.ז. הורה זהה) — {certain.length}
            </div>
            {certain.map(renderPair)}
          </div>
        )}

        {review.length > 0 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold text-foreground">דורש בדיקה — {review.length}</div>
            {review.map(renderPair)}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-12">
            אין אחים שממתינים לטיפול 🎉
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          className="h-11 rounded-xl"
          onClick={() => navigate("/admin/families")}
        >
          מעבר למשפחות <ArrowLeft className="h-4 w-4 ms-1" />
        </Button>
      </div>
    </AdminLayout>
  );
};

export default AdminSiblings;
