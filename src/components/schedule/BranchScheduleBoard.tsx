import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { Download, Loader2, Trash2, Users } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { cmpHe } from "@/lib/sortHebrew";

const DAYS = [
  { idx: 0, label: "ראשון" },
  { idx: 1, label: "שני" },
  { idx: 2, label: "שלישי" },
  { idx: 3, label: "רביעי" },
  { idx: 4, label: "חמישי" },
  { idx: 5, label: "שישי" },
];

const START_MIN = 8 * 60; // 08:00
const END_MIN = 16 * 60; // 16:00
const STEP = 15; // דקות
const ROW_H = 22; // px לכל 15 דקות
const ROWS = (END_MIN - START_MIN) / STEP;

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

type EnrollmentRow = {
  id: string;
  lesson_duration_minutes: number | null;
  teacher_id: string | null;
  students: { first_name: string; last_name: string; grade: string | null } | null;
  teachers: { first_name: string; last_name: string } | null;
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
  const { selectedYearId } = useAcademicYear();
  const qc = useQueryClient();
  const boardRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const { data: enrollments = [], isLoading: loadingEnrollments } = useQuery({
    queryKey: ["branch-schedule-enrollments", schoolId, selectedYearId],
    enabled: !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(
          "id, lesson_duration_minutes, teacher_id, students(first_name, last_name, grade), teachers(first_name, last_name), instruments(name)",
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

  const exportPng = async () => {
    if (!boardRef.current) return;
    setExporting(true);
    try {
      const el = boardRef.current;
      const fullWidth = el.scrollWidth;
      const fullHeight = el.scrollHeight;
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        width: fullWidth,
        height: fullHeight,
        windowWidth: fullWidth + 40,
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
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
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
          <p className="mb-2 flex items-center gap-2 font-semibold">
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
                  className="cursor-grab rounded-lg border px-2 py-1.5 text-xs text-right active:cursor-grabbing"
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
                  <p className="text-[11px] text-foreground/70">
                    {e.instruments?.name} · {e.teachers?.first_name} {e.teachers?.last_name} ·{" "}
                    {e.lesson_duration_minutes || 30}′
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* הלוח */}
        <div className="overflow-x-auto overscroll-x-contain">
          <div ref={boardRef} className="min-w-[720px] rounded-2xl border border-border bg-card p-3">
            <p className="mb-2 text-center text-lg font-bold text-foreground">
              לוח שבועי — {schoolName}
            </p>
            <div className="flex">
              {/* עמודת שעות */}
              <div className="w-14 shrink-0">
                <div className="h-8" />
                <div className="relative" style={{ height: ROWS * ROW_H }}>
                  {hourLabels.map((m, i) => (
                    <div
                      key={m}
                      className="absolute inset-x-0 text-[10px] text-muted-foreground text-center"
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
                <div key={d.idx} className="flex-1 border-s border-border">
                  <div className="h-8 border-b border-border text-center text-sm font-bold leading-8">
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
                        className="absolute inset-x-0 border-b"
                        style={{
                          top: i * ROW_H,
                          height: ROW_H,
                          borderColor:
                            m % 60 === 0 ? "hsl(var(--border))" : "hsl(var(--border) / 0.4)",
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
                            draggable
                            onDragStart={(ev) => {
                              setDragId(e.id);
                              ev.dataTransfer.setData("text/plain", e.id);
                            }}
                            onDragEnd={() => setDragId(null)}
                            className="group absolute cursor-grab overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] shadow-sm active:cursor-grabbing"
                            style={{
                              top: ((s.start_minutes - START_MIN) / STEP) * ROW_H,
                              height: (s.duration_minutes / STEP) * ROW_H - 2,
                              insetInlineStart: `calc(${lay.col * widthPct}% + 2px)`,
                              width: `calc(${widthPct}% - 4px)`,
                              backgroundColor: c?.bg ?? "hsl(var(--muted))",
                              borderColor: c?.border ?? "hsl(var(--border))",
                            }}
                          >
                            <p className="truncate font-bold text-foreground">
                              {e.students?.first_name} {e.students?.last_name}
                              {e.students?.grade ? (
                                <span className="font-normal text-foreground/70"> · {e.students.grade}</span>
                              ) : null}
                            </p>
                            <p className="truncate text-[10px] text-foreground/70">
                              {fmt(s.start_minutes)} · {e.instruments?.name} ·{" "}
                              {e.teachers?.first_name}
                            </p>
                            <button
                              type="button"
                              onClick={() => removeSlot.mutate(e.id)}
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

      <p className="mt-3 text-sm text-muted-foreground">
        גררו תלמיד מהרשימה אל המשבצת הרצויה. גרירה חזרה לרשימה מסירה אותו מהלוח.
      </p>
    </div>
  );
};

export default BranchScheduleBoard;
