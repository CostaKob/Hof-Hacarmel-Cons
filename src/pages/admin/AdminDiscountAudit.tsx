import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { calcEnrollment } from "@/lib/paymentCalc";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Music4,
  School,
  Users,
  Guitar,
} from "lucide-react";

const normGrade = (g?: string | null) => (g ?? "").replace(/["'׳״]/g, "").trim();
const isKarmelName = (name?: string | null) => (name ?? "").includes("כרם מהר");
const ils = (n: number) => `₪${Math.round(n).toLocaleString("he-IL")}`;

interface StudentRow {
  id: string;
  name: string;
  grade: string;
  total: number;
  activeCount: number;
  atKarmel: boolean;
  discountIds: string[];
}

const StudentLink = ({ id, name }: { id: string; name: string }) => (
  <Link
    to={`/admin/students/${id}/payment`}
    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
  >
    {name}
    <ExternalLink className="h-3.5 w-3.5" />
  </Link>
);

const IssueList = ({
  rows,
  emptyText,
  renderMeta,
}: {
  rows: { student: StudentRow; note: string }[];
  emptyText: string;
  renderMeta?: (s: StudentRow) => string;
}) => {
  if (rows.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-4 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
        <CheckCircle2 className="h-5 w-5" />
        <span>{emptyText}</span>
      </div>
    );
  }
  return (
    <div className="divide-y rounded-xl border">
      {rows.map(({ student, note }) => (
        <div key={student.id + note} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <StudentLink id={student.id} name={student.name} />
            <div className="text-xs text-muted-foreground">
              כיתה {student.grade || "—"} · {student.activeCount} שיוכים · {ils(student.total)}
              {renderMeta ? ` · ${renderMeta(student)}` : ""}
            </div>
          </div>
          <Badge variant="destructive" className="shrink-0">{note}</Badge>
        </div>
      ))}
    </div>
  );
};

const AdminDiscountAudit = () => {
  const { activeYear, selectedYearId, years } = useAcademicYear();
  const yearId = selectedYearId ?? activeYear?.id;
  const year = years.find((y) => y.id === yearId);
  const queryClient = useQueryClient();
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: settings } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_settings" as any).select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: discountTypes = [] } = useQuery({
    queryKey: ["discount-types", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_types" as any)
        .select("*")
        .eq("academic_year_id", yearId!)
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: enrollments = [], isLoading: loadingEnr } = useQuery({
    queryKey: ["audit-enrollments", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(
          "id, student_id, is_active, lesson_duration_minutes, start_date, end_date, price_per_lesson, schools:school_id(name), students:student_id(id, first_name, last_name, grade, status)",
        )
        .eq("academic_year_id", yearId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: drafts = [] } = useQuery({
    queryKey: ["audit-drafts", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_payment_drafts" as any)
        .select("student_id, selected_discount_ids")
        .eq("academic_year_id", yearId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: siblingPairs = [] } = useQuery({
    queryKey: ["audit-siblings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("student_siblings" as any)
        .select("student_a_id, student_b_id");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const { data: marks = [] } = useQuery({
    queryKey: ["audit-sm-marks", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_graduate_marks" as any)
        .select("student_id, is_graduate")
        .eq("academic_year_id", yearId!);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const dt = useMemo(() => {
    const byLegacy = (k: string) => discountTypes.find((d: any) => d.legacy_key === k);
    return {
      sibling: byLegacy("sibling"),
      second: byLegacy("second_instrument"),
      branch: byLegacy("afterschool_branch"),
      schoolMusic: discountTypes.find((d: any) => (d.label ?? "").includes("מנגן")),
    };
  }, [discountTypes]);

  const students: StudentRow[] = useMemo(() => {
    if (!year || !settings) return [];
    const prices = (settings.lesson_prices ?? {}) as Record<string, number>;
    const draftMap = new Map<string, string[]>(
      drafts.map((d: any) => [d.student_id, (d.selected_discount_ids ?? []) as string[]]),
    );
    const map = new Map<string, StudentRow>();
    for (const e of enrollments) {
      const s = e.students;
      if (!s) continue;
      const prorated = calcEnrollment(
        {
          id: e.id,
          duration: e.lesson_duration_minutes,
          startDate: e.start_date,
          endDate: e.end_date,
          pricePerLessonOverride: e.price_per_lesson,
        },
        prices,
        year.start_date,
        year.end_date,
      ).prorated;
      const prev = map.get(s.id);
      const row: StudentRow = prev ?? {
        id: s.id,
        name: `${s.first_name} ${s.last_name}`,
        grade: normGrade(s.grade),
        total: 0,
        activeCount: 0,
        atKarmel: false,
        discountIds: draftMap.get(s.id) ?? [],
      };
      row.total += prorated;
      row.activeCount += 1;
      row.atKarmel = row.atKarmel || isKarmelName(e.schools?.name);
      map.set(s.id, row);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "he"));
  }, [enrollments, drafts, settings, year]);

  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const has = (s: StudentRow, id?: string) => !!id && s.discountIds.includes(id);

  // ── 1. בוגרי בי״ס מנגן (שכבה ה — בדיקה ידנית) ─────────────────────────
  const markMap = useMemo(
    () => new Map<string, boolean>(marks.map((m: any) => [m.student_id, m.is_graduate])),
    [marks],
  );
  const gradeEStudents = useMemo(() => students.filter((s) => s.grade === "ה"), [students]);

  const setMark = async (studentId: string, value: boolean) => {
    setSavingId(studentId);
    const { error } = await supabase
      .from("school_music_graduate_marks" as any)
      .upsert(
        { student_id: studentId, academic_year_id: yearId, is_graduate: value },
        { onConflict: "student_id,academic_year_id" },
      );
    setSavingId(null);
    if (error) {
      toast.error("שמירה נכשלה: " + error.message);
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["audit-sm-marks", yearId] });
  };

  const smIssues = useMemo(() => {
    const rows: { student: StudentRow; note: string }[] = [];
    for (const s of students) {
      const mark = markMap.get(s.id);
      const hasIt = has(s, dt.schoolMusic?.id);
      if (mark === true && !hasIt) rows.push({ student: s, note: "מסומן כבוגר — חסרה ההנחה" });
      if (mark !== true && hasIt) rows.push({ student: s, note: "יש הנחת מנגן ללא סימון בוגר" });
    }
    return rows;
  }, [students, markMap, dt]);

  const pendingE = gradeEStudents.filter((s) => markMap.get(s.id) === undefined);

  // ── 2. כרם מהר״ל ────────────────────────────────────────────────────────
  const karmelIssues = useMemo(() => {
    const rows: { student: StudentRow; note: string }[] = [];
    for (const s of students) {
      const hasIt = has(s, dt.branch?.id);
      if (s.atKarmel && !hasIt) rows.push({ student: s, note: "לומד בכרם מהר״ל — חסרה הנחת שלוחה" });
      if (!s.atKarmel && hasIt) rows.push({ student: s, note: "הנחת שלוחה ללא שיוך בכרם מהר״ל" });
    }
    return rows;
  }, [students, dt]);

  // ── 3. אח שני ───────────────────────────────────────────────────────────
  const siblingGroups = useMemo(() => {
    const parent = new Map<string, string>();
    const find = (x: string): string => {
      const p = parent.get(x);
      if (!p || p === x) return x;
      const r = find(p);
      parent.set(x, r);
      return r;
    };
    const union = (a: string, b: string) => {
      parent.set(find(a), find(b));
    };
    for (const p of siblingPairs) {
      if (!parent.has(p.student_a_id)) parent.set(p.student_a_id, p.student_a_id);
      if (!parent.has(p.student_b_id)) parent.set(p.student_b_id, p.student_b_id);
      union(p.student_a_id, p.student_b_id);
    }
    const groups = new Map<string, StudentRow[]>();
    for (const id of parent.keys()) {
      const s = byId.get(id);
      if (!s || s.total <= 0) continue;
      const root = find(id);
      groups.set(root, [...(groups.get(root) ?? []), s]);
    }
    return [...groups.values()].filter((g) => g.length >= 2);
  }, [siblingPairs, byId]);

  const siblingExpected = useMemo(() => {
    const expected = new Set<string>();
    for (const group of siblingGroups) {
      const sorted = [...group].sort((a, b) => b.total - a.total || a.id.localeCompare(b.id));
      for (const s of sorted.slice(1)) {
        // תלמידי כרם מהר״ל מקבלים הנחת שלוחה במקום הנחת אח
        if (s.atKarmel) continue;
        expected.add(s.id);
      }
    }
    return expected;
  }, [siblingGroups]);

  const siblingIssues = useMemo(() => {
    const rows: { student: StudentRow; note: string }[] = [];
    for (const s of students) {
      const hasIt = has(s, dt.sibling?.id);
      if (siblingExpected.has(s.id) && !hasIt) rows.push({ student: s, note: "זכאי להנחת אח שני — חסרה" });
      if (!siblingExpected.has(s.id) && hasIt) {
        const inGroup = siblingGroups.some((g) => g.some((x) => x.id === s.id));
        rows.push({
          student: s,
          note: inGroup ? "הנחת אח לתלמיד היקר בקבוצה / כרם מהר״ל" : "הנחת אח ללא אח מאושר במערכת",
        });
      }
    }
    return rows;
  }, [students, dt, siblingExpected, siblingGroups]);

  // ── 4. כלי שני ──────────────────────────────────────────────────────────
  const secondIssues = useMemo(() => {
    const rows: { student: StudentRow; note: string }[] = [];
    for (const s of students) {
      const hasIt = has(s, dt.second?.id);
      const eligible = s.activeCount >= 2 && !siblingExpected.has(s.id);
      if (eligible && !hasIt) rows.push({ student: s, note: "2+ שיוכים — חסרה הנחת כלי שני" });
      if (!eligible && hasIt && s.activeCount < 2) rows.push({ student: s, note: "הנחת כלי שני עם שיוך יחיד" });
    }
    return rows;
  }, [students, dt, siblingExpected]);

  const loading = loadingEnr || !settings;
  const totalIssues = smIssues.length + karmelIssues.length + siblingIssues.length + secondIssues.length;

  return (
    <AdminLayout title="בדיקת הנחות">
      <PageTitle title="בדיקת הנחות" />
      <div className="mx-auto max-w-4xl space-y-4 p-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              סיכום בדיקה — {year?.name ?? ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "תלמידים פעילים", value: students.length },
              { label: "ליקויים שנמצאו", value: totalIssues },
              { label: "ממתין לבדיקה ידנית", value: pendingE.length },
              { label: "קבוצות אחים", value: siblingGroups.length },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border p-3 text-center">
                <div className="text-2xl font-bold">{loading ? "—" : c.value}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        {loading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : (
          <Tabs defaultValue="sm" dir="rtl">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="sm" className="gap-1 text-xs">
                <Music4 className="h-4 w-4" /> מנגן
              </TabsTrigger>
              <TabsTrigger value="karmel" className="gap-1 text-xs">
                <School className="h-4 w-4" /> כרם מהר״ל
              </TabsTrigger>
              <TabsTrigger value="sibling" className="gap-1 text-xs">
                <Users className="h-4 w-4" /> אח שני
              </TabsTrigger>
              <TabsTrigger value="second" className="gap-1 text-xs">
                <Guitar className="h-4 w-4" /> כלי שני
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sm" className="space-y-4 pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HelpCircle className="h-4 w-4" />
                    בדיקה ידנית — שכבה ה׳ ({gradeEStudents.length})
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">
                    האם התלמיד/ה בוגר/ת תוכנית בי״ס מנגן? הסימון נשמר לשנה זו בלבד.
                  </p>
                </CardHeader>
                <CardContent className="space-y-1">
                  {gradeEStudents.length === 0 && (
                    <div className="text-sm text-muted-foreground">אין תלמידי שכבה ה׳ פעילים בשנה זו.</div>
                  )}
                  {gradeEStudents.map((s) => {
                    const mark = markMap.get(s.id);
                    return (
                      <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2 last:border-0">
                        <div className="min-w-0">
                          <StudentLink id={s.id} name={s.name} />
                          <div className="text-xs text-muted-foreground">
                            {s.activeCount} שיוכים · {ils(s.total)}
                            {has(s, dt.schoolMusic?.id) ? " · ההנחה קיימת" : ""}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={mark === true ? "default" : "outline"}
                            disabled={savingId === s.id}
                            onClick={() => setMark(s.id, true)}
                          >
                            בוגר
                          </Button>
                          <Button
                            size="sm"
                            variant={mark === false ? "secondary" : "outline"}
                            disabled={savingId === s.id}
                            onClick={() => setMark(s.id, false)}
                          >
                            לא בוגר
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">ליקויים בהנחת בוגרי מנגן ({smIssues.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <IssueList rows={smIssues} emptyText="כל הסימונים תואמים להנחות בפועל." />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="karmel" className="pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">הנחת שלוחה אחה״צ — כרם מהר״ל ({karmelIssues.length})</CardTitle>
                </CardHeader>
                <CardContent>
                  <IssueList rows={karmelIssues} emptyText="כל תלמידי כרם מהר״ל מקבלים את הנחת השלוחה." />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="sibling" className="pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">הנחת אח שני ({siblingIssues.length})</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    בכל קבוצת אחים כל התלמידים למעט היקר ביותר זכאים להנחה (למעט תלמידי כרם מהר״ל).
                  </p>
                </CardHeader>
                <CardContent>
                  <IssueList rows={siblingIssues} emptyText="כל הנחות האח מיושמות כנדרש." />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="second" className="pt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">הנחת כלי שני ({secondIssues.length})</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    תלמיד עם 2+ שיוכים פעילים זכאי, אלא אם הוא כבר מקבל הנחת אח שני.
                  </p>
                </CardHeader>
                <CardContent>
                  <IssueList rows={secondIssues} emptyText="כל הנחות הכלי השני מיושמות כנדרש." />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminDiscountAudit;
