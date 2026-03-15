import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, User, Settings, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  new: { label: "חדש", variant: "default" },
  in_review: { label: "בטיפול", variant: "secondary" },
  approved: { label: "אושר", variant: "outline" },
  rejected: { label: "נדחה", variant: "destructive" },
  converted: { label: "הומר", variant: "outline" },
};

const AdminRegistrations = () => {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const { data: registrations = [], isLoading } = useQuery({
    queryKey: ["admin-registrations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations" as any)
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const filtered = registrations.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const fullName = `${r.student_first_name} ${r.student_last_name}`.toLowerCase();
      if (!fullName.includes(q) && !r.parent_name?.toLowerCase().includes(q) && !r.student_national_id?.includes(q))
        return false;
    }
    return true;
  });

  return (
    <AdminLayout title="הרשמות">
      <div className="space-y-4">
        {/* Header actions */}
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/registration-pages")}>
            <Settings className="h-4 w-4 ml-1" />
            ניהול דפי הרשמה
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם תלמיד, הורה או ת.ז..."
              className="pr-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              <SelectItem value="new">חדש</SelectItem>
              <SelectItem value="in_review">בטיפול</SelectItem>
              <SelectItem value="approved">אושר</SelectItem>
              <SelectItem value="rejected">נדחה</SelectItem>
              <SelectItem value="converted">הומר</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Summary */}
        <div className="flex gap-2 flex-wrap">
          {Object.entries(STATUS_MAP).map(([key, { label }]) => {
            const count = registrations.filter((r) => r.status === key).length;
            if (count === 0) return null;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(statusFilter === key ? "all" : key)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  statusFilter === key ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border"
                }`}
              >
                {label} ({count})
              </button>
            );
          })}
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">לא נמצאו הרשמות</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r, idx) => {
              const status = STATUS_MAP[r.status] || STATUS_MAP.new;
              return (
                <button
                  key={r.id}
                  onClick={() => navigate(`/admin/registrations/${r.id}`)}
                  className="w-full flex items-center gap-3 rounded-xl border border-border bg-card p-4 text-right transition-all hover:shadow-sm active:scale-[0.99]"
                >
                  <span className="text-xs text-muted-foreground w-6 shrink-0">{idx + 1}</span>
                  <div className="rounded-full bg-muted p-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {r.student_first_name} {r.student_last_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.parent_name} · {(r.requested_instruments as string[])?.join(", ")}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    {r.existing_student_id && (
                      <span className="text-[10px] text-green-600 font-medium">תלמיד קיים</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminRegistrations;
