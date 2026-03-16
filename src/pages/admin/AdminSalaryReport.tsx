import { useState, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FileSpreadsheet, FileDown } from "lucide-react";
import { toast } from "sonner";
import { getMonthRange } from "@/hooks/useTeacherDashboardData";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const MONTH_NAMES = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

// Salary rates
const RATES: Record<string, number> = {
  lessons_45: 280, lessons_30: 190, lessons_60: 370,
  small_ensemble: 280, large_ensemble: 315,
  orchestra_conductor: 840, choir_conductor: 420, choir_accompaniment: 315,
  school_music_group: 280, school_music_coord: 350,
  activity_days: 600, single_hours: 75,
};
const KM_RATE = 1.1;

const FIELD_KEYS = [
  "lessons_45", "lessons_30", "lessons_60",
  "small_ensemble", "large_ensemble",
  "orchestra_conductor", "choir_conductor", "choir_accompaniment",
  "school_music_group", "school_music_coord",
  "activity_days", "single_hours", "km",
] as const;
type FieldKey = typeof FIELD_KEYS[number];

const FIELD_LABELS: Record<FieldKey, string> = {
  lessons_45: "45 דק׳",
  lessons_30: "30 דק׳",
  lessons_60: "60 דק׳",
  small_ensemble: "הרכב קטן",
  large_ensemble: "הרכב גדול",
  orchestra_conductor: "ניצוח תזמורת",
  choir_conductor: "ניצוח מקהלה",
  choir_accompaniment: "ליווי מקהלה",
  school_music_group: "קבוצה קטנה",
  school_music_coord: "ריכוז/ניצוח",
  activity_days: "יום פעילות",
  single_hours: "שעה בודדת",
  km: "ק״מ",
};

function buildMonthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

interface TeacherRow {
  teacherId: string;
  lastName: string;
  firstName: string;
  nationalId: string;
  defaults: Record<FieldKey, number>;
  values: Record<FieldKey, number>;
}

function calcSalary(values: Record<FieldKey, number>) {
  let total = 0;
  for (const key of FIELD_KEYS) {
    if (key === "km") continue;
    total += (values[key] || 0) * (RATES[key] || 0);
  }
  return total;
}
function calcTravel(km: number) {
  return Math.round(km * KM_RATE * 100) / 100;
}

