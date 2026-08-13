import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Users, ClipboardList, Music, School } from "lucide-react";

const GRADE_ORDER = ["א", "ב", "ג", "ד", "ה", "ו", "ז", "ח", "ט", "י", "יא", "יב"];

const DEPARTMENTS: { name: string; match: (inst: string) => boolean }[] = [
  { name: "מחלקת כלי קשת", match: (i) => ["כינור", "ויולה", "צ׳לו", "צ'לו", "צלו"].includes(i) },
  {
    name: "מחלקת כלי נשיפה",
    match: (i) =>
      ["חליל צד", "חלילית", "קלרינט", "קלרינט בס", "סקסופון", "חצוצרה", "קרן יער", "בריטון", "טרומבון", "טובה"].includes(i),
  },
  { name: "מחלקת כלי מקלדת", match: (i) => i.includes("פסנתר") },
  { name: "מחלקת כלי פריטה", match: (i) => i.includes("גיטרה") },
  { name: "מחלקת פיתוח קול", match: (i) => i.includes("פיתוח קול") },
  {
    name: "מחלקת תאוריה וקומפוזיציה",
    match: (i) => i.includes("קומפוזיציה") || i.includes("תאוריה") || i.includes("הלחנה"),
  },
  {
    name: "מחלקת כלי הקשה",
    match: (i) => i.includes("כלי הקשה") || i.includes("תופים") || i.includes("קחון"),
  },
];

const departmentOf = (instrument: string): string => {
  const i = (instrument ?? "").trim();
  return DEPARTMENTS.find((d) => d.match(i))?.name ?? "אחר";
};

