import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { Clock, Download, Loader2, Phone, Trash2, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { cmpHe } from "@/lib/sortHebrew";

const DAYS = [
  { idx: 0, label: "ראשון" },
  { idx: 1, label: "שני" },
  { idx: 2, label: "שלישי" },
  { idx: 3, label: "רביעי" },
  { idx: 4, label: "חמישי" },
];

const DEFAULT_START_MIN = 8 * 60; // 08:00
const DEFAULT_END_MIN = 17 * 60; // 17:00
const STEP = 15; // דקות
const ROW_H = 40; // px לכל 15 דקות — משאיר מקום לכל שורות הכרטיס גם בשיעור של 30 דקות
const EXPORT_ROW_H = 56; // גובה שורה בתצוגת הייצוא — מוגדל לקריאות
const EXPORT_LANE_W = 290; // רוחב בטוח לכל שיעור מקביל — מונע חיתוך טקסט בייצוא
const EXPORT_TIME_COL_W = 96;
const EXPORT_SIDE_PADDING = 52;


const TEACHER_COLORS = [
  { bg: "hsl(200 70% 92%)", border: "hsl(200 55% 62%)" },
  { bg: "hsl(150 55% 90%)", border: "hsl(150 45% 55%)" },
  { bg: "hsl(45 85% 89%)", border: "hsl(40 70% 58%)" },
  { bg: "hsl(340 70% 93%)", border: "hsl(340 55% 68%)" },
  { bg: "hsl(265 60% 93%)", border: "hsl(265 45% 68%)" },
  { bg: "hsl(20 75% 91%)", border: "hsl(20 60% 63%)" },
  { bg: "hsl(180 50% 90%)", border: "hsl(180 40% 55%)" },
  { bg: "hsl(95 50% 90%)", border: "hsl(95 40% 52%)" },
];

const fmt = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** מחלק שיעורים חופפים באותו יום לעמודות זה לצד זה */
function layoutDaySlots(daySlots: SlotRow[]) {
  const sorted = [...daySlots].sort(
    (a, b) => a.start_minutes - b.start_minutes || b.duration_minutes - a.duration_minutes,
  );
  const result = new Map<string, { col: number; cols: number }>();
  let cluster: SlotRow[] = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols: SlotRow[][] = [];
    for (const s of cluster) {
      const existing = cols.find(
        (col) => col[col.length - 1].start_minutes + col[col.length - 1].duration_minutes <= s.start_minutes,
      );
      if (existing) existing.push(s);
      else cols.push([s]);
    }
    cols.forEach((col, ci) => col.forEach((s) => result.set(s.id, { col: ci, cols: cols.length })));
    cluster = [];
    clusterEnd = -1;
  };
  for (const s of sorted) {
    if (cluster.length && s.start_minutes >= clusterEnd) flush();
    cluster.push(s);
    clusterEnd = Math.max(clusterEnd, s.start_minutes + s.duration_minutes);
  }
  if (cluster.length) flush();
  return result;
}

/** מקטין רק שורות ארוכות עד שהן נכנסות בשלמותן לכרטיס הייצוא. */
function fitExportText(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-fit-export]").forEach((line) => {
    const preferred = Number(line.dataset.fitExport) || 16;
    const minimum = Number(line.dataset.fitMin) || 10;
    line.style.fontSize = `${preferred}px`;

    const available = line.clientWidth;
    if (!available) return;

    let size = preferred;
    while (line.scrollWidth > available && size > minimum) {
      size -= 0.5;
      line.style.fontSize = `${size}px`;
    }
  });
}

type EnrollmentRow = {
  id: string;
  lesson_duration_minutes: number | null;
  teacher_id: string | null;
  students: { first_name: string; last_name: string; grade: string | null } | null;
  teachers: { first_name: string; last_name: string; phone: string | null } | null;
  instruments: { name: string } | null;
};