const AdminSalaryReport = () => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [generated, setGenerated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const monthKey = buildMonthKey(selectedYear, selectedMonth);

  const prevRange = useMemo(() => {
    const d = new Date(selectedYear, selectedMonth - 1, 1);
    return getMonthRange(d.getFullYear(), d.getMonth());
  }, [selectedYear, selectedMonth]);

  // --- Data queries ---
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
      const { data, error } = await supabase.from("school_music_groups").select("teacher_id, school_music_school_id, school_music_schools!inner(classes_count, is_active)");
      if (error) throw error;
      return (data ?? []).filter((g: any) => g.school_music_schools?.is_active);
    },
  });

  const { data: schoolMusicSchools } = useQuery({
    queryKey: ["salary-school-music-schools-all"],
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

  const { data: manualEntries } = useQuery({
    queryKey: ["salary-manual", monthKey],
    queryFn: async () => {
      const { data, error } = await supabase.from("salary_manual_entries").select("*").eq("month_key", monthKey);
      if (error) throw error;
      return data ?? [];
    },
  });

  // --- Build system defaults ---
  const systemDefaults = useMemo(() => {
    if (!teachers) return new Map<string, Record<FieldKey, number>>();
    const map = new Map<string, Record<FieldKey, number>>();

    const empty = (): Record<FieldKey, number> => ({
      lessons_45: 0, lessons_30: 0, lessons_60: 0,
      small_ensemble: 0, large_ensemble: 0,
      orchestra_conductor: 0, choir_conductor: 0, choir_accompaniment: 0,
      school_music_group: 0, school_music_coord: 0,
      activity_days: 0, single_hours: 0, km: 0,
    });

    for (const t of teachers) map.set(t.id, empty());

    // Enrollments: count students per duration
    for (const e of enrollments ?? []) {
      const d = map.get(e.teacher_id);
      if (!d) continue;
      if (e.lesson_duration_minutes === 45) d.lessons_45++;
      else if (e.lesson_duration_minutes === 30) d.lessons_30++;
      else if (e.lesson_duration_minutes === 60) d.lessons_60++;
    }

    // Ensembles: weekly hours
    for (const s of ensembleStaff ?? []) {
      const d = map.get(s.teacher_id);
      if (!d) continue;
      const type = (s as any).ensembles?.ensemble_type as string;
      const hours = Number(s.weekly_hours);
      if (type === "small_ensemble" || type === "chamber_ensemble") d.small_ensemble += hours;
      else if (type === "large_ensemble") d.large_ensemble += hours;
      else if (type === "orchestra" || type === "big_band") d.orchestra_conductor += hours;
      else if (type === "choir") {
        if (s.role === "conductor" || s.role === "instructor") d.choir_conductor += hours;
        else d.choir_accompaniment += hours;
      }
    }

    // School music groups: classes count
    for (const g of schoolMusicGroups ?? []) {
      const d = map.get(g.teacher_id);
      if (!d) continue;
      d.school_music_group += (g as any).school_music_schools?.classes_count ?? 0;
    }
    // Coordinators/conductors
    for (const sms of schoolMusicSchools ?? []) {
      for (const tid of [sms.coordinator_teacher_id, sms.conductor_teacher_id]) {
        if (!tid) continue;
        const d = map.get(tid);
        if (!d) continue;
        d.school_music_coord += sms.classes_count;
      }
    }

    // Travel (previous month km)
    for (const r of prevMonthReports ?? []) {
      const d = map.get(r.teacher_id);
      if (d) d.km += Number(r.kilometers);
    }

    return map;
  }, [teachers, enrollments, ensembleStaff, schoolMusicGroups, schoolMusicSchools, prevMonthReports]);

  // --- Merge with manual overrides ---
  const rows: TeacherRow[] = useMemo(() => {
    if (!teachers) return [];
    const manualMap = new Map<string, Record<string, number>>();
    for (const me of manualEntries ?? []) {
      const overrides = (me.overrides as Record<string, number>) ?? {};
      // Legacy fields
      if (me.activity_days) overrides.activity_days = overrides.activity_days ?? Number(me.activity_days);
      if (me.single_hours) overrides.single_hours = overrides.single_hours ?? Number(me.single_hours);
      manualMap.set(me.teacher_id, overrides);
    }

    return teachers.map((t) => {
      const defaults = systemDefaults.get(t.id) ?? {
        lessons_45: 0, lessons_30: 0, lessons_60: 0,
        small_ensemble: 0, large_ensemble: 0,
        orchestra_conductor: 0, choir_conductor: 0, choir_accompaniment: 0,
        school_music_group: 0, school_music_coord: 0,
        activity_days: 0, single_hours: 0, km: 0,
      };
      const overrides = manualMap.get(t.id) ?? {};
      const values = { ...defaults };
      for (const key of FIELD_KEYS) {
        if (key in overrides) values[key] = overrides[key];
      }
      return {
        teacherId: t.id,
        lastName: t.last_name,
        firstName: t.first_name,
        nationalId: t.national_id ?? "",
        defaults,
        values,
      };
    });
  }, [teachers, systemDefaults, manualEntries]);

  // --- Totals ---
  const totals = useMemo(() => {
    const t: Record<FieldKey, number> = {
      lessons_45: 0, lessons_30: 0, lessons_60: 0,
      small_ensemble: 0, large_ensemble: 0,
      orchestra_conductor: 0, choir_conductor: 0, choir_accompaniment: 0,
      school_music_group: 0, school_music_coord: 0,
      activity_days: 0, single_hours: 0, km: 0,
    };
    let totalSalary = 0, totalTravel = 0;
    for (const r of rows) {
      for (const key of FIELD_KEYS) t[key] += r.values[key];
      totalSalary += calcSalary(r.values);
      totalTravel += calcTravel(r.values.km);
    }
    return { ...t, totalSalary, totalTravel };
  }, [rows]);

  // --- Save override ---
  const upsertOverride = useMutation({
    mutationFn: async ({ teacherId, field, value }: { teacherId: string; field: FieldKey; value: number }) => {
      const existing = (manualEntries ?? []).find((e) => e.teacher_id === teacherId);
      if (existing) {
        const prev = (existing.overrides as Record<string, number>) ?? {};
        const newOverrides = { ...prev, [field]: value };
        const { error } = await supabase.from("salary_manual_entries")
          .update({ overrides: newOverrides, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("salary_manual_entries")
          .insert({ teacher_id: teacherId, month_key: monthKey, overrides: { [field]: value } });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["salary-manual", monthKey] }),
    onError: (err: any) => toast.error(err.message),
  });

  const handleChange = useCallback((teacherId: string, field: FieldKey, raw: string) => {
    const value = parseFloat(raw) || 0;
    upsertOverride.mutate({ teacherId, field, value });
  }, [upsertOverride]);

  // --- PDF export ---
  const handleExportPdf = async () => {
    if (!tableRef.current) return;
    setExporting(true);
    try {
      const canvas = await html2canvas(tableRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;

      // Landscape A4
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableWidth = pageWidth - margin * 2;
      const ratio = usableWidth / imgWidth;
      const scaledHeight = imgHeight * ratio;

      if (scaledHeight <= pageHeight - margin * 2) {
        pdf.addImage(imgData, "PNG", margin, margin, usableWidth, scaledHeight);
      } else {
        // Multi-page
        let yOffset = 0;
        const sliceHeight = (pageHeight - margin * 2) / ratio;
        while (yOffset < imgHeight) {
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = imgWidth;
          sliceCanvas.height = Math.min(sliceHeight, imgHeight - yOffset);
          const ctx = sliceCanvas.getContext("2d")!;
          ctx.drawImage(canvas, 0, -yOffset);
          const sliceImg = sliceCanvas.toDataURL("image/png");
          const h = sliceCanvas.height * ratio;
          pdf.addImage(sliceImg, "PNG", margin, margin, usableWidth, h);
          yOffset += sliceHeight;
          if (yOffset < imgHeight) pdf.addPage();
        }
      }

      pdf.save(`דוח_משכורות_${MONTH_NAMES[selectedMonth]}_${selectedYear}.pdf`);
      toast.success("PDF יוצא בהצלחה");
    } catch (err: any) {
      toast.error("שגיאה בייצוא PDF");
    } finally {
      setExporting(false);
    }
  };

  const yearOptions = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);
  const fmt = (n: number) => n ? `₪${n.toLocaleString("he-IL")}` : "–";

  return (
    <AdminLayout title="דוח משכורות" backPath="/admin/exports">
      <div className="space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">שנה</label>
            <Select value={String(selectedYear)} onValueChange={(v) => { setSelectedYear(Number(v)); setGenerated(false); }}>
              <SelectTrigger className="w-28 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">חודש</label>
            <Select value={String(selectedMonth)} onValueChange={(v) => { setSelectedMonth(Number(v)); setGenerated(false); }}>
              <SelectTrigger className="w-32 rounded-xl"><SelectValue /></SelectTrigger>
              <SelectContent>{MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button className="rounded-xl gap-2" onClick={() => setGenerated(true)}>
            <FileSpreadsheet className="h-4 w-4" />
            הפק עכשיו
          </Button>
          {generated && (
            <Button variant="outline" className="rounded-xl gap-2" onClick={handleExportPdf} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
              ייצוא PDF
            </Button>
          )}
        </div>

        {generated && (
          <>
            <p className="text-sm text-muted-foreground">
              דוח משכורות ל{MONTH_NAMES[selectedMonth]} {selectedYear} · נסיעות לפי {MONTH_NAMES[new Date(selectedYear, selectedMonth - 1, 1).getMonth()]} {new Date(selectedYear, selectedMonth - 1, 1).getFullYear()}
            </p>

            <div ref={tableRef} className="bg-background">
              {/* PDF title (hidden on screen, visible in capture) */}
              <h2 className="text-center font-bold text-lg mb-3 hidden print:block" data-html2canvas-always-visible="true">
                דוח משכורות — {MONTH_NAMES[selectedMonth]} {selectedYear}
              </h2>

              <div className="relative w-full overflow-auto border rounded-xl">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-2 text-right font-medium whitespace-nowrap sticky right-0 bg-muted/50 z-10">שם משפחה</th>
                      <th className="p-2 text-right font-medium whitespace-nowrap">שם פרטי</th>
                      <th className="p-2 text-right font-medium whitespace-nowrap">ת.ז.</th>
                      {FIELD_KEYS.map((key) => (
                        <th key={key} className="p-2 text-center font-medium whitespace-nowrap">{FIELD_LABELS[key]}</th>
                      ))}
                      <th className="p-2 text-center font-medium whitespace-nowrap bg-primary/10">סיכום משכורת</th>
                      <th className="p-2 text-center font-medium whitespace-nowrap bg-primary/10">סיכום נסיעות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const salary = calcSalary(r.values);
                      const travel = calcTravel(r.values.km);
                      return (
                        <tr key={r.teacherId} className="border-b hover:bg-muted/30">
                          <td className="p-2 text-right whitespace-nowrap sticky right-0 bg-background z-10">{r.lastName}</td>
                          <td className="p-2 text-right whitespace-nowrap">{r.firstName}</td>
                          <td className="p-2 text-right whitespace-nowrap font-mono text-xs">{r.nationalId}</td>
                          {FIELD_KEYS.map((key) => (
                            <td key={key} className="p-1 text-center whitespace-nowrap">
                              <Input
                                type="number"
                                min={0}
                                step="any"
                                className="w-16 h-8 text-center mx-auto rounded-lg text-sm"
                                defaultValue={r.values[key] || ""}
                                placeholder={r.defaults[key] ? String(r.defaults[key]) : "0"}
                                onBlur={(e) => handleChange(r.teacherId, key, e.target.value)}
                              />
                            </td>
                          ))}
                          <td className="p-2 text-center whitespace-nowrap font-bold bg-primary/5">{fmt(salary)}</td>
                          <td className="p-2 text-center whitespace-nowrap font-bold bg-primary/5">{travel ? fmt(travel) : "–"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-primary/30 bg-muted font-bold">
                      <td className="p-2 text-right sticky right-0 bg-muted z-10" colSpan={3}>סה״כ</td>
                      {FIELD_KEYS.map((key) => (
                        <td key={key} className="p-2 text-center">{totals[key] || "–"}</td>
                      ))}
                      <td className="p-2 text-center bg-primary/10">{fmt(totals.totalSalary)}</td>
                      <td className="p-2 text-center bg-primary/10">{totals.totalTravel ? fmt(totals.totalTravel) : "–"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminSalaryReport;