const normGrade = (g?: string | null) => {
  const v = (g ?? "").replace(/["'׳״]/g, "").trim();
  return v || "ללא כיתה";
};

const CHART_COLORS = [
  "hsl(var(--primary))",
  "#34d399",
  "#f59e0b",
  "#a78bfa",
  "#f472b6",
  "#38bdf8",
  "#fb7185",
  "#4ade80",
  "#facc15",
  "#c084fc",
  "#2dd4bf",
  "#fb923c",
];

const StatCard = ({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: any;
  label: string;
  value: number | string;
  tone?: "default" | "green" | "amber";
}) => (
  <div
    className={`rounded-2xl border p-4 shadow-sm ${
      tone === "green"
        ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900"
        : tone === "amber"
        ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900"
        : "bg-card border-border"
    }`}
  >
    <div className="flex items-center gap-2 text-muted-foreground text-xs">
      <Icon className="h-4 w-4" />
      {label}
    </div>
    <div className="mt-1 text-3xl font-bold">{value}</div>
  </div>
);

const AdminEnrollmentStats = () => {
  const { selectedYearId, years } = useAcademicYear();
  const selectedYear = years.find((y) => y.id === selectedYearId);

  const { data: enrollments = [], isLoading: eLoading } = useQuery({
    queryKey: ["stats-enrollments", selectedYearId],
    enabled: !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("id, is_active, grade, student_id, students(id, first_name, last_name, grade), instruments(name), schools(name)")
        .eq("academic_year_id", selectedYearId!)
        .eq("is_active", true);
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: registrations = [], isLoading: rLoading } = useQuery({
    queryKey: ["stats-registrations", selectedYearId],
    enabled: !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, status, student_status, grade, requested_instruments, branch_school_name")
        .eq("academic_year_id", selectedYearId!);
      if (error) throw error;
      return data as any[];
    },
  });

  // Students that had enrollments in earlier years => "continuing"
  const priorYearIds = useMemo(() => {
    if (!selectedYear) return [] as string[];
    return years
      .filter((y) => new Date(y.start_date).getTime() < new Date(selectedYear.start_date).getTime())
      .map((y) => y.id);
  }, [years, selectedYear]);

  const { data: priorStudentIds = new Set<string>() } = useQuery({
    queryKey: ["stats-prior-students", priorYearIds.sort().join(",")],
    enabled: priorYearIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("student_id")
        .in("academic_year_id", priorYearIds);
      if (error) throw error;
      return new Set<string>((data as any[]).map((r) => r.student_id).filter(Boolean));
    },
  });

  const pendingRegs = useMemo(
    () => registrations.filter((r) => r.status !== "converted"),
    [registrations]
  );


  const stats = useMemo(() => {
    // Assigned students (unique)
    const assignedStudents = new Map<string, { grade: string }>();
    const instrumentCounts = new Map<string, number>();
    const schoolCounts = new Map<string, number>();
    const deptEnrollments = new Map<string, number>();
    const deptStudents = new Map<string, Set<string>>();
    const deptInstrumentCounts = new Map<string, Map<string, number>>();

    for (const e of enrollments) {
      const sid = e.student_id;
      if (sid && !assignedStudents.has(sid)) {
        assignedStudents.set(sid, { grade: normGrade(e.grade ?? e.students?.grade) });
      }
      const inst = (e.instruments?.name ?? "").trim();
      if (inst) {
        instrumentCounts.set(inst, (instrumentCounts.get(inst) ?? 0) + 1);
        const dept = departmentOf(inst);
        deptEnrollments.set(dept, (deptEnrollments.get(dept) ?? 0) + 1);
        if (!deptInstrumentCounts.has(dept)) deptInstrumentCounts.set(dept, new Map());
        const dm = deptInstrumentCounts.get(dept)!;
        dm.set(inst, (dm.get(inst) ?? 0) + 1);
        if (sid) {
          const set = deptStudents.get(dept) ?? new Set<string>();
          set.add(sid);
          deptStudents.set(dept, set);
        }
      }
      const school = (e.schools?.name ?? "").trim() || "ללא שלוחה";
      schoolCounts.set(school, (schoolCounts.get(school) ?? 0) + 1);
    }

    // New vs continuing among assigned students
    let assignedContinuing = 0;
    for (const sid of assignedStudents.keys()) {
      if (priorStudentIds.has(sid)) assignedContinuing++;
    }
    const assignedNew = assignedStudents.size - assignedContinuing;

    const pendingInstrumentCounts = new Map<string, number>();
    const pendingGradeCounts = new Map<string, number>();
    const pendingDeptCounts = new Map<string, number>();
    const pendingDeptInstrumentCounts = new Map<string, Map<string, number>>();
    let pendingNew = 0;
    let pendingContinuing = 0;
    for (const r of pendingRegs) {
      pendingGradeCounts.set(normGrade(r.grade), (pendingGradeCounts.get(normGrade(r.grade)) ?? 0) + 1);
      const st = (r.student_status ?? "").toString().trim();
      if (st === "ממשיך" || st === "continuing") pendingContinuing++;
      else pendingNew++;
      for (const raw of (r.requested_instruments as string[] | null) ?? []) {
        const name = (raw ?? "").trim();
        if (!name) continue;
        pendingInstrumentCounts.set(name, (pendingInstrumentCounts.get(name) ?? 0) + 1);
        const dept = departmentOf(name);
        pendingDeptCounts.set(dept, (pendingDeptCounts.get(dept) ?? 0) + 1);
        if (!pendingDeptInstrumentCounts.has(dept)) pendingDeptInstrumentCounts.set(dept, new Map());
        const dm = pendingDeptInstrumentCounts.get(dept)!;
        dm.set(name, (dm.get(name) ?? 0) + 1);
      }
    }


    const assignedGradeCounts = new Map<string, number>();
    for (const s of assignedStudents.values()) {
      assignedGradeCounts.set(s.grade, (assignedGradeCounts.get(s.grade) ?? 0) + 1);
    }

    const gradeKeys = Array.from(
      new Set([...assignedGradeCounts.keys(), ...pendingGradeCounts.keys()])
    ).sort((a, b) => {
      const ia = GRADE_ORDER.indexOf(a);
      const ib = GRADE_ORDER.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, "he");
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    const gradeData = gradeKeys.map((g) => ({
      grade: g === "ללא כיתה" ? g : `כיתה ${g}`,
      משובצים: assignedGradeCounts.get(g) ?? 0,
      "טרם שובצו": pendingGradeCounts.get(g) ?? 0,
    }));

    const instrumentData = Array.from(instrumentCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const pendingInstrumentData = Array.from(pendingInstrumentCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const schoolData = Array.from(schoolCounts.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    const deptNames = Array.from(
      new Set([...DEPARTMENTS.map((d) => d.name), ...deptEnrollments.keys(), ...pendingDeptCounts.keys()])
    );
    const departmentData = deptNames
      .map((name) => {
        const instMap = deptInstrumentCounts.get(name) ?? new Map<string, number>();
        const pendingInstMap = pendingDeptInstrumentCounts.get(name) ?? new Map<string, number>();
        const instruments = Array.from(new Set([...instMap.keys(), ...pendingInstMap.keys()])).sort((a, b) => {
          const ca = (instMap.get(a) ?? 0) + (pendingInstMap.get(a) ?? 0);
          const cb = (instMap.get(b) ?? 0) + (pendingInstMap.get(b) ?? 0);
          return cb - ca;
        });
        return {
          name,
          students: deptStudents.get(name)?.size ?? 0,
          enrollmentsCount: deptEnrollments.get(name) ?? 0,
          pending: pendingDeptCounts.get(name) ?? 0,
          instruments: instruments.map((inst) => ({
            name: inst,
            assigned: instMap.get(inst) ?? 0,
            pending: pendingInstMap.get(inst) ?? 0,
          })),
        };
      })
      .filter((d) => d.enrollmentsCount > 0 || d.pending > 0)
      .sort((a, b) => b.enrollmentsCount - a.enrollmentsCount);

    return {
      assignedCount: assignedStudents.size,
      enrollmentCount: enrollments.length,
      pendingCount: pendingRegs.length,
      assignedNew,
      assignedContinuing,
      pendingNew,
      pendingContinuing,
      departmentData,
      gradeData,
      instrumentData,
      pendingInstrumentData,
      schoolData,
    };
  }, [enrollments, pendingRegs, priorStudentIds]);


  const isLoading = eLoading || rLoading;
  const maxInstrument = stats.instrumentData[0]?.value ?? 1;

  return (
    <AdminLayout title="דוח תלמידים ושיבוצים" backPath="/admin">
      <PageTitle title="דוח תלמידים ושיבוצים" />
      <div className="space-y-5" dir="rtl">
        <div className="text-sm text-muted-foreground">
          שנת לימודים: <span className="font-semibold text-foreground">{selectedYear?.name ?? "—"}</span>
        </div>

        {isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-muted-foreground">
            טוען נתונים…
          </div>
        ) : (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <StatCard icon={Users} label="תלמידים משובצים" value={stats.assignedCount} tone="green" />
              <StatCard icon={Music} label="סה״כ שיוכים" value={stats.enrollmentCount} />
              <StatCard icon={ClipboardList} label="נרשמים שטרם שובצו" value={stats.pendingCount} tone="amber" />
              <StatCard icon={School} label="שלוחות פעילות" value={stats.schoolData.length} />
            </div>

            {/* New vs continuing */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="font-semibold mb-3">חדשים מול ממשיכים — תלמידים משובצים</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900 p-3 text-center">
                    <div className="text-3xl font-bold text-sky-700 dark:text-sky-400">{stats.assignedNew}</div>
                    <div className="text-xs text-sky-700 dark:text-sky-400">חדשים</div>
                  </div>
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 p-3 text-center">
                    <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-400">{stats.assignedContinuing}</div>
                    <div className="text-xs text-emerald-700 dark:text-emerald-400">ממשיכים</div>
                  </div>
                </div>
                <div className="h-56 mt-3" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "חדשים", value: stats.assignedNew },
                          { name: "ממשיכים", value: stats.assignedContinuing },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(d: any) => `${d.name} (${d.value})`}
                        labelLine={false}
                      >
                        <Cell fill="#38bdf8" />
                        <Cell fill="#34d399" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  ממשיך = תלמיד שהיה לו שיוך באחת השנים הקודמות.
                </p>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="font-semibold mb-3">חדשים מול ממשיכים — נרשמים שטרם שובצו</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-900 p-3 text-center">
                    <div className="text-3xl font-bold text-sky-700 dark:text-sky-400">{stats.pendingNew}</div>
                    <div className="text-xs text-sky-700 dark:text-sky-400">חדשים</div>
                  </div>
                  <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 p-3 text-center">
                    <div className="text-3xl font-bold text-amber-700 dark:text-amber-400">{stats.pendingContinuing}</div>
                    <div className="text-xs text-amber-700 dark:text-amber-400">ממשיכים</div>
                  </div>
                </div>
                <div className="h-56 mt-3" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "חדשים", value: stats.pendingNew },
                          { name: "ממשיכים", value: stats.pendingContinuing },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(d: any) => `${d.name} (${d.value})`}
                        labelLine={false}
                      >
                        <Cell fill="#38bdf8" />
                        <Cell fill="#f59e0b" />
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-xs text-muted-foreground mt-2">לפי הסטטוס שנבחר בטופס ההרשמה.</p>
              </div>
            </div>

            {/* Departments */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h2 className="font-semibold mb-3">חלוקה למחלקות</h2>
              <div className="h-80" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.departmentData.map((d) => ({
                      name: d.name.replace("מחלקת ", ""),
                      משובצים: d.enrollmentsCount,
                      "טרם שובצו": d.pending,
                    }))}
                    margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="משובצים" stackId="a" fill="hsl(var(--primary))" />
                    <Bar dataKey="טרם שובצו" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-right py-2 font-medium">מחלקה</th>
                      <th className="text-right py-2 font-medium">תלמידים</th>
                      <th className="text-right py-2 font-medium">שיוכים</th>
                      <th className="text-right py-2 font-medium">בקשות שטרם שובצו</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.departmentData.map((d) => (
                      <tr key={d.name} className="border-b border-border/50">
                        <td className="py-2">{d.name}</td>
                        <td className="py-2 font-semibold">{d.students}</td>
                        <td className="py-2">{d.enrollmentsCount}</td>
                        <td className="py-2 text-amber-600 dark:text-amber-400">{d.pending}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>


            {/* Grade chart */}
            <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
              <h2 className="font-semibold mb-3">תלמידים לפי שכבה</h2>
              <div className="h-80" dir="ltr">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.gradeData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.25} />
                    <XAxis dataKey="grade" tick={{ fontSize: 12 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="משובצים" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="טרם שובצו" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Grade table */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b border-border">
                      <th className="text-right py-2 font-medium">שכבה</th>
                      <th className="text-right py-2 font-medium">משובצים</th>
                      <th className="text-right py-2 font-medium">טרם שובצו</th>
                      <th className="text-right py-2 font-medium">סה״כ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.gradeData.map((row) => (
                      <tr key={row.grade} className="border-b border-border/50">
                        <td className="py-2">{row.grade}</td>
                        <td className="py-2 font-semibold">{row["משובצים"]}</td>
                        <td className="py-2 text-amber-600 dark:text-amber-400">{row["טרם שובצו"]}</td>
                        <td className="py-2">{row["משובצים"] + row["טרם שובצו"]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Instruments pie + list */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="font-semibold mb-3">התפלגות כלי נגינה (שיוכים פעילים)</h2>
                <div className="h-80" dir="ltr">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={stats.instrumentData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={110}
                        label={(d: any) => `${d.name} (${d.value})`}
                        labelLine={false}
                      >
                        {stats.instrumentData.map((_, i) => (
                          <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="font-semibold mb-3">כמה תלמידים בכל כלי</h2>
                <div className="space-y-2">
                  {stats.instrumentData.map((row, i) => (
                    <div key={row.name} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{row.name}</span>
                        <span className="font-semibold">{row.value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(row.value / maxInstrument) * 100}%`,
                            background: CHART_COLORS[i % CHART_COLORS.length],
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {stats.instrumentData.length === 0 && (
                    <div className="text-sm text-muted-foreground">אין שיוכים פעילים בשנה זו.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Pending requested instruments + schools */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="font-semibold mb-3">כלים מבוקשים — נרשמים שטרם שובצו</h2>
                <div className="space-y-2">
                  {stats.pendingInstrumentData.map((row) => (
                    <div key={row.name} className="flex items-center justify-between text-sm border-b border-border/50 pb-1.5">
                      <span>{row.name}</span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">{row.value}</span>
                    </div>
                  ))}
                  {stats.pendingInstrumentData.length === 0 && (
                    <div className="text-sm text-muted-foreground">אין נרשמים שממתינים לשיבוץ.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
                <h2 className="font-semibold mb-3">שיוכים לפי שלוחה</h2>
                <div className="space-y-2">
                  {stats.schoolData.map((row) => (
                    <div key={row.name} className="flex items-center justify-between text-sm border-b border-border/50 pb-1.5">
                      <span>{row.name}</span>
                      <span className="font-semibold">{row.value}</span>
                    </div>
                  ))}
                  {stats.schoolData.length === 0 && (
                    <div className="text-sm text-muted-foreground">אין נתונים.</div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminEnrollmentStats;
