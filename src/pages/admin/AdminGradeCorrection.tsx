import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { GRADE_PROMOTION } from "@/lib/constants";
import { Search, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";

interface StudentWithMismatch {
  id: string;
  first_name: string;
  last_name: string;
  national_id: string | null;
  current_grade: string | null;
  enrollment_grade: string | null;
  promoted_grade: string | null;
}

const AdminGradeCorrection = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Load the source-of-truth year (תשפ"ו)
  const { data: sourceYear } = useQuery({
    queryKey: ["grade-correction-source-year"],
    queryFn: async () => {
      // Find תשפ"ו by name pattern, or fallback to active year
      const { data } = await supabase
        .from("academic_years")
        .select("*")
        .order("start_date", { ascending: false });
      // Try to find תשפ"ו first
      const tashpav = (data || []).find((y: any) => y.name.includes("תשפ\"ו") || y.name.includes("תשפ״ו") || y.name.includes("2025-2026") || y.name.includes("2025/2026"));
      if (tashpav) return tashpav;
      // Fallback: active year
      return (data || []).find((y: any) => y.is_active) || (data || [])[0] || null;
    },
  });

  // Load all active students with their latest enrollment grade
  const { data: students = [], isLoading } = useQuery({
    queryKey: ["grade-correction-students", sourceYear?.id],
    queryFn: async () => {
      if (!sourceYear?.id) return [];

      // Get all active students
      const { data: allStudents, error: studErr } = await supabase
        .from("students")
        .select("id, first_name, last_name, national_id, grade, is_active")
        .eq("is_active", true);
      if (studErr) throw studErr;

      // Get all enrollments for the source year
      const { data: enrollments, error: enrErr } = await supabase
        .from("enrollments")
        .select("student_id, grade")
        .eq("academic_year_id", sourceYear.id)
        .eq("is_active", true);
      if (enrErr) throw enrErr;

      // Build map: student_id -> enrollment grade (take latest non-null)
      const enrollGradeMap = new Map<string, string>();
      (enrollments || []).forEach((e: any) => {
        if (e.grade) {
          enrollGradeMap.set(e.student_id, e.grade);
        }
      });

      // Find mismatches
      const result: StudentWithMismatch[] = [];
      (allStudents || []).forEach((s: any) => {
        const enrollGrade = enrollGradeMap.get(s.id);
        if (!enrollGrade) return; // no enrollment this year

        // The promoted grade = enrollment grade + 1
        const promotedGrade = GRADE_PROMOTION[enrollGrade] || enrollGrade;

        // Mismatch if student.grade != promotedGrade
        if (s.grade !== promotedGrade) {
          result.push({
            id: s.id,
            first_name: s.first_name,
            last_name: s.last_name,
            national_id: s.national_id,
            current_grade: s.grade,
            enrollment_grade: enrollGrade,
            promoted_grade: promotedGrade,
          });
        }
      });

      return result.sort((a, b) =>
        `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "he")
      );
    },
    enabled: !!sourceYear?.id,
  });

  const filtered = useMemo(() => {
    if (!search) return students;
    const q = search.toLowerCase();
    return students.filter(
      (s) =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
        s.national_id?.includes(q)
    );
  }, [students, search]);

  // Initialize selection with all mismatched
  useMemo(() => {
    if (students.length > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set(students.map((s) => s.id)));
    }
  }, [students]);

  const toggleAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((s) => s.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Fix grades mutation
  const fixMutation = useMutation({
    mutationFn: async () => {
      const toFix = students.filter((s) => selectedIds.has(s.id));
      if (toFix.length === 0) throw new Error("לא נבחרו תלמידים");

      // Update each student's grade to the promoted_grade
      const updates = toFix.map((s) =>
        supabase
          .from("students")
          .update({ grade: s.promoted_grade })
          .eq("id", s.id)
      );
      const results = await Promise.all(updates);
      const errors = results.filter((r) => r.error);
      if (errors.length > 0) {
        throw new Error(`${errors.length} שגיאות בעדכון`);
      }
      return toFix.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ["grade-correction-students"] });
      setSelectedIds(new Set());
      toast.success(`תוקנו כיתות של ${count} תלמידים בהצלחה!`);
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <AdminLayout title="תיקון כיתות" backPath="/admin">
      <div className="space-y-5 max-w-4xl">
        {/* Explanation */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-foreground text-base">תיקון כיתות לאחר הרצות מעבר שנה</h2>
              <p className="text-sm text-muted-foreground mt-1">
                כלי זה מזהה תלמידים שהכיתה שלהם בטבלת התלמידים לא תואמת את הכיתה בשיוך של שנת {sourceYear?.name || "..."} + קידום אחד.
                לדוגמה: אם בשיוך של שנת {sourceYear?.name || "..."} התלמיד רשום בכיתה ח׳, הכיתה הנכונה שלו צריכה להיות ט׳.
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-center">
            <Badge variant="secondary" className="gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" />
              {students.length} אי-התאמות
            </Badge>
            {students.length === 0 && !isLoading && (
              <Badge variant="outline" className="gap-1.5 text-green-600 border-green-300">
                <CheckCircle2 className="h-3.5 w-3.5" />
                הכל תקין!
              </Badge>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם או ת.ז..."
            className="pr-9 h-12 rounded-xl"
          />
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : students.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-lg font-medium text-foreground">כל הכיתות תקינות!</p>
            <p className="text-sm text-muted-foreground mt-1">לא נמצאו אי-התאמות בין כיתת התלמיד לכיתת השיוך.</p>
          </div>
        ) : (
          <>
            {/* Select all / count */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                נבחרו {selectedIds.size} מתוך {filtered.length}
              </p>
              <Button variant="outline" size="sm" className="rounded-lg" onClick={toggleAll}>
                {selectedIds.size === filtered.length ? "בטל בחירה" : "בחר הכל"}
              </Button>
            </div>

            {/* Table */}
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-right">
                    <th className="p-3 w-10"></th>
                    <th className="p-3 font-medium text-muted-foreground">שם תלמיד/ה</th>
                    <th className="p-3 font-medium text-muted-foreground hidden sm:table-cell">ת.ז.</th>
                    <th className="p-3 font-medium text-muted-foreground">כיתה נוכחית (שגוי)</th>
                    <th className="p-3 font-medium text-muted-foreground">כיתה בשיוך</th>
                    <th className="p-3 font-medium text-muted-foreground">כיתה מתוקנת</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((s) => (
                    <tr
                      key={s.id}
                      className={`transition-colors ${selectedIds.has(s.id) ? "bg-primary/5" : "hover:bg-muted/30"}`}
                    >
                      <td className="p-3">
                        <Checkbox
                          checked={selectedIds.has(s.id)}
                          onCheckedChange={() => toggleOne(s.id)}
                        />
                      </td>
                      <td className="p-3 font-medium text-foreground">
                        {s.first_name} {s.last_name}
                      </td>
                      <td className="p-3 text-muted-foreground hidden sm:table-cell font-mono text-xs">
                        {s.national_id || "—"}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="border-destructive/50 text-destructive">
                          {s.current_grade || "—"}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">{s.enrollment_grade || "—"}</Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          {s.promoted_grade || "—"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Fix button */}
            <div className="sticky bottom-20 md:bottom-4 z-10">
              <Button
                onClick={() => fixMutation.mutate()}
                disabled={fixMutation.isPending || selectedIds.size === 0}
                className="w-full h-14 text-base font-semibold rounded-2xl shadow-lg gap-2"
              >
                {fixMutation.isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    מתקן...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-5 w-5" />
                    תקן כיתות ({selectedIds.size} תלמידים)
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminGradeCorrection;
