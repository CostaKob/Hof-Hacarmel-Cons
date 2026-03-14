import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { GRADES, GRADE_PROMOTION } from "@/lib/constants";

const AdminYearTransition = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: years = [] } = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("*").order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [fromYearId, setFromYearId] = useState("");
  const [toYearId, setToYearId] = useState("");

  useEffect(() => {
    if (years.length >= 2) {
      const active = years.find((y: any) => y.is_active);
      if (active) {
        setFromYearId(active.id);
        const newer = years.find((y: any) => y.id !== active.id && y.start_date > active.start_date);
        if (newer) setToYearId(newer.id);
      }
    }
  }, [years]);

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["year-transition-enrollments", fromYearId],
    queryFn: async () => {
      let query = supabase
        .from("enrollments")
        .select("*, students(id, first_name, last_name, grade), teachers(first_name, last_name), instruments(name), schools(name)")
        .eq("is_active", true);
      if (fromYearId) {
        query = query.eq("academic_year_id", fromYearId);
      }
      const { data, error } = await query.order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!fromYearId,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [gradeOverrides, setGradeOverrides] = useState<Record<string, string>>({});

  // Initialize selection and grade promotions
  useEffect(() => {
    const ids = new Set(enrollments.map((e: any) => e.id));
    setSelected(ids);

    const overrides: Record<string, string> = {};
    enrollments.forEach((e: any) => {
      const currentGrade = e.students?.grade;
      if (currentGrade) {
        const promoted = GRADE_PROMOTION[currentGrade];
        if (promoted) {
          overrides[e.students.id] = promoted;
        }
        // י"ב -> null means not pre-selected
        if (currentGrade === "י\"ב") {
          ids.delete(e.id);
        }
      }
    });
    setSelected(new Set(ids));
    setGradeOverrides(overrides);
  }, [enrollments]);

  const toggleEnrollment = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const uniqueStudents = useMemo(() => {
    const map = new Map<string, any>();
    enrollments.forEach((e: any) => {
      if (e.students && !map.has(e.students.id)) {
        map.set(e.students.id, e.students);
      }
    });
    return map;
  }, [enrollments]);

  const transitionMutation = useMutation({
    mutationFn: async () => {
      const selectedEnrollments = enrollments.filter((e: any) => selected.has(e.id));
      if (selectedEnrollments.length === 0) throw new Error("לא נבחרו שיוכים");

      // 1. Update student grades
      const studentUpdates = Array.from(uniqueStudents.entries())
        .filter(([id]) => gradeOverrides[id])
        .map(([id, _]) =>
          supabase.from("students").update({ grade: gradeOverrides[id] }).eq("id", id)
        );
      await Promise.all(studentUpdates);

      // 2. Copy enrollments to new year
      const newEnrollments = selectedEnrollments.map((e: any) => ({
        student_id: e.student_id,
        teacher_id: e.teacher_id,
        instrument_id: e.instrument_id,
        school_id: e.school_id,
        enrollment_role: e.enrollment_role,
        lesson_type: e.lesson_type,
        lesson_duration_minutes: e.lesson_duration_minutes,
        instrument_start_date: e.instrument_start_date,
        price_per_lesson: e.price_per_lesson,
        teacher_rate_per_lesson: e.teacher_rate_per_lesson,
        start_date: years.find((y: any) => y.id === toYearId)?.start_date ?? e.start_date,
        is_active: true,
        academic_year_id: toYearId,
      }));

      const { error } = await supabase.from("enrollments").insert(newEnrollments);
      if (error) throw error;

      // 3. Deactivate old enrollments
      const oldIds = selectedEnrollments.map((e: any) => e.id);
      await supabase.from("enrollments").update({ is_active: false }).in("id", oldIds);

      // 4. Activate new year, deactivate old
      await supabase.from("academic_years").update({ is_active: false }).eq("id", fromYearId);
      await supabase.from("academic_years").update({ is_active: true }).eq("id", toYearId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("מעבר השנה בוצע בהצלחה!");
      navigate("/admin/academic-years");
    },
    onError: (err: any) => toast.error(err.message || "שגיאה במעבר שנה"),
  });

  return (
    <AdminLayout title="מעבר שנת לימודים" backPath="/admin/academic-years">
      <div className="space-y-5 max-w-3xl">
        {/* Year selectors */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">בחירת שנים</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>משנה</Label>
              <Select value={fromYearId} onValueChange={setFromYearId}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="בחר שנה" /></SelectTrigger>
                <SelectContent>
                  {years.map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>לשנה</Label>
              <Select value={toYearId} onValueChange={setToYearId}>
                <SelectTrigger className="h-12 rounded-xl"><SelectValue placeholder="בחר שנה" /></SelectTrigger>
                <SelectContent>
                  {years.filter((y: any) => y.id !== fromYearId).map((y: any) => (
                    <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Enrollment selection */}
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען שיוכים...</p>
        ) : enrollments.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין שיוכים פעילים בשנה שנבחרה</p>
        ) : (
          <>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-foreground text-base">שיוכים להעתקה ({selected.size}/{enrollments.length})</h2>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setSelected(new Set(enrollments.map((e: any) => e.id)))}>
                    בחר הכל
                  </Button>
                  <Button variant="outline" size="sm" className="rounded-lg" onClick={() => setSelected(new Set())}>
                    נקה
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {enrollments.map((e: any) => (
                  <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border p-3">
                    <Checkbox
                      checked={selected.has(e.id)}
                      onCheckedChange={() => toggleEnrollment(e.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">
                        {e.students?.first_name} {e.students?.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {e.instruments?.name} · {e.schools?.name} · {e.teachers?.first_name} {e.teachers?.last_name}
                      </p>
                    </div>
                    {e.students?.grade && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs text-muted-foreground">כיתה:</span>
                        <Select
                          value={gradeOverrides[e.students.id] ?? e.students.grade}
                          onValueChange={(v) => setGradeOverrides((prev) => ({ ...prev, [e.students.id]: v }))}
                        >
                          <SelectTrigger className="w-20 h-8 rounded-lg text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {GRADES.map((g) => (
                              <SelectItem key={g} value={g}>{g}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
              <Button
                onClick={() => transitionMutation.mutate()}
                disabled={transitionMutation.isPending || !toYearId || selected.size === 0}
                className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg"
              >
                {transitionMutation.isPending ? "מעביר..." : `העבר ${selected.size} שיוכים`}
              </Button>
              <Button variant="outline" onClick={() => navigate("/admin/academic-years")} className="h-14 rounded-2xl text-base px-6">
                ביטול
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminYearTransition;
