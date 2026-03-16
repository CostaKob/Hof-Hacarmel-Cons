import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { getMonthRange } from "@/hooks/useTeacherDashboardData";

const MONTH_NAMES = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

// Salary rates
const LESSON_RATES: Record<number, number> = { 30: 190, 45: 280, 60: 370 };

const ENSEMBLE_RATES: Record<string, Record<string, number>> = {
  small_ensemble: { _default: 280 },
  chamber_ensemble: { _default: 280 },
  large_ensemble: { _default: 315 },
  orchestra: { _default: 840 },
  big_band: { _default: 840 },
  choir: { conductor: 420, piano_accompanist: 315, vocal_accompanist: 315, instructor: 420 },
};

const SCHOOL_MUSIC_GROUP_RATE = 280;
const SCHOOL_MUSIC_COORD_RATE = 350;
const ACTIVITY_DAY_RATE = 600;
const SINGLE_HOUR_RATE = 75;
const KM_RATE = 1.1;

interface TeacherSalaryRow {
  teacherId: string;
  lastName: string;
  firstName: string;
  nationalId: string;
  lessons45: number;
  lessons30: number;
  lessons60: number;
  smallEnsemble: number;
  largeEnsemble: number;
  orchestraConductor: number;
  choirConductor: number;
  choirAccompaniment: number;
  schoolMusicGroup: number;
  schoolMusicCoord: number;
  activityDays: number;
  singleHours: number;
  km: number;
  salarySummary: number;
  travelSummary: number;
}

function buildMonthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

