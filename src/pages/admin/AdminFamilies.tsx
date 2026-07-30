import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Search, ArrowLeft, Phone, Mail, Merge, AlertTriangle } from "lucide-react";
import { useFamiliesList } from "@/hooks/useFamilies";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { cmpHe } from "@/lib/sortHebrew";
import MergeFamiliesDialog from "@/components/admin/MergeFamiliesDialog";

const normPhone = (p?: string | null) =>
  (p || "").replace(/\D/g, "").slice(-10) || null;

const AdminFamilies = () => {
  const navigate = useNavigate();
  const { selectedYearId, activeYear } = useAcademicYear();
  const yearId = selectedYearId ?? activeYear?.id ?? null;
  const { data: families = [], isLoading } = useFamiliesList(yearId);
  const [q, setQ] = useState("");
  const [onlyMulti, setOnlyMulti] = useState(false);
  const [onlyDup, setOnlyDup] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<{
    id: string;
    name: string | null;
  } | null>(null);

  // Detect possible duplicate family cells: shared parent phone or shared children
  const dupIds = useMemo(() => {
    const byPhone = new Map<string, string[]>();
    const byChild = new Map<string, string[]>();
    families.forEach((f) => {
      const ph = normPhone(f.parent_phone);
      if (ph) byPhone.set(ph, [...(byPhone.get(ph) || []), f.parent_national_id]);
      (f.children_ids || []).forEach((c) =>
        byChild.set(c, [...(byChild.get(c) || []), f.parent_national_id]),
      );
    });
    const set = new Set<string>();
    [...byPhone.values(), ...byChild.values()].forEach((ids) => {
      const uniq = Array.from(new Set(ids));
      if (uniq.length > 1) uniq.forEach((id) => set.add(id));
    });
    return set;
  }, [families]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = [...families];
    if (onlyMulti) list = list.filter((f) => f.children_count > 1);
    if (onlyDup) list = list.filter((f) => dupIds.has(f.parent_national_id));
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
  }, [families, q, onlyMulti, onlyDup, dupIds]);

  const multiCount = families.filter((f) => f.children_count > 1).length;


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
            className="h-12 rounded-xl"
          >
            משפחות עם 2+ ילדים
            <Badge variant="secondary" className="ms-2">{multiCount}</Badge>
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          {isLoading ? "טוען..." : `${filtered.length} משפחות`}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((f) => (
            <button
              key={f.parent_national_id}
              onClick={() =>
                navigate(`/admin/families/${encodeURIComponent(f.parent_national_id)}`)
              }
              className="text-right rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
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
                <Badge variant={f.children_count > 1 ? "default" : "secondary"}>
                  {f.children_count} {f.children_count === 1 ? "ילד" : "ילדים"}
                </Badge>
              </div>

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

              <div className="mt-2 flex items-center justify-end text-primary text-sm">
                פתח כרטיס <ArrowLeft className="h-4 w-4 ms-1" />
              </div>
            </button>
          ))}
          {!isLoading && filtered.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-12">
              לא נמצאו משפחות
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminFamilies;
