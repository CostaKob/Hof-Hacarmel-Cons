import { Navigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { useAuth } from "@/hooks/useAuth";
import { OPERATIONS_LOG, OPERATIONS_LOG_ALLOWED_USER_IDS } from "@/lib/operationsLog";
import { Badge } from "@/components/ui/badge";
import { ScrollText } from "lucide-react";

const CATEGORY_COLORS: Record<string, string> = {
  "ביטול עסקה": "bg-destructive/10 text-destructive border-destructive/20",
  "תיקון באג": "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20",
  "סנכרון תשלומים": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20",
  "מנגנון מיוחד": "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20",
};

const AdminOperationsLog = () => {
  const { user, loading } = useAuth();

  if (loading) return null;
  if (!user || !OPERATIONS_LOG_ALLOWED_USER_IDS.includes(user.id)) {
    return <Navigate to="/admin" replace />;
  }

  return (
    <AdminLayout title="יומן פעולות חריגות" backPath="/admin">
      <PageTitle title="יומן פעולות חריגות" />
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <ScrollText className="h-4 w-4" />
          <p>ביטולי עסקאות ידניים, תיקוני באגים ומנגנונים מיוחדים — תיעוד פנימי.</p>
        </div>
        <div className="space-y-3">
          {OPERATIONS_LOG.map((entry, i) => (
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
