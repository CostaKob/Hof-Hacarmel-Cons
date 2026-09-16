import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { OPERATIONS_LOG, type OperationsLogEntry } from "@/lib/operationsLog";
import { Badge } from "@/components/ui/badge";
import { ScrollText, Loader2 } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  "ביטול עסקה": "bg-destructive/10 text-destructive border-destructive/20",
  "תיקון באג": "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  "סנכרון תשלומים": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  "מנגנון מיוחד": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
  "החזר כספי": "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20",
};

const AdminOperationsLog = () => {
  const { user, loading, hasRole } = useAuth();

  const { data: liveEntries = [], isLoading } = useQuery({
    queryKey: ["operations-log"],
    enabled: !!user,
    queryFn: async (): Promise<OperationsLogEntry[]> => {
      const { data, error } = await supabase
        .from("operations_log")
        .select("occurred_at, category, title, details")
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        date: new Date(r.occurred_at).toLocaleString("he-IL", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        }),
        category: r.category,
        title: r.title,
        details: r.details ?? "",
      }));
    },
  });

  if (loading) return null;
  if (!user || !hasRole("owner")) {
    return <Navigate to="/admin" replace />;
  }

  const entries: OperationsLogEntry[] = [...liveEntries, ...OPERATIONS_LOG];

  return (
    <AdminLayout title="יומן פעולות חריגות" backPath="/admin">
      <PageTitle title="יומן פעולות חריגות" />
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <ScrollText className="h-4 w-4" />
          <p>ביטולי עסקאות, החזרים, תיקוני באגים ומנגנונים מיוחדים — נרשם אוטומטית.</p>
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        </div>
        <div className="space-y-3">
          {entries.map((entry, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-foreground">{entry.title}</p>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={CATEGORY_COLORS[entry.category] ?? ""}>
                    {entry.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">{entry.date}</span>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{entry.details}</p>
            </div>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminOperationsLog;