const AdminSalaryReport = () => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [generated, setGenerated] = useState(false);
  const queryClient = useQueryClient();

  const monthKey = buildMonthKey(selectedYear, selectedMonth);
  const prevMonthKey = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth - 1, 1);
    return buildMonthKey(d.getFullYear(), d.getMonth());
  }, [selectedYear, selectedMonth]);

  // Previous month date range for travel
  const prevRange = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth - 1, 1);
    return getMonthRange(d.getFullYear(), d.getMonth());
  }, [selectedYear, selectedMonth]);

  // Fetch all data
  const { data: teachers } = useQuery({
    queryKey: ["salary-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("id, first_name, last_name, national_id").eq("is_active", true).order("last_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: enrollments } = useQuery({
    queryKey: ["salary-enrollments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("enrollments").select("teacher_id, lesson_duration_minutes, is_active, students!inner(is_active)").eq("is_active", true);
      if (error) throw error;
      return (data ?? []).filter((e: any) => e.students?.is_active);
    },
  });

  const { data: ensembleStaff } = useQuery({
    queryKey: ["salary-ensemble-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ensemble_staff").select("teacher_id, role, weekly_hours, ensembles!inner(ensemble_type, is_active)");
      if (error) throw error;
      return (data ?? []).filter((s: any) => s.ensembles?.is_active);
    },
  });

  const { data: schoolMusicGroups } = useQuery({
    queryKey: ["salary-school-music-groups"],
    queryFn: async () => {
      const { data, error } = await supabase.from("school_music_groups").select("teacher_id, school_music_school_id, school_music_schools!inner(classes_count, is_active, coordinator_teacher_id, conductor_teacher_id)");
      if (error) throw error;
      return (data ?? []).filter((g: any) => g.school_music_schools?.is_active);
    },
  });

  const { data: schoolMusicSchools } = useQuery({
    queryKey: ["salary-school-music-schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("school_music_schools").select("id, classes_count, coordinator_teacher_id, conductor_teacher_id, is_active").eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: prevMonthReports } = useQuery({
    queryKey: ["salary-prev-reports", prevRange.from, prevRange.to],
    queryFn: async () => {
      const { data, error } = await supabase.from("reports").select("teacher_id, kilometers").gte("report_date", prevRange.from).lte("report_date", prevRange.to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: manualEntries, isLoading: manualLoading } = useQuery({
    queryKey: ["salary-manual", monthKey],
    queryFn: async () => {
      const { data, error } = await supabase.from("salary_manual_entries").select("*").eq("month_key", monthKey);
      if (error) throw error;
      return data ?? [];
    },
  });

  const upsertManual = useMutation({
    mutationFn: async ({ teacherId, field, value }: { teacherId: string; field: "activity_days" | "single_hours"; value: number }) => {
      const existing = manualEntries?.find((e) => e.teacher_id === teacherId);
      if (existing) {
        const { error } = await supabase.from("salary_manual_entries").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("salary_manual_entries").insert({ teacher_id: teacherId, month_key: monthKey, [field]: value });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salary-manual", monthKey] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Build rows
  const rows: TeacherSalaryRow[] = useMemo(() => {
    if (!teachers) return [];

    // Enrollment counts per teacher by duration
    const enrollmentMap = new Map<string, Record<number, number>>();
    for (const e of enrollments ?? []) {
      const tid = e.teacher_id;
      const dur = e.lesson_duration_minutes;
      if (!enrollmentMap.has(tid)) enrollmentMap.set(tid, {});
      const m = enrollmentMap.get(tid)!;
      m[dur] = (m[dur] ?? 0) + 1;
    }

    // Ensemble salary per teacher
    const ensembleMap = new Map<string, { smallEnsemble: number; largeEnsemble: number; orchestraConductor: number; choirConductor: number; choirAccompaniment: number }>();
    for (const s of ensembleStaff ?? []) {
      const tid = s.teacher_id;
      const type = (s as any).ensembles?.ensemble_type as string;
      const hours = s.weekly_hours;
      const role = s.role;

      if (!ensembleMap.has(tid)) ensembleMap.set(tid, { smallEnsemble: 0, largeEnsemble: 0, orchestraConductor: 0, choirConductor: 0, choirAccompaniment: 0 });
      const m = ensembleMap.get(tid)!;

      if (type === "small_ensemble" || type === "chamber_ensemble") {
        m.smallEnsemble += 280 * hours;
      } else if (type === "large_ensemble") {
        m.largeEnsemble += 315 * hours;
      } else if (type === "orchestra" || type === "big_band") {
        m.orchestraConductor += 840 * hours;
      } else if (type === "choir") {
        if (role === "conductor" || role === "instructor") {
          m.choirConductor += 420 * hours;
        } else {
          m.choirAccompaniment += 315 * hours;
        }
      }
    }

    // School music per teacher
    const schoolMusicMap = new Map<string, { group: number; coord: number }>();
    // Group teachers
    for (const g of schoolMusicGroups ?? []) {
      const tid = g.teacher_id;
      const classes = (g as any).school_music_schools?.classes_count ?? 0;
      if (!schoolMusicMap.has(tid)) schoolMusicMap.set(tid, { group: 0, coord: 0 });
      schoolMusicMap.get(tid)!.group += SCHOOL_MUSIC_GROUP_RATE * classes;
    }
    // Coordinators + conductors
    for (const sms of schoolMusicSchools ?? []) {
      const classes = sms.classes_count;
      for (const tid of [sms.coordinator_teacher_id, sms.conductor_teacher_id]) {
        if (!tid) continue;
        if (!schoolMusicMap.has(tid)) schoolMusicMap.set(tid, { group: 0, coord: 0 });
        schoolMusicMap.get(tid)!.coord += SCHOOL_MUSIC_COORD_RATE * classes;
      }
    }

    // Travel (previous month)
    const kmMap = new Map<string, number>();
    for (const r of prevMonthReports ?? []) {
      kmMap.set(r.teacher_id, (kmMap.get(r.teacher_id) ?? 0) + Number(r.kilometers));
    }

    // Manual entries
    const manualMap = new Map<string, { activity_days: number; single_hours: number }>();
    for (const me of manualEntries ?? []) {
      manualMap.set(me.teacher_id, { activity_days: Number(me.activity_days), single_hours: Number(me.single_hours) });
    }

    return teachers.map((t) => {
      const ec = enrollmentMap.get(t.id) ?? {};
      const ens = ensembleMap.get(t.id) ?? { smallEnsemble: 0, largeEnsemble: 0, orchestraConductor: 0, choirConductor: 0, choirAccompaniment: 0 };
      const sm = schoolMusicMap.get(t.id) ?? { group: 0, coord: 0 };
      const manual = manualMap.get(t.id) ?? { activity_days: 0, single_hours: 0 };
      const km = kmMap.get(t.id) ?? 0;

      const lessons45 = (ec[45] ?? 0) * LESSON_RATES[45];
      const lessons30 = (ec[30] ?? 0) * LESSON_RATES[30];
      const lessons60 = (ec[60] ?? 0) * LESSON_RATES[60];
      const activityDaysVal = manual.activity_days * ACTIVITY_DAY_RATE;
      const singleHoursVal = manual.single_hours * SINGLE_HOUR_RATE;
      const travelSummary = Math.round(km * KM_RATE * 100) / 100;

      const salarySummary = lessons45 + lessons30 + lessons60 +
        ens.smallEnsemble + ens.largeEnsemble + ens.orchestraConductor + ens.choirConductor + ens.choirAccompaniment +
        sm.group + sm.coord +
        activityDaysVal + singleHoursVal;

      return {
        teacherId: t.id,
        lastName: t.last_name,
        firstName: t.first_name,
        nationalId: t.national_id ?? "",
        lessons45,
        lessons30,
        lessons60,
        smallEnsemble: ens.smallEnsemble,
        largeEnsemble: ens.largeEnsemble,
        orchestraConductor: ens.orchestraConductor,
        choirConductor: ens.choirConductor,
        choirAccompaniment: ens.choirAccompaniment,
        schoolMusicGroup: sm.group,
        schoolMusicCoord: sm.coord,
        activityDays: manual.activity_days,
        singleHours: manual.single_hours,
        km,
        salarySummary,
        travelSummary,
      };
    });
  }, [teachers, enrollments, ensembleStaff, schoolMusicGroups, schoolMusicSchools, prevMonthReports, manualEntries]);

  // Totals row
  const totals = useMemo(() => {
    const t: Omit<TeacherSalaryRow, "teacherId" | "lastName" | "firstName" | "nationalId"> = {
      lessons45: 0, lessons30: 0, lessons60: 0,
      smallEnsemble: 0, largeEnsemble: 0, orchestraConductor: 0, choirConductor: 0, choirAccompaniment: 0,
      schoolMusicGroup: 0, schoolMusicCoord: 0,
      activityDays: 0, singleHours: 0, km: 0,
      salarySummary: 0, travelSummary: 0,
    };
    for (const r of rows) {
      t.lessons45 += r.lessons45;
      t.lessons30 += r.lessons30;
      t.lessons60 += r.lessons60;
      t.smallEnsemble += r.smallEnsemble;
      t.largeEnsemble += r.largeEnsemble;
      t.orchestraConductor += r.orchestraConductor;
      t.choirConductor += r.choirConductor;
      t.choirAccompaniment += r.choirAccompaniment;
      t.schoolMusicGroup += r.schoolMusicGroup;
      t.schoolMusicCoord += r.schoolMusicCoord;
      t.activityDays += r.activityDays;
      t.singleHours += r.singleHours;
      t.km += r.km;
      t.salarySummary += r.salarySummary;
      t.travelSummary += r.travelSummary;
    }
    return t;
  }, [rows]);

  const handleManualChange = useCallback((teacherId: string, field: "activity_days" | "single_hours", raw: string) => {
    const value = parseFloat(raw) || 0;
    upsertManual.mutate({ teacherId, field, value });
  }, [upsertManual]);

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  const fmt = (n: number) => n ? `₪${n.toLocaleString("he-IL")}` : "–";

  // Filter rows that have any data
  const activeRows = generated ? rows.filter((r) =>
    r.lessons45 || r.lessons30 || r.lessons60 ||
    r.smallEnsemble || r.largeEnsemble || r.orchestraConductor || r.choirConductor || r.choirAccompaniment ||
    r.schoolMusicGroup || r.schoolMusicCoord ||
    r.activityDays || r.singleHours || r.km ||
    r.salarySummary || r.travelSummary
  ) : [];

  const allRows = generated ? rows : [];

  return (
    <AdminLayout title="דוח משכורות" backPath="/admin/exports">
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">שנה</label>
            <Select value={String(selectedYear)} onValueChange={(v) => { setSelectedYear(Number(v)); setGenerated(false); }}>
              <SelectTrigger className="w-28 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">חודש</label>
            <Select value={String(selectedMonth)} onValueChange={(v) => { setSelectedMonth(Number(v)); setGenerated(false); }}>
              <SelectTrigger className="w-32 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button className="rounded-xl gap-2" onClick={() => setGenerated(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            הפק עכשיו
          </Button>
        </div>

        {generated && (
          <>
            <p className="text-sm text-muted-foreground">
              דוח משכורות ל{MONTH_NAMES[selectedMonth]} {selectedYear} • נסיעות מחושבות לפי {MONTH_NAMES[new Date(selectedYear, selectedMonth - 1, 1).getMonth()]} {new Date(selectedYear, selectedMonth - 1, 1).getFullYear()}
            </p>

            <div className="relative w-full overflow-auto border rounded-xl">
              <table className="w-full text-sm" dir="rtl">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-2 text-right font-medium whitespace-nowrap">שם משפחה</th>
                    <th className="p-2 text-right font-medium whitespace-nowrap">שם פרטי</th>
                    <th className="p-2 text-right font-medium whitespace-nowrap">ת.ז.</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">45 דק׳</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">30 דק׳</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">60 דק׳</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">הרכב קטן</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">הרכב גדול</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">ניצוח תזמורת</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">ניצוח מקהלה</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">ליווי מקהלה</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">קבוצה קטנה</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">ריכוז/ניצוח</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">יום פעילות</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">שעה בודדת</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap">ק״מ</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap bg-primary/10">סיכום משכורת</th>
                    <th className="p-2 text-center font-medium whitespace-nowrap bg-primary/10">סיכום נסיעות</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((r) => (
                    <tr key={r.teacherId} className="border-b hover:bg-muted/30">
                      <td className="p-2 text-right whitespace-nowrap">{r.lastName}</td>
                      <td className="p-2 text-right whitespace-nowrap">{r.firstName}</td>
                      <td className="p-2 text-right whitespace-nowrap font-mono text-xs">{r.nationalId}</td>
                      <td className="p-2 text-center whitespace-nowrap">{r.lessons45 ? fmt(r.lessons45) : "–"}</td>
                      <td className="p-2 text-center whitespace-nowrap">{r.lessons30 ? fmt(r.lessons30) : "–"}</td>
                      <td className="p-2 text-center whitespace-nowrap">{r.lessons60 ? fmt(r.lessons60) : "–"}</td>
                      <td className="p-2 text-center whitespace-nowrap">{r.smallEnsemble ? fmt(r.smallEnsemble) : "–"}</td>
                      <td className="p-2 text-center whitespace-nowrap">{r.largeEnsemble ? fmt(r.largeEnsemble) : "–"}</td>
                      <td className="p-2 text-center whitespace-nowrap">{r.orchestraConductor ? fmt(r.orchestraConductor) : "–"}</td>
                      <td className="p-2 text-center whitespace-nowrap">{r.choirConductor ? fmt(r.choirConductor) : "–"}</td>
                      <td className="p-2 text-center whitespace-nowrap">{r.choirAccompaniment ? fmt(r.choirAccompaniment) : "–"}</td>
                      <td className="p-2 text-center whitespace-nowrap">{r.schoolMusicGroup ? fmt(r.schoolMusicGroup) : "–"}</td>
                      <td className="p-2 text-center whitespace-nowrap">{r.schoolMusicCoord ? fmt(r.schoolMusicCoord) : "–"}</td>
                      <td className="p-2 text-center whitespace-nowrap">
                        <Input
                          type="number"
                          min={0}
                          className="w-16 h-8 text-center mx-auto rounded-lg"
                          defaultValue={r.activityDays || ""}
                          onBlur={(e) => handleManualChange(r.teacherId, "activity_days", e.target.value)}
                        />
                      </td>
                      <td className="p-2 text-center whitespace-nowrap">
                        <Input
                          type="number"
                          min={0}
                          className="w-16 h-8 text-center mx-auto rounded-lg"
                          defaultValue={r.singleHours || ""}
                          onBlur={(e) => handleManualChange(r.teacherId, "single_hours", e.target.value)}
                        />
                      </td>
                      <td className="p-2 text-center whitespace-nowrap">{r.km || "–"}</td>
                      <td className="p-2 text-center whitespace-nowrap font-bold bg-primary/5">{fmt(r.salarySummary)}</td>
                      <td className="p-2 text-center whitespace-nowrap font-bold bg-primary/5">{r.travelSummary ? fmt(r.travelSummary) : "–"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-primary/30 bg-muted font-bold">
                    <td className="p-2 text-right" colSpan={3}>סה״כ</td>
                    <td className="p-2 text-center">{fmt(totals.lessons45)}</td>
                    <td className="p-2 text-center">{fmt(totals.lessons30)}</td>
                    <td className="p-2 text-center">{fmt(totals.lessons60)}</td>
                    <td className="p-2 text-center">{fmt(totals.smallEnsemble)}</td>
                    <td className="p-2 text-center">{fmt(totals.largeEnsemble)}</td>
                    <td className="p-2 text-center">{fmt(totals.orchestraConductor)}</td>
                    <td className="p-2 text-center">{fmt(totals.choirConductor)}</td>
                    <td className="p-2 text-center">{fmt(totals.choirAccompaniment)}</td>
                    <td className="p-2 text-center">{fmt(totals.schoolMusicGroup)}</td>
                    <td className="p-2 text-center">{fmt(totals.schoolMusicCoord)}</td>
                    <td className="p-2 text-center">{fmt(totals.activityDays * ACTIVITY_DAY_RATE)}</td>
                    <td className="p-2 text-center">{fmt(totals.singleHours * SINGLE_HOUR_RATE)}</td>
                    <td className="p-2 text-center">{totals.km || "–"}</td>
                    <td className="p-2 text-center bg-primary/10">{fmt(totals.salarySummary)}</td>
                    <td className="p-2 text-center bg-primary/10">{fmt(totals.travelSummary)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminSalaryReport;
