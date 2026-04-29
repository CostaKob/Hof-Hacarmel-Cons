import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Search, GraduationCap, AlertTriangle, CheckCircle2 } from "lucide-react";
import { GRADES } from "@/lib/constants";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const NO_GRADE = "__none__";

const AdminGradeFixer = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  // Find all years and pick תשפ״ו (or any year named like 2025-2026)
  const { data: years = [] } = useQuery({
    queryKey: ["academic-years-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, name, start_date, is_active")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [yearId, setYearId] = useState<string | null>(null);

  // Default to תשפ״ו if exists, else most recent inactive, else active
  const effectiveYearId = useMemo(() => {
    if (yearId) return yearId;
    if (!years.length) return null;
    const tashpav = years.find((y: any) =>
      (y.name ?? "").includes("תשפ״ו") ||
      (y.name ?? "").includes("תשפו") ||
      (y.name ?? "").includes("2025-2026")
    );
    if (tashpav) return tashpav.id;
    return years[0].id;
  }, [years, yearId]);

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["grade-fixer-enrollments", effectiveYearId],
    enabled: !!effectiveYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`
          id, grade, is_active,
          students!inner(id, first_name, last_name, grade, national_id),
          teachers(first_name, last_name),
          instruments(name)
        `)
        .eq("academic_year_id", effectiveYearId!)
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const updateGradeMutation = useMutation({
    mutationFn: async ({ enrollmentId, grade }: { enrollmentId: string; grade: string | null }) => {
      const { error } = await supabase
        .from("enrollments")
        .update({ grade })
        .eq("id", enrollmentId);
      if (error) throw error;
    },
    onMutate: ({ enrollmentId }) => setSavingId(enrollmentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["grade-fixer-enrollments", effectiveYearId] });
      toast.success("הכיתה עודכנה");
    },
    onError: (e: any) => toast.error(e.message ?? "שגיאה בעדכון"),
    onSettled: () => setSavingId(null),
  });

  // Filter by search (student name / national id)
  const filtered = useMemo(() => {
    if (!search.trim()) return enrollments;
    const q = search.toLowerCase().trim();
    return enrollments.filter((e: any) => {
      const s = e.students;
      if (!s) return false;
      return (
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
        (s.national_id ?? "").includes(q)
      );
    });
  }, [enrollments, search]);

  // Group by current enrollment grade
  const grouped = useMemo(() => {
    const map = new Map<string, any[]>();
    filtered.forEach((e: any) => {
      const key = e.grade ?? "__missing__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    });
    // Sort: missing first, then by GRADES order, then unknowns
    const order = ["__missing__", ...GRADES];
    const entries = Array.from(map.entries()).sort((a, b) => {
      const ai = order.indexOf(a[0]);
      const bi = order.indexOf(b[0]);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    // Sort each group by student name
    entries.forEach(([, list]) =>
      list.sort((a, b) =>
        `${a.students.first_name} ${a.students.last_name}`.localeCompare(
          `${b.students.first_name} ${b.students.last_name}`,
          "he"
        )
      )
    );
    return entries;
  }, [filtered]);

  const yearName = years.find((y: any) => y.id === effectiveYearId)?.name ?? "";
  const totalMissing = enrollments.filter((e: any) => !e.grade).length;
  const totalMismatch = enrollments.filter(
    (e: any) => e.grade && e.students?.grade && e.grade !== e.students.grade
  ).length;

  return (
    <AdminLayout title="תיקון כיתות בשיוכים" backPath="/admin/academic-years">
      <div className="space-y-4 max-w-4xl">
        {/* Header */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold text-foreground text-base flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-primary" />
                שנת לימודים: {yearName || "—"}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                עדכון מהיר של כיתות בשיוכים. השינוי נשמר אוטומטית.
              </p>
            </div>
            <div className="min-w-[200px]">
              <Label className="text-xs">שנה</Label>
              <Select value={effectiveYearId ?? undefined} onValueChange={setYearId}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl bg-muted/50 p-3 text-center">
              <p className="text-xl font-bold text-foreground">{enrollments.length}</p>
              <p className="text-xs text-muted-foreground">סה״כ שיוכים</p>
            </div>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3 text-center">
              <p className="text-xl font-bold text-amber-700 dark:text-amber-400">{totalMissing}</p>
              <p className="text-xs text-muted-foreground">ללא כיתה</p>
            </div>
            <div className="rounded-xl bg-rose-50 dark:bg-rose-950/30 p-3 text-center">
              <p className="text-xl font-bold text-rose-700 dark:text-rose-400">{totalMismatch}</p>
              <p className="text-xs text-muted-foreground">לא תואם לכרטיס</p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם או ת״ז..."
              className="h-12 rounded-xl pr-10"
            />
          </div>
        </div>

        {/* Groups */}
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : grouped.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין שיוכים להצגה</p>
        ) : (
          <Accordion type="multiple" defaultValue={grouped.map(([k]) => k)} className="space-y-2">
            {grouped.map(([gradeKey, list]) => {
              const isMissing = gradeKey === "__missing__";
              return (
                <AccordionItem
                  key={gradeKey}
                  value={gradeKey}
                  className={`rounded-2xl border ${isMissing ? "border-amber-300 bg-amber-50/40 dark:bg-amber-950/20" : "border-border bg-card"} shadow-sm overflow-hidden`}
                >
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`flex h-10 w-10 items-center justify-center rounded-xl font-bold ${isMissing ? "bg-amber-200 text-amber-900" : "bg-primary/10 text-primary"}`}>
                        {isMissing ? "?" : gradeKey}
                      </div>
                      <div className="flex-1 text-right">
                        <p className="font-semibold text-foreground">
                          {isMissing ? "ללא כיתה" : `כיתה ${gradeKey}`}
                        </p>
                        <p className="text-xs text-muted-foreground">{list.length} שיוכים</p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-4">
                    <div className="space-y-2">
                      {list.map((e: any) => {
                        const s = e.students;
                        const studentGrade = s?.grade ?? null;
                        const mismatch = e.grade && studentGrade && e.grade !== studentGrade;
                        const isSaving = savingId === e.id;
                        return (
                          <div
                            key={e.id}
                            className="flex items-center gap-3 rounded-xl bg-background border border-border p-3"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-foreground truncate">
                                {s.first_name} {s.last_name}
                                {mismatch && (
                                  <Badge variant="outline" className="mr-2 border-rose-400 text-rose-700 dark:text-rose-400 text-xs gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    בכרטיס: {studentGrade}
                                  </Badge>
                                )}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                                {e.instruments?.name && <span>{e.instruments.name}</span>}
                                {e.teachers && (
                                  <>
                                    <span>·</span>
                                    <span>{e.teachers.first_name} {e.teachers.last_name}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-2">
                              {isSaving && <CheckCircle2 className="h-4 w-4 text-muted-foreground animate-pulse" />}
                              <Select
                                value={e.grade ?? NO_GRADE}
                                onValueChange={(v) =>
                                  updateGradeMutation.mutate({
                                    enrollmentId: e.id,
                                    grade: v === NO_GRADE ? null : v,
                                  })
                                }
                                disabled={isSaving}
                              >
                                <SelectTrigger className="w-28 h-11 rounded-xl">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NO_GRADE}>ללא</SelectItem>
                                  {GRADES.map((g) => (
                                    <SelectItem key={g} value={g}>
                                      {g}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminGradeFixer;
