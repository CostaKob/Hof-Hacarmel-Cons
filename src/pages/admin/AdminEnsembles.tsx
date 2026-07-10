import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { ENSEMBLE_TYPE_LABELS, ENSEMBLE_TYPE_GROUPS, DAYS_OF_WEEK_LABELS } from "@/lib/ensembleConstants";
import { SPECIAL_TRACKS } from "./AdminSpecialTrackCard";
import { useListStatePreservation, usePersistedState } from "@/hooks/useListStatePreservation";

const AdminEnsembles = () => {
  const navigate = useNavigate();
  const { selectedYearId, years } = useAcademicYear();
  useListStatePreservation("/admin/ensembles");
  const [search, setSearch] = usePersistedState<string>("/admin/ensembles", "search", "");

  const { data: ensembles = [], isLoading } = useQuery({
    queryKey: ["ensembles", selectedYearId],
    queryFn: async () => {
      let q = supabase
        .from("ensembles")
        .select("*, schools(name), ensemble_staff(role, teachers(first_name, last_name)), ensemble_students(id)")
        .order("name");
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: trackCounts = {} } = useQuery({
    queryKey: ["special-track-counts"],
    queryFn: async () => {
      const entries = await Promise.all(
        Object.entries(SPECIAL_TRACKS).map(async ([key, t]) => {
          const { count } = await supabase
            .from("students")
            .select("id", { count: "exact", head: true })
            .eq(t.column, true)
            .eq("is_active", true);
          return [key, count ?? 0] as const;
        })
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
  });

  const filtered = ensembles.filter((e: any) => {
    if (!search) return true;
    const q = search.toLowerCase();
    const teacherNames = (e.ensemble_staff ?? []).map((s: any) => `${s.teachers?.first_name ?? ""} ${s.teachers?.last_name ?? ""}`).join(" ");
    const dayLabel = e.day_of_week != null ? (DAYS_OF_WEEK_LABELS[e.day_of_week] ?? "") : "";
    const searchStr = `${e.name ?? ""} ${ENSEMBLE_TYPE_LABELS[e.ensemble_type] ?? ""} ${e.schools?.name ?? ""} ${e.room ?? ""} ${teacherNames} ${dayLabel}`.toLowerCase();
    return searchStr.includes(q);
  });

  return (
    <AdminLayout title="הרכבים" backPath="/admin">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש: שם, סוג, שלוחה, מורה, יום..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 h-12 rounded-xl"
            />
          </div>
          <Button onClick={() => navigate("/admin/ensembles/new")} className="h-12 rounded-xl text-base shrink-0">
            <Plus className="h-4 w-4" />
            הרכב חדש
          </Button>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {ensembles.length === 0 && selectedYearId
              ? `אין נתונים לשנת ${years.find(y => y.id === selectedYearId)?.name || ""}`
              : "לא נמצאו הרכבים"}
          </p>
        ) : (
          <div className="flex flex-col gap-6">
            {(() => {
              const renderCard = (e: any) => (
                <button
                  key={e.id}
                  onClick={() => navigate(`/admin/ensembles/${e.id}`)}
                  className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-sm text-right transition-all hover:shadow-md active:scale-[0.98] touch-manipulation"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-foreground">{e.name}</p>
                    {!e.is_active && <Badge variant="secondary">לא פעיל</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {ENSEMBLE_TYPE_LABELS[e.ensemble_type] || e.ensemble_type}
                    {e.schools?.name ? ` · ${e.schools.name}` : ""}
                  </p>
                  {(() => {
                    const staff = (e as any).ensemble_staff || [];
                    const lead = staff.find((s: any) => s.role === "conductor" || s.role === "instructor");
                    if (!lead?.teachers) return null;
                    return (
                      <p className="text-xs text-muted-foreground">
                        {lead.teachers.first_name} {lead.teachers.last_name}
                      </p>
                    );
                  })()}
                  <p className="text-xs text-muted-foreground">
                    {((e as any).ensemble_students || []).length} משתתפים
                    {e.day_of_week != null && ` · יום ${DAYS_OF_WEEK_LABELS[e.day_of_week] || e.day_of_week}`}
                    {e.start_time && ` · ${String(e.start_time).slice(0, 5)}`}
                    {e.room && ` · חדר ${e.room}`}
                  </p>
                </button>
              );

              const sections = ENSEMBLE_TYPE_GROUPS.map((group) => ({
                label: group.label,
                items: filtered.filter((e: any) => group.types.includes(e.ensemble_type)),
              }));
              const other = filtered.filter(
                (e: any) => !ENSEMBLE_TYPE_GROUPS.some((g) => g.types.includes(e.ensemble_type))
              );

              return (
                <>
                  {sections.map((s) =>
                    s.items.length === 0 ? null : (
                      <section key={s.label} className="flex flex-col gap-3">
                        <h2 className="text-lg font-bold text-foreground">{s.label}</h2>
                        <div className="grid gap-3 sm:grid-cols-2">{s.items.map(renderCard)}</div>
                      </section>
                    )
                  )}
                  {other.length > 0 && (
                    <section className="flex flex-col gap-3">
                      <h2 className="text-lg font-bold text-foreground">ללא קטגוריה</h2>
                      <div className="grid gap-3 sm:grid-cols-2">{other.map(renderCard)}</div>
                    </section>
                  )}
                </>
              );
            })()}
          </div>
        )}

        <section className="flex flex-col gap-3 pt-4 border-t">
          <h2 className="text-lg font-bold text-foreground">מסלולים מיוחדים</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(SPECIAL_TRACKS).map(([key, t]) => (
              <button
                key={key}
                onClick={() => navigate(`/admin/special-tracks/${key}`)}
                className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4 shadow-sm text-right transition-all hover:shadow-md active:scale-[0.98] touch-manipulation"
              >
                <p className="font-semibold text-foreground">
                  <span className="ml-1">{t.icon}</span>
                  {t.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  {trackCounts[key] ?? 0} תלמידים
                </p>
              </button>
            ))}
          </div>
        </section>
      </div>
    </AdminLayout>
  );
};

export default AdminEnsembles;