type SlotRow = {
  id: string;
  enrollment_id: string;
  day_of_week: number;
  start_minutes: number;
  duration_minutes: number;
};

type Props = {
  schoolId: string;
  schoolName: string;
};

const BranchScheduleBoard = ({ schoolId, schoolName }: Props) => {
  const { selectedYearId, years, activeYear } = useAcademicYear();
  const selectedYear = years.find((y) => y.id === selectedYearId) ?? activeYear;
  const qc = useQueryClient();
  const boardRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // שיבוץ/עריכה ידנית — שעה חופשית (כל דקה)
  const [manual, setManual] = useState<{ enrollmentId: string; day: number; time: string } | null>(null);

  const { data: schoolTimes } = useQuery({
    queryKey: ["school-schedule-times", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("schools")
        .select("schedule_start_minutes, schedule_end_minutes")
        .eq("id", schoolId)
        .single();
      if (error) return null;
      return data as { schedule_start_minutes: number | null; schedule_end_minutes: number | null };
    },
  });

  const START_MIN = schoolTimes?.schedule_start_minutes ?? DEFAULT_START_MIN;
  const END_MIN = schoolTimes?.schedule_end_minutes ?? DEFAULT_END_MIN;
  const ROWS = (END_MIN - START_MIN) / STEP;

  const { data: coordinator } = useQuery({
    queryKey: ["branch-schedule-coordinator", schoolId, selectedYearId],
    enabled: !!schoolId,
    queryFn: async () => {
      if (!schoolId) return null;
      const fetchOne = async (yearId?: string) => {
        let q = supabase
          .from("branch_coordinators")
          .select("id, teacher_id, teachers(first_name, last_name, phone)")
          .eq("school_id", schoolId);
        if (yearId) q = q.eq("academic_year_id", yearId);
        const { data, error } = await q.order("created_at", { ascending: false }).maybeSingle();
        if (error) throw error;
        return (data as any)?.teachers as { first_name: string; last_name: string; phone: string | null } | null;
      };
      return (await fetchOne(selectedYearId ?? undefined)) ?? (await fetchOne());
    },
  });

  const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery({
    queryKey: ["branch-schedule-enrollments", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(
          "id, lesson_duration_minutes, teacher_id, students(first_name, last_name, grade), teachers(first_name, last_name, phone), instruments(name)",
        )
        .eq("school_id", schoolId)
        .eq("academic_year_id", selectedYearId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as unknown as EnrollmentRow[];
    },
  });

  const { data: slots = [] } = useQuery({
    queryKey: ["branch-schedule-slots", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branch_schedule_slots")
        .select("id, enrollment_id, day_of_week, start_minutes, duration_minutes")
        .eq("school_id", schoolId)
        .eq("academic_year_id", selectedYearId!);
      if (error) throw error;
      return (data ?? []) as SlotRow[];
    },
  });

  const enrollmentMap = useMemo(
    () => new Map(enrollments.map((e) => [e.id, e])),
    [enrollments],
  );

  const teacherColor = useMemo(() => {
    const ids = Array.from(new Set(enrollments.map((e) => e.teacher_id).filter(Boolean))) as string[];
    ids.sort();
    const map = new Map<string, (typeof TEACHER_COLORS)[number]>();
    ids.forEach((id, i) => map.set(id, TEACHER_COLORS[i % TEACHER_COLORS.length]));
    return map;
  }, [enrollments]);

  const placedIds = useMemo(() => new Set(slots.map((s) => s.enrollment_id)), [slots]);

  const dayLayouts = useMemo(() => {
    const map = new Map<number, Map<string, { col: number; cols: number }>>();
    for (const d of DAYS) {
      map.set(d.idx, layoutDaySlots(slots.filter((s) => s.day_of_week === d.idx)));
    }
    return map;
  }, [slots]);

  /** רוחב יחסי לכל יום — יום עם שיעורים חופפים מקבל עמודה רחבה יותר */
  const dayFlexGrow = useMemo(() => {
    const map = new Map<number, number>();
    for (const d of DAYS) {
      const lay = dayLayouts.get(d.idx);
      let max = 1;
      lay?.forEach((v) => { max = Math.max(max, v.cols); });
      map.set(d.idx, max);
    }
    return map;
  }, [dayLayouts]);

  const exportDayWidths = useMemo(
    () => new Map(DAYS.map((d) => [d.idx, Math.max(1, dayFlexGrow.get(d.idx) ?? 1) * EXPORT_LANE_W])),
    [dayFlexGrow],
  );
  const exportWidth =
    EXPORT_SIDE_PADDING * 2 +
    EXPORT_TIME_COL_W +
    DAYS.reduce((sum, d) => sum + (exportDayWidths.get(d.idx) ?? EXPORT_LANE_W), 0);

  const unplaced = useMemo(
    () =>
      enrollments
        .filter((e) => !placedIds.has(e.id))
        .sort((a, b) => {
          const ta = `${a.teachers?.first_name ?? ""} ${a.teachers?.last_name ?? ""}`.trim();
          const tb = `${b.teachers?.first_name ?? ""} ${b.teachers?.last_name ?? ""}`.trim();
          const byTeacher = cmpHe(ta, tb);
          if (byTeacher !== 0) return byTeacher;
          return cmpHe(
            `${a.students?.first_name ?? ""} ${a.students?.last_name ?? ""}`,
            `${b.students?.first_name ?? ""} ${b.students?.last_name ?? ""}`,
          );
        }),
    [enrollments, placedIds],
  );

  const saveSlot = useMutation({
    mutationFn: async (payload: {
      enrollment_id: string;
      day_of_week: number;
      start_minutes: number;
      duration_minutes: number;
    }) => {
      const { error } = await supabase.from("branch_schedule_slots").upsert(
        {
          ...payload,
          school_id: schoolId,
          academic_year_id: selectedYearId!,
        },
        { onConflict: "academic_year_id,enrollment_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branch-schedule-slots"] }),
    onError: (e: any) => toast.error(e.message || "שגיאה בשמירה"),
  });

  const removeSlot = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase
        .from("branch_schedule_slots")
        .delete()
        .eq("academic_year_id", selectedYearId!)
        .eq("enrollment_id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["branch-schedule-slots"] }),
    onError: (e: any) => toast.error(e.message || "שגיאה בהסרה"),
  });

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, day: number) => {
    e.preventDefault();
    const id = dragId || e.dataTransfer.getData("text/plain");
    if (!id) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const raw = START_MIN + Math.floor(y / ROW_H) * STEP;
    const enr = enrollmentMap.get(id);
    const duration = enr?.lesson_duration_minutes || 30;
    const start = Math.max(START_MIN, Math.min(raw, END_MIN - duration));
    saveSlot.mutate({
      enrollment_id: id,
      day_of_week: day,
      start_minutes: start,
      duration_minutes: duration,
    });
    setDragId(null);
  };

  /** שמירת שיבוץ ידני — שעה חופשית בכל דקה (למשל 14:05) */
  const saveManual = () => {
    if (!manual) return;
    const enr = enrollmentMap.get(manual.enrollmentId);
    if (!enr) return;
    const m = manual.time.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) {
      toast.error("יש להזין שעה בפורמט HH:MM");
      return;
    }
    const duration = enr.lesson_duration_minutes || 30;
    const start = Math.max(
      START_MIN,
      Math.min(Number(m[1]) * 60 + Number(m[2]), END_MIN - duration),
    );
    saveSlot.mutate(
      {
        enrollment_id: manual.enrollmentId,
        day_of_week: manual.day,
        start_minutes: start,
        duration_minutes: duration,
      },
      { onSuccess: () => setManual(null) },
    );
  };

  const exportPng = async () => {
    const el = exportRef.current ?? boardRef.current;
    if (!el) return;
    setExporting(true);
    try {
      await document.fonts.ready;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      fitExportText(el);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const fullWidth = el.scrollWidth;
      const fullHeight = el.scrollHeight;
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        width: fullWidth,
        height: fullHeight,
        windowWidth: fullWidth,
        x: 0,
        y: 0,
        scrollX: 0,
        scrollY: 0,
      });
      const link = document.createElement("a");
      link.download = `לוח_שבועי_${schoolName}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast.success("הלוח נשמר כתמונה");
    } catch (err: any) {
      toast.error(err.message || "שגיאה בייצוא");
    } finally {
      setExporting(false);
    }
  };

  const hourLabels = Array.from({ length: ROWS }, (_, i) => START_MIN + i * STEP);

  return (
    <div dir="rtl">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Button className="h-11 rounded-xl gap-2" onClick={exportPng} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          שמירה כתמונה
        </Button>
        <Button
          variant="outline"
          className="h-11 rounded-xl gap-2"
          onClick={() => setManual({ enrollmentId: "", day: 0, time: "14:00" })}
          disabled={enrollments.length === 0}
        >
          <Clock className="h-4 w-4" />
          שיבוץ ידני לפי שעה
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[240px_1fr]">
        {/* תלמידים שטרם שובצו */}
        <div
          className="rounded-2xl border border-border bg-card p-3 shadow-sm lg:sticky lg:top-4 lg:max-h-[80vh] lg:overflow-y-auto overscroll-contain"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const id = dragId || e.dataTransfer.getData("text/plain");
            if (id && placedIds.has(id)) removeSlot.mutate(id);
            setDragId(null);
          }}
        >
          <p className="mb-2 flex items-center gap-2 text-base font-semibold">
            <Users className="h-4 w-4 text-primary" />
            טרם שובצו ({unplaced.length})
          </p>
          {loadingEnrollments && <p className="text-sm text-muted-foreground">טוען…</p>}
          {!loadingEnrollments && unplaced.length === 0 && (
            <p className="text-sm text-muted-foreground">כל התלמידים שובצו 🎉</p>
          )}
          <div className="space-y-1.5">
            {unplaced.map((e) => {
              const c = e.teacher_id ? teacherColor.get(e.teacher_id) : undefined;
              return (
                <div
                  key={e.id}
                  draggable
                  onDragStart={(ev) => {
                    setDragId(e.id);
                    ev.dataTransfer.setData("text/plain", e.id);
                  }}
                  onDragEnd={() => setDragId(null)}
                  className="cursor-grab rounded-lg border px-2 py-1.5 text-sm text-right active:cursor-grabbing"
                  style={{
                    backgroundColor: c?.bg ?? "hsl(var(--muted))",
                    borderColor: c?.border ?? "hsl(var(--border))",
                  }}
                >
                  <p className="font-semibold text-foreground">
                    {e.students?.first_name} {e.students?.last_name}
                    {e.students?.grade ? (
                      <span className="font-normal text-foreground/70"> · {e.students.grade}</span>
                    ) : null}
                  </p>
                  <p className="text-xs text-foreground/70">
                    {e.instruments?.name} · {e.teachers?.first_name} {e.teachers?.last_name} ·{" "}
                    {e.lesson_duration_minutes || 30}′
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* הלוח */}
        <div className="mx-auto w-[90%] min-w-0">
          <div
            className="w-full overflow-x-auto overscroll-x-contain rounded-lg border border-border/60 bg-background pb-2 [scrollbar-gutter:stable]"
            dir="rtl"
          >
            <p className="mb-2 text-center text-xl font-bold text-foreground">
              לוח שבועי — {schoolName}
            </p>
            <div ref={boardRef} className="flex min-w-max">
              {/* עמודת שעות */}
              <div className="sticky right-0 z-20 w-14 shrink-0 bg-background shadow-[-4px_0_8px_-8px_hsl(var(--foreground))]">
                <div className="h-8" />
                <div className="relative" style={{ height: ROWS * ROW_H }}>
                  {hourLabels.map((m, i) => (
                    <div
                      key={m}
                      className="absolute inset-x-0 text-[11px] text-muted-foreground text-center"
                      style={{
                        top: i * ROW_H,
                        transform: "translateY(-50%)",
                        fontWeight: m % 60 === 0 ? 700 : 400,
                      }}
                    >
                      {m % 60 === 0 ? fmt(m) : ""}
                    </div>
                  ))}
                </div>
              </div>

              {DAYS.map((d) => (
                <div
                  key={d.idx}
                  className="shrink-0 border-s border-border"
                  style={{ width: Math.max(170, (dayFlexGrow.get(d.idx) ?? 1) * 150) }}
                >
                  <div className="h-8 border-b border-border text-center text-base font-bold leading-8">
                    {d.label}
                  </div>
                  <div
                    className="relative"
                    style={{ height: ROWS * ROW_H }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, d.idx)}
                  >
                    {hourLabels.map((m, i) => (
                      <div
                        key={m}
                        className="absolute inset-x-0 border-t"
                        style={{
                          top: i * ROW_H,
                          borderColor:
                            m % 60 === 0 ? "hsl(var(--border))" : "hsl(var(--border) / 0.4)",
                        }}
                      />
                    ))}
                    {/* קו תחתון אחרון */}
                    <div
                      className="absolute inset-x-0 border-t border-border"
                      style={{ top: ROWS * ROW_H }}
                    />
                    {slots
                      .filter((s) => s.day_of_week === d.idx)
                      .map((s) => {
                        const e = enrollmentMap.get(s.enrollment_id);
                        if (!e) return null;
                        const c = e.teacher_id ? teacherColor.get(e.teacher_id) : undefined;
                        const lay = dayLayouts.get(d.idx)?.get(s.id) ?? { col: 0, cols: 1 };
                        const widthPct = 100 / lay.cols;
                        const teacherPhone = e.teachers?.phone ?? null;
                        const whatsappPhone = teacherPhone?.replace(/\D/g, "").replace(/^0/, "972") ?? null;
                        const fullName = `${e.students?.first_name ?? ""} ${e.students?.last_name ?? ""}${e.students?.grade ? ` · ${e.students.grade}` : ""}`;
                        const subLine = `${fmt(s.start_minutes)} · ${e.instruments?.name ?? ""} · ${e.teachers?.first_name ?? ""} ${e.teachers?.last_name ?? ""}`;
                        return (
                          <div
                            key={s.id}
                            draggable
                            onDragStart={(ev) => {
                              setDragId(e.id);
                              ev.dataTransfer.setData("text/plain", e.id);
                            }}
                            onDragEnd={() => setDragId(null)}
                            onClick={() =>
                              setManual({
                                enrollmentId: e.id,
                                day: s.day_of_week,
                                time: fmt(s.start_minutes),
                              })
                            }
                            title={`${fullName} — ${subLine} (לחיצה לעריכת שעה)`}
                            className="group absolute flex cursor-grab flex-col items-center justify-center overflow-hidden rounded-lg border px-1.5 py-0.5 text-center shadow-sm transition-shadow active:cursor-grabbing active:shadow-md"
                            style={{
                              top: ((s.start_minutes - START_MIN) / STEP) * ROW_H + 1,
                              height: (s.duration_minutes / STEP) * ROW_H - 3,
                              insetInlineStart: `calc(${lay.col * widthPct}% + 2px)`,
                              width: `calc(${widthPct}% - 4px)`,
                              backgroundColor: c?.bg ?? "hsl(var(--muted))",
                              borderColor: c?.border ?? "hsl(var(--border))",
                              borderInlineStartWidth: 3,
                            }}
                          >
                            {/* שורה 1: שם התלמיד וכיתה */}
                            <p
                              className="w-full whitespace-nowrap text-[14px] font-bold leading-[16px] text-foreground"
                            >
                              {e.students?.first_name} {e.students?.last_name}
                              {e.students?.grade ? (
                                <span className="font-normal text-foreground/70"> · {e.students.grade}</span>
                              ) : null}
                            </p>
                            {/* שורה 2: יום */}
                            <p className="w-full whitespace-nowrap text-[11px] leading-[13px] text-foreground/60">
                              יום {d.label}
                            </p>
                            {/* שורה 3: שעה וכלי */}
                            <p className="w-full whitespace-nowrap text-[12px] leading-[14px] text-foreground/75">
                              {fmt(s.start_minutes)} · {e.instruments?.name}
                            </p>
                            {/* שורה 4: שם המורה */}
                            <p className="w-full whitespace-nowrap text-[12px] leading-[14px] text-foreground/75">
                              {e.teachers?.first_name} {e.teachers?.last_name}
                            </p>
                            {/* שורה 4: טלפון המורה */}
                            {teacherPhone && whatsappPhone && (
                              <a
                                href={`https://wa.me/${whatsappPhone}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(ev) => ev.stopPropagation()}
                                onDragStart={(ev) => ev.preventDefault()}
                                className="flex max-w-full items-center gap-1 text-[12px] leading-[14px] text-foreground/65 hover:text-primary"
                                dir="ltr"
                              >
                                <Phone className="h-3 w-3 shrink-0" />
                                <span className="whitespace-nowrap">{teacherPhone}</span>
                              </a>
                            )}
                            <button
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                removeSlot.mutate(e.id);
                              }}
                              className="absolute end-0.5 top-0.5 hidden rounded bg-background/80 p-0.5 group-hover:block"
                              aria-label="הסרה מהלוח"
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </button>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* דיאלוג שיבוץ/עריכה ידנית — שעה חופשית בכל דקה */}
      <Dialog open={!!manual} onOpenChange={(open) => !open && setManual(null)}>
        <DialogContent dir="rtl" className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>שיבוץ ידני לפי שעה</DialogTitle>
          </DialogHeader>
          {manual && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">תלמיד</label>
                <Select
                  value={manual.enrollmentId || undefined}
                  onValueChange={(v) => setManual({ ...manual, enrollmentId: v })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder="בחר תלמיד" />
                  </SelectTrigger>
                  <SelectContent>
                    {enrollments.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.students?.first_name} {e.students?.last_name}
                        {e.students?.grade ? ` · ${e.students.grade}` : ""} — {e.teachers?.first_name}{" "}
                        {e.teachers?.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">יום</label>
                <Select
                  value={String(manual.day)}
                  onValueChange={(v) => setManual({ ...manual, day: Number(v) })}
                >
                  <SelectTrigger className="h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DAYS.map((d) => (
                      <SelectItem key={d.idx} value={String(d.idx)}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">שעת התחלה (כל דקה, למשל 14:05)</label>
                <Input
                  type="time"
                  step={60}
                  dir="ltr"
                  className="h-12"
                  value={manual.time}
                  onChange={(e) => setManual({ ...manual, time: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  בין {fmt(START_MIN)} ל־{fmt(END_MIN)}
                </p>
              </div>
              <Button
                className="h-12 w-full rounded-xl"
                onClick={saveManual}
                disabled={!manual.enrollmentId || saveSlot.isPending}
              >
                {saveSlot.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "שמירה"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== תצוגת ייצוא מעוצבת (נסתרת) — נלכדת לתמונה בלבד ===== */}
      <div
        ref={exportRef}
        dir="rtl"
        style={{
          position: "fixed",
          top: 0,
          left: -10000,
          width: exportWidth,
          background: "#ffffff",
          padding: `48px ${EXPORT_SIDE_PADDING}px 36px`,
          boxSizing: "border-box",
          fontFamily: "inherit",
        }}
      >
        {/* כותרת עם לוגו */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 28,
            borderRadius: 24,
            padding: "28px 36px",
            background: "linear-gradient(135deg, hsl(204 70% 88%), hsl(190 60% 90%))",
            color: "hsl(215 30% 22%)",
            marginBottom: 28,
            boxShadow: "0 12px 30px -12px hsl(204 60% 55% / 0.25)",
          }}
        >
          <img
            src="/logo.png"
            alt="אולפן ומגמת המוסיקה חוף הכרמל"
            style={{ height: 100, width: "auto", objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 17, fontWeight: 600, opacity: 0.75, margin: 0 }}>
              אולפן ומגמת המוסיקה · חוף הכרמל
            </p>
            <p style={{ fontSize: 42, fontWeight: 800, margin: "6px 0 4px", lineHeight: 1.15 }}>
              מערכת שבועית — {schoolName}
            </p>
            <p style={{ fontSize: 18, fontWeight: 600, opacity: 0.8, margin: 0 }}>
              {selectedYear ? `שנת לימודים ${selectedYear.name}` : ""}
              {selectedYear ? " · " : ""}
              {new Date().toLocaleDateString("he-IL", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>

        {/* מקרא מורים */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 22 }}>
          {Array.from(teacherColor.entries()).map(([tid, c]) => {
            const t = enrollments.find((e) => e.teacher_id === tid)?.teachers;
            if (!t) return null;
            return (
              <span
                key={tid}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  background: c.bg,
                  border: `2px solid ${c.border}`,
                  borderRadius: 999,
                  padding: "8px 16px",
                  fontSize: 17,
                  fontWeight: 700,
                  color: "hsl(215 30% 25%)",
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    background: c.border,
                    display: "inline-block",
                  }}
                />
                {t.first_name} {t.last_name}
              </span>
            );
          })}
        </div>

        {/* הלוח */}
        <div
          style={{
            display: "flex",
            border: "1px solid hsl(214 25% 88%)",
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          {/* עמודת שעות */}
          <div style={{ width: EXPORT_TIME_COL_W, flexShrink: 0, background: "hsl(210 40% 98%)" }}>
            <div style={{ height: 64 }} />
            <div style={{ position: "relative", height: ROWS * EXPORT_ROW_H }}>
              {hourLabels.map((m, i) => (
                <div
                  key={m}
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: i * EXPORT_ROW_H,
                    transform: "translateY(-50%)",
                    textAlign: "center",
                    fontSize: 17,
                    color: "hsl(215 20% 45%)",
                    fontWeight: m % 60 === 0 ? 700 : 400,
                  }}
                >
                  {m % 60 === 0 ? fmt(m) : ""}
                </div>
              ))}
            </div>
          </div>

          {DAYS.map((d) => (
            <div
              key={d.idx}
              style={{
                width: exportDayWidths.get(d.idx) ?? EXPORT_LANE_W,
                flex: "0 0 auto",
                borderInlineStart: "1px solid hsl(214 25% 88%)",
              }}
            >
              <div
                style={{
                  height: 64,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 24,
                  fontWeight: 800,
                  color: "hsl(204 60% 35%)",
                  background: "hsl(204 70% 95%)",
                  borderBottom: "1px solid hsl(214 25% 88%)",
                }}
              >
                יום {d.label}
              </div>
              <div style={{ position: "relative", height: ROWS * EXPORT_ROW_H }}>
                {hourLabels.map((m, i) => (
                  <div
                    key={m}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: i * EXPORT_ROW_H,
                      borderTop: `1px solid ${m % 60 === 0 ? "hsl(214 25% 88%)" : "hsl(214 25% 88% / 0.4)"}`,
                    }}
                  />
                ))}
                {slots
                  .filter((s) => s.day_of_week === d.idx)
                  .map((s) => {
                    const e = enrollmentMap.get(s.enrollment_id);
                    if (!e) return null;
                    const c = e.teacher_id ? teacherColor.get(e.teacher_id) : undefined;
                    const lay = dayLayouts.get(d.idx)?.get(s.id) ?? { col: 0, cols: 1 };
                    const widthPct = 100 / lay.cols;
                    return (
                      <div
                        key={s.id}
                        style={{
                          position: "absolute",
                          top: ((s.start_minutes - START_MIN) / STEP) * EXPORT_ROW_H + 2,
                          height: (s.duration_minutes / STEP) * EXPORT_ROW_H - 5,
                          insetInlineStart: `calc(${lay.col * widthPct}% + 3px)`,
                          width: `calc(${widthPct}% - 6px)`,
                          background: c?.bg ?? "hsl(210 30% 94%)",
                          border: `2px solid ${c?.border ?? "hsl(214 20% 80%)"}`,
                          borderInlineStartWidth: 6,
                          borderRadius: 14,
                          boxShadow: "0 2px 8px -2px rgb(0 0 0 / 0.14)",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          textAlign: "center",
                          padding: "4px 8px",
                           boxSizing: "border-box",
                          overflow: "hidden",
                        }}
                      >
                        <p
                           data-fit-export="22"
                           data-fit-min="12"
                          style={{
                            margin: 0,
                             width: "100%",
                             minWidth: 0,
                            fontSize: 22,
                            fontWeight: 800,
                            lineHeight: "26px",
                            color: "hsl(215 30% 20%)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e.students?.first_name} {e.students?.last_name}
                          {e.students?.grade ? (
                            <span style={{ fontWeight: 500, opacity: 0.7 }}> · {e.students.grade}</span>
                          ) : null}
                        </p>
                        <p
                           data-fit-export="15"
                           data-fit-min="11"
                          style={{
                            margin: 0,
                             width: "100%",
                             minWidth: 0,
                            fontSize: 15,
                            lineHeight: "19px",
                            color: "hsl(215 25% 35% / 0.65)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          יום {d.label}
                        </p>
                        <p
                           data-fit-export="16"
                           data-fit-min="11"
                          style={{
                            margin: 0,
                             width: "100%",
                             minWidth: 0,
                            fontSize: 16,
                            lineHeight: "20px",
                            color: "hsl(215 25% 35% / 0.85)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {fmt(s.start_minutes)} · {e.instruments?.name}
                        </p>
                        <p
                           data-fit-export="16"
                           data-fit-min="11"
                          style={{
                            margin: 0,
                             width: "100%",
                             minWidth: 0,
                            fontSize: 16,
                            lineHeight: "20px",
                            color: "hsl(215 25% 35% / 0.85)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {e.teachers?.first_name} {e.teachers?.last_name}
                        </p>
                         {e.teachers?.phone ? (
                           <p
                             dir="ltr"
                             data-fit-export="15"
                             data-fit-min="11"
                             style={{
                               margin: 0,
                               width: "100%",
                               minWidth: 0,
                               fontSize: 15,
                               lineHeight: "18px",
                               color: "hsl(215 25% 35% / 0.78)",
                               whiteSpace: "nowrap",
                             }}
                           >
                             {e.teachers.phone}
                           </p>
                         ) : null}
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </div>

        {/* כותרת תחתונה */}
        <div
          style={{
            marginTop: 28,
            textAlign: "center",
            fontSize: 18,
            color: "hsl(215 20% 40%)",
            fontWeight: 600,
            lineHeight: 1.7,
          }}
        >
          {coordinator && (
            <p style={{ margin: 0 }}>
              רכז: {coordinator.first_name} {coordinator.last_name}
              {coordinator.phone ? ` · ${coordinator.phone}` : ""}
            </p>
          )}
          <p style={{ margin: 0 }}>
            טלפון משרד: 04-6299711 · מייל: music.hof@gmail.com
          </p>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 16,
              color: "hsl(215 20% 50%)",
            }}
          >
            אולפן ומגמת המוסיקה חוף הכרמל
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        גררו תלמיד מהרשימה אל המשבצת הרצויה. גרירה חזרה לרשימה מסירה אותו מהלוח.
      </p>
    </div>
  );
};

export default BranchScheduleBoard;
