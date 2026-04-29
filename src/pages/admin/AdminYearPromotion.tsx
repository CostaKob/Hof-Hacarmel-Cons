import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import StructureCloningSection from "@/components/admin/StructureCloningSection";
import { Badge } from "@/components/ui/badge";

const AdminYearPromotion = () => {
  // Load active academic year
  const { data: activeYear } = useQuery({
    queryKey: ["active-year"],
    queryFn: async () => {
      const { data } = await supabase
        .from("academic_years")
        .select("*")
        .eq("is_active", true)
        .single();
      return data;
    },
  });

  // Load next academic year (newest non-active)
  const { data: nextYear } = useQuery({
    queryKey: ["next-year"],
    queryFn: async () => {
      if (!activeYear) return null;
      const { data } = await supabase
        .from("academic_years")
        .select("*")
        .neq("id", activeYear.id)
        .order("start_date", { ascending: false })
        .limit(1)
        .single();
      return data;
    },
    enabled: !!activeYear,
  });

  return (
    <AdminLayout title="מרכז הבקרה למעבר שנה" backPath="/admin">
      <div className="space-y-5 max-w-4xl">
        {/* Header info */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <h2 className="font-semibold text-foreground text-base">מעבר שנה</h2>

          {/* FROM → TO display */}
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-4">
            <div className="flex-1 text-center">
              <p className="text-xs text-muted-foreground mb-1">משנה</p>
              <p className="font-bold text-foreground text-lg">{activeYear?.name || "—"}</p>
              <Badge className="mt-1">פעילה</Badge>
            </div>
            <span className="text-2xl text-primary font-bold">←</span>
            <div className="flex-1 text-center">
              <p className="text-xs text-muted-foreground mb-1">לשנה</p>
              <p className="font-bold text-foreground text-lg">{nextYear?.name || "—"}</p>
              {nextYear && <Badge variant="outline" className="mt-1">חדשה</Badge>}
            </div>
          </div>

          {!nextYear && (
            <p className="text-sm text-destructive">
              ⚠️ לא נמצאה שנת לימודים חדשה. יש ליצור שנה חדשה בדף <a href="/admin/academic-years" className="underline">שנות לימודים</a> לפני ביצוע מעבר.
            </p>
          )}
        </div>

        {/* Structure Cloning Section */}
        <StructureCloningSection activeYear={activeYear} nextYear={nextYear} />
      </div>
    </AdminLayout>
  );
};

export default AdminYearPromotion;
