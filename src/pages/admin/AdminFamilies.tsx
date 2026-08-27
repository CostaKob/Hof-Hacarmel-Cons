import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Search, ArrowLeft, Phone, Mail, Merge, AlertTriangle, RotateCcw, CheckCircle2, Coins } from "lucide-react";
import { useFamilyPaymentSummary } from "@/hooks/useFamilyPaymentSummary";
import { useFamiliesList } from "@/hooks/useFamilies";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { cmpHe } from "@/lib/sortHebrew";
import MergeFamiliesDialog from "@/components/admin/MergeFamiliesDialog";
import { useFamilyDupDismissals, dupPairKey } from "@/hooks/useFamilyDupDismissals";
import { useOpenRefundProcesses } from "@/hooks/useRefundProcess";
import { saveListScrollPosition, usePersistedState } from "@/hooks/useListStatePreservation";

const norm = (s?: string | null) => (s || "").trim().toLowerCase();
const pairKey = dupPairKey;

const AdminFamilies = () => {
  const navigate = useNavigate();
  const { selectedYearId, activeYear } = useAcademicYear();
  const yearId = selectedYearId ?? activeYear?.id ?? null;
  const { data: families = [], isLoading } = useFamiliesList(yearId);
  const paymentSummary = useFamilyPaymentSummary(yearId);
  const routeKey = "/admin/families";
  const [q, setQ] = usePersistedState(routeKey, "search", "");
  const [onlyMulti, setOnlyMulti] = usePersistedState(routeKey, "multi", false);
  const [onlyDup, setOnlyDup] = usePersistedState(routeKey, "duplicates", false);
  const [onlyRefund, setOnlyRefund] = usePersistedState(routeKey, "refunds", false);
  const { data: refundProcesses } = useOpenRefundProcesses(yearId);
  const refundByFamily = refundProcesses?.byFamily;
  const { dismissed, dismissPairs } = useFamilyDupDismissals();
  const [mergeTarget, setMergeTarget] = useState<{
    id: string;
    name: string | null;
  } | null>(null);

  // Possible duplicate family cells: shared child, or same children last name
  // (+ same city when known). Phone is intentionally NOT used — two parents of
  // the same family legitimately have different phones.
  const dupInfo = useMemo(() => {
    const byChild = new Map<string, string[]>();
    const byName = new Map<string, string[]>();
    families.forEach((f) => {
      (f.children_ids || []).forEach((c) =>
        byChild.set(c, [...(byChild.get(c) || []), f.parent_national_id]),
      );
      const lastNames = new Set((f.children_last_names || []).map(norm).filter(Boolean));
      const cities = new Set((f.children_cities || []).map(norm).filter(Boolean));
      lastNames.forEach((ln) => {
        const keys = cities.size ? [...cities].map((c) => `${ln}@@${c}`) : [`${ln}@@`];
        keys.forEach((k) => byName.set(k, [...(byName.get(k) || []), f.parent_national_id]));
      });
    });

    const map = new Map<string, { partners: Set<string>; reason: string }>();
    const add = (a: string, b: string, reason: string) => {
      if (a === b) return;
      const cur = map.get(a) || { partners: new Set<string>(), reason };
      cur.partners.add(b);
      if (reason === "ילד משותף") cur.reason = reason;
      map.set(a, cur);
    };
    [...byChild.values()].forEach((ids) => {
      const uniq = [...new Set(ids)];
      uniq.forEach((a) => uniq.forEach((b) => add(a, b, "ילד משותף")));
    });
    [...byName.values()].forEach((ids) => {
      const uniq = [...new Set(ids)];
      uniq.forEach((a) => uniq.forEach((b) => add(a, b, "שם משפחה + עיר")));
    });
    return map;
  }, [families]);

  const dupIds = useMemo(() => {
    const set = new Set<string>();
    dupInfo.forEach((info, id) => {
      const active = [...info.partners].some((p) => !dismissed.has(pairKey(id, p)));
      if (active) set.add(id);
    });
    return set;
  }, [dupInfo, dismissed]);


  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = [...families];
    if (onlyMulti) list = list.filter((f) => f.children_count > 1);
    if (onlyDup) list = list.filter((f) => dupIds.has(f.parent_national_id));
    if (onlyRefund) list = list.filter((f) => refundByFamily?.has(f.parent_national_id));
    if (term) {
      list = list.filter((f) => {
        return (
          (f.parent_name || "").toLowerCase().includes(term) ||
          (f.parent_national_id || "").includes(term) ||
          (f.parent_phone || "").includes(term) ||
          (f.parent_email || "").toLowerCase().includes(term) ||
          (f.children_names || []).some((n) => (n || "").toLowerCase().includes(term))
        );
      });
    }
    return list.sort((a, b) => {
      if (b.children_count !== a.children_count) return b.children_count - a.children_count;
      return cmpHe(a.parent_name || "", b.parent_name || "");
    });
  }, [families, q, onlyMulti, onlyDup, onlyRefund, dupIds, refundByFamily]);

  const multiCount = families.filter((f) => f.children_count > 1).length;
  const refundCount = families.filter((f) => refundByFamily?.has(f.parent_national_id)).length;


  return (
    <AdminLayout title="משפחות" backPath="/admin">
      <PageTitle title="משפחות" />

      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-stretch gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="חיפוש לפי שם הורה, ת.ז., טלפון או שם ילד"
              className="h-12 rounded-xl pr-10"
            />
          </div>
          <Button
            type="button"
            variant={onlyMulti ? "default" : "outline"}
            onClick={() => setOnlyMulti((v) => !v)}
            className="h-12 rounded-xl w-full sm:w-auto"
          >
            משפחות עם 2+ ילדים
            <Badge variant="secondary" className="ms-2">{multiCount}</Badge>
          </Button>
          <Button
            type="button"
            variant={onlyDup ? "default" : "outline"}
            onClick={() => setOnlyDup((v) => !v)}
            className="h-12 rounded-xl w-full sm:w-auto"
          >
            <AlertTriangle className="h-4 w-4 ms-2" />
            כפילויות אפשריות
            <Badge variant="secondary" className="ms-2">{dupIds.size}</Badge>
          </Button>
          <Button
            type="button"
            variant={onlyRefund ? "default" : "outline"}
            onClick={() => setOnlyRefund((v) => !v)}
            className="h-12 rounded-xl w-full sm:w-auto"
          >
            <RotateCcw className="h-4 w-4 ms-2" />
            בתהליך זיכוי
            <Badge variant="secondary" className="ms-2">{refundCount}</Badge>
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          {isLoading ? "טוען..." : `${filtered.length} משפחות`}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((f) => {
            const pay = paymentSummary.get((f.parent_national_id || "").trim());
            const hasCredit = !!pay && pay.credit > 0.01;
            const fullyPaid = !!pay && !hasCredit && pay.totalDue > 0 && pay.balance <= 0.01;
            return (
            <div
              key={f.parent_national_id}
              className="text-right rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Users className="h-4 w-4 text-primary" />
                    <span className="font-semibold text-foreground truncate">
                      {f.parent_name || "ללא שם"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    ת.ז. {f.parent_national_id}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant={f.children_count > 1 ? "default" : "secondary"}>
                    {f.children_count} {f.children_count === 1 ? "ילד" : "ילדים"}
                  </Badge>
                  {refundByFamily?.has(f.parent_national_id) && (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-md border font-medium whitespace-nowrap ${refundByFamily.get(f.parent_national_id)!.className}`}
                      title={refundByFamily.get(f.parent_national_id)!.label}
                    >
                      בתהליך זיכוי
                    </span>
                  )}
                  {dupIds.has(f.parent_national_id) && (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {dupInfo.get(f.parent_national_id)?.reason === "ילד משותף"
                        ? "ילד משותף"
                        : "אותה משפחה?"}
                    </Badge>
                  )}
                </div>
              </div>

              {dupIds.has(f.parent_national_id) && (
                <div className="mt-2 rounded-xl border border-destructive/30 bg-destructive/5 p-2 text-xs">
                  <div className="text-muted-foreground mb-2">
                    נמצאה התאמה לפי {dupInfo.get(f.parent_national_id)?.reason} —
                    האם זו אותה משפחה?
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 rounded-lg"
                      onClick={() =>
                        setMergeTarget({
                          id: f.parent_national_id,
                          name: f.parent_name,
                        })
                      }
                    >
                      כן, מזג
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-lg"
                      disabled={dismissPairs.isPending}
                      onClick={() =>
                        dismissPairs.mutate(
                          [...(dupInfo.get(f.parent_national_id)?.partners || [])].map(
                            (p) => [f.parent_national_id, p] as [string, string],
                          ),
                        )
                      }
                    >
                      לא, משפחות שונות
                    </Button>
                  </div>
                </div>
              )}

              <div className="text-sm text-muted-foreground mt-2 truncate">
                {(f.children_names || []).join(" · ")}
              </div>


              <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                {f.parent_phone && (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {f.parent_phone}
                  </span>
                )}
                {f.parent_email && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <Mail className="h-3 w-3" /> {f.parent_email}
                  </span>
                )}
              </div>

              {f.partner_national_id && (
                <div className="mt-2 rounded-xl border border-border bg-muted/40 p-2 text-xs">
                  <span className="text-muted-foreground">הורה שני: </span>
                  <span className="text-foreground">
                    {f.partner_name || "ללא שם"}
                    {f.partner_phone ? ` · ${f.partner_phone}` : ""}
                  </span>
                </div>
              )}



              <div className="mt-3 flex flex-col sm:flex-row gap-2">
                {dupIds.has(f.parent_national_id) && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 rounded-xl w-full sm:w-auto"
                    onClick={() =>
                      setMergeTarget({
                        id: f.parent_national_id,
                        name: f.parent_name,
                      })
                    }
                  >
                    <Merge className="h-4 w-4 ms-2" />
                    מזג משפחות
                  </Button>
                )}
                <Button
                  type="button"
                  className="h-11 rounded-xl w-full sm:flex-1"
                  onClick={() => {
                    saveListScrollPosition(routeKey);
                    navigate(`/admin/families/${encodeURIComponent(f.parent_national_id)}`);
                  }}
                >
                  פתח כרטיס <ArrowLeft className="h-4 w-4 ms-1" />
                </Button>
              </div>

            </div>
          ))}
          {!isLoading && filtered.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-12">
              לא נמצאו משפחות
            </div>
          )}
        </div>
      </div>

      {mergeTarget && (
        <MergeFamiliesDialog
          open={!!mergeTarget}
          onOpenChange={(v) => !v && setMergeTarget(null)}
          parentNationalId={mergeTarget.id}
          parentName={mergeTarget.name}
        />
      )}
    </AdminLayout>
  );
};


export default AdminFamilies;
