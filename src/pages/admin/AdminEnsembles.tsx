import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { ENSEMBLE_TYPE_LABELS, DAYS_OF_WEEK_LABELS } from "@/lib/ensembleConstants";
import { useState } from "react";

const AdminEnsembles = () => {
  const navigate = useNavigate();
  const { selectedYearId } = useAcademicYear();
  const [search, setSearch] = useState("");

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

  const filtered = ensembles.filter((e: any) =>
    e.name.includes(search) ||
    (ENSEMBLE_TYPE_LABELS[e.ensemble_type] || "").includes(search)
  );

  return (
    <AdminLayout title="הרכבים" backPath="/admin">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש הרכב..."
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
          <p className="text-center text-muted-foreground py-8">לא נמצאו הרכבים</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {filtered.map((e: any) => (
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
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminEnsembles;
