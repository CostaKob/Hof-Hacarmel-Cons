import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { Search, Settings, AlertTriangle, Phone, Music, X } from "lucide-react";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import { Button } from "@/components/ui/button";
import { REGISTRATION_STATUSES, daysAgoLabel, daysAgo } from "@/lib/registrationStatuses";
import { useListStatePreservation, usePersistedState } from "@/hooks/useListStatePreservation";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import RegistrationStatusTab from "@/components/admin/RegistrationStatusTab";

// Count potential enrollment slots from requested instruments.
// Guitar and bass guitar are separate slots (2). Classical/electric guitar variants share one slot.
const countPotentialSlots = (instruments?: string[] | null): number => {
  if (!instruments || instruments.length === 0) return 0;
  let guitarSeen = false;
  let bassSeen = false;
  let count = 0;
  for (const raw of instruments) {
    const name = (raw ?? "").trim();
    if (!name) continue;
    if (name.includes("בס")) {
      if (!bassSeen) {
        count += 1;
        bassSeen = true;
      }
      continue;
    }
    if (name.includes("גיטרה")) {
      if (!guitarSeen) {
        count += 1;
        guitarSeen = true;
      }
      continue;
    }
    count += 1;
  }
  return count;
};

const AdminRegistrations = () => {
  const navigate = useNavigate();
  const { selectedYearId, years } = useAcademicYear();
  const selectedYear = years.find((y) => y.id === selectedYearId);
  useListStatePreservation("/admin/registrations");
  const [statusFilter, setStatusFilter] = usePersistedState<string[]>("/admin/registrations", "statusMulti", []);
  const [schoolFilter, setSchoolFilter] = usePersistedState<string[]>("/admin/registrations", "schoolMulti", []);
  const [gradeFilter, setGradeFilter] = usePersistedState<string[]>("/admin/registrations", "gradeMulti", []);
  const [instrumentFilter, setInstrumentFilter] = usePersistedState<string[]>("/admin/registrations", "instrumentMulti", []);
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

  // Previous-year enrollments for all existing students in the list
  const existingIds = Array.from(
    new Set(registrations.map((r) => r.existing_student_id).filter(Boolean))
  ) as string[];

  const { data: prevByStudent = {} } = useQuery({
    queryKey: ["registrations-prev-enrollments", selectedYearId, existingIds.sort().join(",")],
    enabled: existingIds.length > 0 && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("student_id, academic_year_id, teachers(first_name, last_name), instruments(name), academic_years(start_date)")
        .in("student_id", existingIds);
      if (error) return {} as Record<string, any[]>;
      const rows = ((data ?? []) as any[]).filter(
        (e) => e.academic_year_id !== selectedYearId && e.academic_years?.start_date
      );
      const map: Record<string, any[]> = {};
      for (const e of rows) {
        (map[e.student_id] ||= []).push(e);
      }
      for (const sid of Object.keys(map)) {
        const latest = map[sid]
          .map((e) => e.academic_years.start_date as string)
          .sort()
          .reverse()[0];
        map[sid] = map[sid].filter((e) => e.academic_years.start_date === latest);
      }
      return map;
    },
  });

  const filtered = registrations.filter((r) => {
    if (statusFilter.length > 0 && !statusFilter.includes(r.status)) return false;
    if (schoolFilter.length > 0 && !schoolFilter.includes(r.branch_school_name || "ללא שלוחה")) return false;
    if (gradeFilter.length > 0 && !gradeFilter.includes(r.grade || "")) return false;
    if (instrumentFilter.length > 0) {
      const insts = (r.requested_instruments as string[] | null) || [];
      if (!insts.some((i) => instrumentFilter.includes((i || "").trim()))) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const searchStr = `${r.student_first_name ?? ""} ${r.student_last_name ?? ""} ${r.parent_name ?? ""} ${r.student_national_id ?? ""} ${r.parent_national_id ?? ""} ${r.parent_phone ?? ""} ${r.student_phone ?? ""} ${r.parent_email ?? ""} ${r.city ?? ""} ${r.grade ?? ""} ${r.branch_school_name ?? ""} ${r.student_school_text ?? ""} ${r.educational_school ?? ""}`.toLowerCase();
      if (!searchStr.includes(q)) return false;
    }
    return true;
  });


  const schoolCounts = (() => {
    const counts = new Map<string, number>();
    for (const r of registrations as any[]) {
      const name = r.branch_school_name || "ללא שלוחה";
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  })();

  const gradeOptions = (() => {
    const set = new Set<string>();
    for (const r of registrations as any[]) {
      if (r.grade) set.add(r.grade);
    }
    return Array.from(set).sort();
  })();

  const instrumentOptions = (() => {
    const set = new Set<string>();
    for (const r of registrations as any[]) {
      for (const i of (r.requested_instruments as string[] | null) || []) {
        const name = (i || "").trim();
        if (name) set.add(name);
      }
    }
    return Array.from(set).sort();
  })();

  return (
    <AdminLayout title="הרשמות" backPath="/admin">
      <PageTitle title="ניהול הרשמות" />
      <Tabs dir="rtl" defaultValue="registrations" className="flex flex-col gap-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="registrations">הרשמות</TabsTrigger>
          <TabsTrigger value="status">מצב הרשמה</TabsTrigger>
        </TabsList>

        <TabsContent value="registrations" className="mt-0">
          <div className="space-y-4">


        {/* Search + Actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש: שם, ת.ז, הורה, טלפון, ישוב מגורים, שלוחה..."
              className="pr-9 h-12 rounded-xl"
            />
          </div>
        </div>

        {/* Filters — multi-select */}
        <div className="flex flex-wrap gap-2">
          <MultiSelectFilter
            className="w-44"
            allLabel="כל הסטטוסים"
            options={Object.keys(REGISTRATION_STATUSES)}
            renderLabel={(k) => (REGISTRATION_STATUSES as any)[k]?.label ?? k}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <MultiSelectFilter
            className="w-44"
            allLabel="כל השלוחות"
            options={schoolCounts.map(([name]) => name)}
            value={schoolFilter}
            onChange={setSchoolFilter}
          />
          <MultiSelectFilter
            className="w-40"
            allLabel="כל הכיתות"
            options={gradeOptions}
            renderLabel={(g) => `כיתה ${g}`}
            value={gradeFilter}
            onChange={setGradeFilter}
          />
          <MultiSelectFilter
            className="w-48"
            allLabel="כל הכלים"
            options={instrumentOptions}
            value={instrumentFilter}
            onChange={setInstrumentFilter}
          />
          {(statusFilter.length > 0 || schoolFilter.length > 0 || gradeFilter.length > 0 || instrumentFilter.length > 0 || search) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter([]);
                setSchoolFilter([]);
                setGradeFilter([]);
                setInstrumentFilter([]);
                setSearch("");
              }}
              className="h-11 rounded-xl gap-1 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
              נקה סינון
            </Button>
          )}
        </div>

        {/* Compact summary: total + per-school chips */}
        {schoolCounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setStatusFilter([]);
                setSchoolFilter([]);
                setGradeFilter([]);
                setInstrumentFilter([]);
                setSearch("");
              }}
              className="text-[11px] px-2.5 py-1 rounded-full border bg-muted border-border hover:bg-muted/70 transition-colors"
              title="נקה סינון"
            >
              סה"כ {registrations.length} · שיוכים פוטנציאלים: {registrations.reduce((sum, r) => sum + countPotentialSlots(r.requested_instruments), 0)}
            </button>
            <Badge variant="secondary" className="rounded-full text-xs bg-sky-100 text-sky-700 border-sky-200">
              מסונן: {filtered.length} · פוטנציאל: {filtered.reduce((sum, r) => sum + countPotentialSlots(r.requested_instruments), 0)}
            </Badge>
            {schoolCounts.map(([name, count]) => (
              <button
                key={name}
                onClick={() =>
                  setSchoolFilter(schoolFilter.includes(name) ? schoolFilter.filter((s) => s !== name) : [...schoolFilter, name])
                }
                className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                  schoolFilter.includes(name) ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border"
                }`}
              >
                {name} · {count}
              </button>
            ))}
          </div>
        )}

        {/* Status chips */}
        <div className="flex gap-2 flex-wrap">
          {Object.entries(REGISTRATION_STATUSES).map(([key, { label }]) => {
            const count = registrations.filter((r) => r.status === key).length;
            if (count === 0) return null;
            return (
              <button
                key={key}
                onClick={() =>
                  setStatusFilter(statusFilter.includes(key) ? statusFilter.filter((s) => s !== key) : [...statusFilter, key])
                }
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                  statusFilter.includes(key) ? "bg-primary text-primary-foreground border-primary" : "bg-muted border-border"
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
                  className="w-full rounded-xl border border-border bg-card p-3.5 text-right transition-all hover:shadow-sm active:scale-[0.99]"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="text-xs text-muted-foreground shrink-0 pt-0.5 tabular-nums">{idx + 1}.</span>
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* Row 1: Name + grade + status */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground text-sm leading-tight break-words">
                            {r.student_first_name} {r.student_last_name}
                          </p>
                          {r.grade && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">כיתה {r.grade}</p>
                          )}
                        </div>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full shrink-0 ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                      </div>

                      {/* Row 2: Instruments */}
                      {instruments && (
                        <div className="flex items-center gap-1.5 text-xs text-foreground/80">
                          <Music className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="break-words">{instruments}</span>
                          {(() => {
                            const slots = countPotentialSlots(r.requested_instruments);
                            return slots > 1 ? (
                              <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200 font-medium">
                                {slots} שיוכים
                              </span>
                            ) : null;
                          })()}
                        </div>
                      )}

                      {/* Row 3: Phone */}
                      {r.parent_phone && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Phone className="h-3.5 w-3.5 shrink-0" />
                          <PhoneDisplay phone={r.parent_phone} stopPropagation textClassName="text-xs text-muted-foreground" />
                        </div>
                      )}

                      {/* Row 4: Branch (full width, no truncate) */}
                      {r.branch_school_name && (
                        <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                          <span className="shrink-0">🏫</span>
                          <span className="break-words">{r.branch_school_name}</span>
                        </div>
                      )}

                      {/* Row 4b: Last year's teachers */}
                      {(() => {
                        const prev = r.existing_student_id ? (prevByStudent as any)[r.existing_student_id] : null;
                        if (!prev || prev.length === 0) return null;
                        return (
                          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                            <span className="shrink-0">🕘</span>
                            <div className="break-words">
                              <span>בשנה שעברה{prev.length > 1 ? ` (${prev.length} שיוכים)` : ""}:</span>
                              <div className="flex flex-col">
                                {prev.map((e: any, i: number) => (
                                  <span key={i}>
                                    {e.teachers ? `${e.teachers.first_name} ${e.teachers.last_name}` : "ללא מורה"}
                                    {e.instruments?.name ? ` (${e.instruments.name})` : ""}
                                  </span>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })()}


                      {/* Row 5: Meta chips */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                        <span className={`text-[11px] ${isUrgent ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                          {daysAgoLabel(r.created_at)}
                        </span>
                        {r.existing_student_id && r.match_type === "id_match" && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200 font-medium">
                            תלמיד קיים
                          </span>
                        )}
                        {r.existing_student_id && r.match_type === "name_match" && (
                          <span className="flex items-center gap-0.5 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-medium">
                            <AlertTriangle className="h-3 w-3" /> התאמת שם
                          </span>
                        )}
                        {(r as any).wants_music_production && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 border border-violet-200 font-medium">
                            🎚️ הפקה
                          </span>
                        )}
                        {(r as any).wants_recital_track && (
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 border border-rose-200 font-medium">
                            🎼 רסיטל
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
        </TabsContent>

        <TabsContent value="status" className="mt-0">
          <RegistrationStatusTab />
        </TabsContent>
      </Tabs>
    </AdminLayout>

  );
};

export default AdminRegistrations;
