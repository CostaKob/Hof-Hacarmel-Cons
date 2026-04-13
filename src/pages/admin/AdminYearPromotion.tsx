import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import StructureCloningSection from "@/components/admin/StructureCloningSection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GRADE_PROMOTION } from "@/lib/constants";
import { Search, ArrowUpCircle, GraduationCap, Users, Loader2 } from "lucide-react";

function generateToken(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let token = "";
  for (let i = 0; i < 24; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

const AdminYearPromotion = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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

  // Load all active students with their enrollments
  const { data: students = [], isLoading } = useQuery({
    queryKey: ["year-promotion-students", activeYear?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(`
          id, first_name, last_name, grade, national_id, parent_phone, parent_name,
          parent_email, parent_national_id, city, gender, phone,
          enrollments!inner(id, academic_year_id, instrument_id, school_id, teacher_id,
            instruments(name), schools(name), teachers(first_name, last_name))
        `)
        .eq("is_active", true)
        .eq("enrollments.academic_year_id", activeYear!.id)
        .eq("enrollments.is_active", true);
      if (error) throw error;
      return data as any[];
    },
    enabled: !!activeYear?.id,
  });

  // Separate regular students from grade 12
  const { regularStudents, graduatingStudents } = useMemo(() => {
    const regular: any[] = [];
    const graduating: any[] = [];
    // Deduplicate by student ID
    const seen = new Set<string>();
    students.forEach((s) => {
      if (seen.has(s.id)) return;
      seen.add(s.id);
      if (s.grade === "יב") {
        graduating.push(s);
      } else {
        regular.push(s);
      }
    });
    return { regularStudents: regular, graduatingStudents: graduating };
  }, [students]);

  // Filter by search
  const filteredRegular = useMemo(() => {
    if (!search) return regularStudents;
    const q = search.toLowerCase();
    return regularStudents.filter(
      (s) =>
        `${s.first_name} ${s.last_name}`.toLowerCase().includes(q) ||
        s.national_id?.includes(q)
    );
  }, [regularStudents, search]);

  // Select all / none
  const selectAll = () => {
    setSelectedIds(new Set(filteredRegular.map((s) => s.id)));
  };
  const selectNone = () => setSelectedIds(new Set());

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Initialize selection
  useMemo(() => {
    if (regularStudents.length > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set(regularStudents.map((s) => s.id)));
    }
  }, [regularStudents]);

  // Promote mutation
  const promoteMutation = useMutation({
    mutationFn: async () => {
      if (!nextYear) throw new Error("לא נמצאה שנת לימודים חדשה. צור שנה חדשה תחילה.");
      if (selectedIds.size === 0) throw new Error("לא נבחרו תלמידים");

      const selectedStudents = regularStudents.filter((s) => selectedIds.has(s.id));

      // 1. Promote grades on students table + enrollments
      const gradeUpdates = selectedStudents
        .filter((s) => s.grade && GRADE_PROMOTION[s.grade])
        .map((s) => Promise.all([
          supabase
            .from("students")
            .update({ grade: GRADE_PROMOTION[s.grade]! })
            .eq("id", s.id),
          // Also update grade on current year enrollments for historical record
          ...((s.enrollments || []).map((e: any) =>
            supabase
              .from("enrollments")
              .update({ grade: s.grade })
              .eq("id", e.id)
          )),
        ]));
      await Promise.all(gradeUpdates);

      // 2. Create registration records with tokens
      const registrations = selectedStudents.map((s) => ({
        academic_year_id: nextYear.id,
        student_first_name: s.first_name,
        student_last_name: s.last_name,
        student_national_id: s.national_id || "",
        gender: s.gender || null,
        student_status: "continuing",
        branch_school_name: "",
        student_school_text: "",
        grade: GRADE_PROMOTION[s.grade] || s.grade || "",
        city: s.city || "",
        student_phone: s.phone || null,
        requested_instruments: (s.enrollments || []).map((e: any) => e.instruments?.name).filter(Boolean),
        requested_lesson_duration: "",
        parent_name: s.parent_name || "",
        parent_national_id: s.parent_national_id || "",
        parent_phone: s.parent_phone || "",
        parent_email: s.parent_email || "",
        approval_checked: false,
        status: "new" as const,
        existing_student_id: s.id,
        registration_token: generateToken(),
      }));

      const { error } = await supabase.from("registrations").insert(registrations);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(`נוצרו ${selectedIds.size} רישומי חידוש לשנה הבאה!`);
    },
    onError: (err: any) => toast.error(err.message || "שגיאה ביצירת הרישומים"),
  });

  const getPromotedGrade = (grade: string | null) => {
    if (!grade) return "—";
    const promoted = GRADE_PROMOTION[grade];
    return promoted || "בוגר";
  };

  return (
    <AdminLayout title="מרכז הבקרה למעבר שנה" backPath="/admin">
      <div className="space-y-5 max-w-4xl">
        {/* Header info */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="font-semibold text-foreground text-base">מעבר שנה</h2>
            </div>
            <div className="flex gap-3">
              <Badge variant="secondary" className="gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {regularStudents.length} תלמידים
              </Badge>
              <Badge variant="outline" className="gap-1.5 text-amber-600 border-amber-300">
                <GraduationCap className="h-3.5 w-3.5" />
                {graduatingStudents.length} בוגרים
              </Badge>
            </div>
          </div>

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

        <Tabs defaultValue="active" dir="rtl">
          <TabsList className="w-full grid grid-cols-2 rounded-xl h-11">
            <TabsTrigger value="active" className="rounded-lg">
              להעברה ({regularStudents.length})
            </TabsTrigger>
            <TabsTrigger value="graduating" className="rounded-lg">
              בוגרים - לא להעברה ({graduatingStudents.length})
            </TabsTrigger>
          </TabsList>

          {/* Active students tab */}
          <TabsContent value="active" className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                נבחרו {selectedIds.size} מתוך {filteredRegular.length}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="rounded-lg" onClick={selectAll}>
                  בחר הכל
                </Button>
                <Button variant="outline" size="sm" className="rounded-lg" onClick={selectNone}>
                  נקה
                </Button>
              </div>
            </div>

            {isLoading ? (
              <p className="text-center text-muted-foreground py-8">טוען...</p>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-right">
                      <th className="p-3 w-10"></th>
                      <th className="p-3 font-medium text-muted-foreground">שם תלמיד/ה</th>
                      <th className="p-3 font-medium text-muted-foreground hidden sm:table-cell">ת.ז.</th>
                      <th className="p-3 font-medium text-muted-foreground">כיתה נוכחית</th>
                      <th className="p-3 font-medium text-muted-foreground">כיתה צפויה</th>
                      <th className="p-3 font-medium text-muted-foreground hidden md:table-cell">כלי נגינה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredRegular.map((s) => (
                      <tr
                        key={s.id}
                        className={`transition-colors ${selectedIds.has(s.id) ? "bg-primary/5" : "hover:bg-muted/30"}`}
                      >
                        <td className="p-3">
                          <Checkbox
                            checked={selectedIds.has(s.id)}
                            onCheckedChange={() => toggleStudent(s.id)}
                          />
                        </td>
                        <td className="p-3 font-medium text-foreground">
                          {s.first_name} {s.last_name}
                        </td>
                        <td className="p-3 text-muted-foreground hidden sm:table-cell font-mono text-xs">
                          {s.national_id || "—"}
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{s.grade || "—"}</Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                            {getPromotedGrade(s.grade)}
                          </Badge>
                        </td>
                        <td className="p-3 text-muted-foreground hidden md:table-cell text-xs">
                          {(s.enrollments || [])
                            .map((e: any) => e.instruments?.name)
                            .filter(Boolean)
                            .join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filteredRegular.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">לא נמצאו תלמידים</p>
                )}
              </div>
            )}
          </TabsContent>

          {/* Graduating students tab */}
          <TabsContent value="graduating" className="mt-4">
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr className="text-right">
                    <th className="p-3 font-medium text-muted-foreground">שם תלמיד/ה</th>
                    <th className="p-3 font-medium text-muted-foreground hidden sm:table-cell">ת.ז.</th>
                    <th className="p-3 font-medium text-muted-foreground">כיתה</th>
                    <th className="p-3 font-medium text-muted-foreground">סטטוס</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {graduatingStudents.map((s) => (
                    <tr key={s.id} className="bg-amber-50/50 dark:bg-amber-950/10">
                      <td className="p-3 font-medium text-foreground">
                        {s.first_name} {s.last_name}
                      </td>
                      <td className="p-3 text-muted-foreground hidden sm:table-cell font-mono text-xs">
                        {s.national_id || "—"}
                      </td>
                      <td className="p-3">
                        <Badge variant="outline">יב</Badge>
                      </td>
                      <td className="p-3">
                        <Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-400">
                          <GraduationCap className="h-3 w-3 ml-1" />
                          בוגר — לא להעברה
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {graduatingStudents.length === 0 && (
                <p className="text-center text-muted-foreground py-8">אין תלמידי י״ב</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Action button - sticky */}
        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button
            onClick={() => promoteMutation.mutate()}
            disabled={promoteMutation.isPending || !nextYear || selectedIds.size === 0}
            className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg gap-2"
          >
            {promoteMutation.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                מעבד...
              </>
            ) : (
              <>
                <ArrowUpCircle className="h-5 w-5" />
                צור רישומי {nextYear?.name || "שנה הבאה"} ({selectedIds.size} תלמידים)
              </>
            )}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminYearPromotion;
