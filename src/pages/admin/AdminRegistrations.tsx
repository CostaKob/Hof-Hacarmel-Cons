import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import AdminLayout from "@/components/admin/AdminLayout";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Settings, AlertTriangle, Phone, Music } from "lucide-react";
import { Button } from "@/components/ui/button";
import { REGISTRATION_STATUSES, daysAgoLabel, daysAgo } from "@/lib/registrationStatuses";
import { useListStatePreservation, usePersistedState } from "@/hooks/useListStatePreservation";

const AdminRegistrations = () => {
  const navigate = useNavigate();
  const { selectedYearId, years } = useAcademicYear();
  const selectedYear = years.find((y) => y.id === selectedYearId);
  useListStatePreservation("/admin/registrations");
  const [statusFilter, setStatusFilter] = usePersistedState<string>("/admin/registrations", "status", "all");
  const [search, setSearch] = usePersistedState<string>("/admin/registrations", "search", "");

  const { data: registrations = [], isLoading } = useQuery({
    queryKey: ["admin-registrations", selectedYearId],
    enabled: !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations" as any)
        .select("*")
        .eq("academic_year_id", selectedYearId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const filtered = registrations.filter((r) => {
    if (statusFilter !== "all" && r.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const searchStr = `${r.student_first_name ?? ""} ${r.student_last_name ?? ""} ${r.parent_name ?? ""} ${r.student_national_id ?? ""} ${r.parent_national_id ?? ""} ${r.parent_phone ?? ""} ${r.student_phone ?? ""} ${r.parent_email ?? ""} ${r.city ?? ""} ${r.grade ?? ""} ${r.branch_school_name ?? ""} ${r.student_school_text ?? ""} ${r.educational_school ?? ""}`.toLowerCase();
      if (!searchStr.includes(q)) return false;
    }
    return true;
  });

  return (
    <AdminLayout title="הרשמות">
      <div className="space-y-4">
        {/* Search + Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש: שם, ת.ז, הורה, טלפון, עיר, שלוחה..."
              className="pr-9 h-12 rounded-xl"
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44 h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              {Object.entries(REGISTRATION_STATUSES).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary chips */}
        <div className="flex gap-2 flex-wrap">
          {Object.entries(REGISTRATION_STATUSES).map(([key, { label }]) => {
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
          <p className="text-center text-muted-foreground py-8">
            {registrations.length === 0 && selectedYear
              ? `אין הרשמות לשנת ${selectedYear.name}`
              : "לא נמצאו הרשמות"}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r, idx) => {
              const statusCfg = REGISTRATION_STATUSES[r.status] || REGISTRATION_STATUSES.new;
              const instruments = (r.requested_instruments as string[])?.join(", ") || "";
              const days = daysAgo(r.created_at);
              const isUrgent = days >= 7 && ["new", "in_review", "waiting_for_call"].includes(r.status);

              return (
                <button
                  key={r.id}
                  onClick={() => navigate(`/admin/registrations/${r.id}`)}
                  className="w-full rounded-xl border border-border bg-card p-4 text-right transition-all hover:shadow-sm active:scale-[0.99]"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xs text-muted-foreground w-5 shrink-0 pt-1">{idx + 1}</span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      {/* Row 1: Name + Status */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-foreground truncate text-sm">
                          {r.student_first_name} {r.student_last_name}
                          {r.grade ? <span className="text-muted-foreground font-normal"> · כיתה {r.grade}</span> : ""}
                        </p>
                        <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full shrink-0 ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>

                      {/* Row 2: Instruments + Parent phone */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {instruments && (
                          <span className="flex items-center gap-1 truncate">
                            <Music className="h-3 w-3 shrink-0" />
                            {instruments}
                          </span>
                        )}
                        {r.parent_phone && (
                          <span className="flex items-center gap-1 shrink-0">
                            <Phone className="h-3 w-3" />
                            {r.parent_phone}
                          </span>
                        )}
                      </div>

                      {/* Row 3: Days ago + match indicator */}
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className={isUrgent ? "text-destructive font-medium" : "text-muted-foreground"}>
                          {daysAgoLabel(r.created_at)}
                        </span>
                        {r.existing_student_id && r.match_type === "id_match" && (
                          <span className="text-green-600 font-medium">תלמיד קיים</span>
                        )}
                        {r.existing_student_id && r.match_type === "name_match" && (
                          <span className="flex items-center gap-0.5 text-amber-600 font-medium">
                            <AlertTriangle className="h-3 w-3" /> התאמת שם
                          </span>
                        )}
                      </div>
                    </div>
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
