import { useEffect, useMemo, useState } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import {
  fetchCalendarData,
  createCalendarItem,
  updateCalendarItem,
  deleteCalendarItem,
  restoreCalendarItem,
  type CalendarItem,
  type CalendarFormValues,
  type Track,
  type Branch,
  type Person,
} from "@/services/calendarStore";
import { toast } from "sonner";

/* ------------------------------------------------------------------
   שלב 3 — שנה מלאה: אוגוסט 2026 עד אוגוסט 2027, גלילה אנכית רציפה.
   ציר הימים: יום 1 בקצה הימני (נגזר מ־direction: rtl על ה־Grid).
------------------------------------------------------------------- */
const DAY_AXIS_DIR: "rtl" | "ltr" = "rtl";

const START_YEAR = 2026;
const START_MONTH = 8; // אוגוסט
const MONTH_COUNT = 13;
const COL_WIDTH = 90;
const MONTH_COL_WIDTH = 120;

const MONTH_NAMES_HE = [
  "ינואר",
  "פברואר",
  "מרץ",
  "אפריל",
  "מאי",
  "יוני",
  "יולי",
  "אוגוסט",
  "ספטמבר",
  "אוקטובר",
  "נובמבר",
  "דצמבר",
];

const HEB_WEEKDAYS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

const COLORS = {
  monthHeader: "#E88C7D",
  dayNumbers: "#F5C9A8",
  weekend: "#D9D9D9",
  grid: "#E5E5E5",
  reserves: "#FDE68A",
  atWork: "#4ADE80",
  home: "#93C5FD",
  holiday: "#86A96B",
  memorial: "#3FA9BE",
};

/** צבע לפי סוג אירוע. אירוע רגיל — ללא צבע (לבן עם מסגרת). */
const TRACK_BG: Record<string, string> = {
  availability_reserves: COLORS.reserves,
  availability_at_work: COLORS.atWork,
  availability_home: COLORS.home,
  vacation: COLORS.holiday,
  memorial: COLORS.memorial,
  regular: "#FFFFFF",
};

const AVAILABILITY_LABEL: Record<string, string> = {
  reserves: "מילואים",
  at_work: "בעבודה",
  home: "בבית",
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: "מאושר",
  tentative: "טנטטיבי",
  cancelled: "מבוטל",
};

const pad2 = (n: number) => String(n).padStart(2, "0");
const isoDate = (year: number, month: number, day: number) =>
  `${year}-${pad2(month)}-${pad2(day)}`;
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();

type MonthDef = {
  key: string;
  year: number;
  month: number; // 1-12
  label: string;
  dayCount: number;
  startISO: string;
  endISO: string;
};

const MONTHS: MonthDef[] = Array.from({ length: MONTH_COUNT }, (_, i) => {
  const raw = START_MONTH - 1 + i;
  const year = START_YEAR + Math.floor(raw / 12);
  const month = (raw % 12) + 1;
  const dayCount = daysInMonth(year, month);
  return {
    key: `${year}-${pad2(month)}`,
    year,
    month,
    label: MONTH_NAMES_HE[month - 1],
    dayCount,
    startISO: isoDate(year, month, 1),
    endISO: isoDate(year, month, dayCount),
  };
});

const RANGE_START = MONTHS[0].startISO;
const RANGE_END = MONTHS[MONTHS.length - 1].endISO;

const emptyForm = (): CalendarFormValues => ({
  title_he: "",
  description_he: "",
  start_time: "",
  location_he: "",
  track_id: "",
  branch_id: null,
  person_id: null,
  availability_state: null,
  start_date: "",
  end_date: "",
  status: "confirmed",
});

const monthGridStyle = (dayCount: number): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: `repeat(${dayCount}, minmax(${COL_WIDTH}px, 1fr))`,
  direction: DAY_AXIS_DIR,
  minWidth: `${dayCount * COL_WIDTH}px`,
});

type UIItem = {
  id: string;
  title: string;
  detail?: string;
  time?: string;
  place?: string;
  from: number;
  to: number;
  bg: string;
  bordered: boolean;
  clippedStart: boolean;
  clippedEnd: boolean;
  raw: CalendarItem;
};

/** HH:MM מתוך ערך time של המסד */
const formatTime = (value?: string | null) => (value ? value.slice(0, 5) : "");

/** סידור שורות אוטומטי — לכל פריט השורה הראשונה ללא חפיפה. */
const packLanes = (list: UIItem[]): UIItem[][] => {
  const sorted = [...list].sort((a, b) => a.from - b.from || a.to - b.to);
  const lanes: UIItem[][] = [];
  sorted.forEach((item) => {
    let lane = lanes.find((l) => l.every((x) => item.from > x.to || item.to < x.from));
    if (!lane) {
      lane = [];
      lanes.push(lane);
    }
    lane.push(item);
  });
  return lanes;
};

const AdminYearCalendar = () => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CalendarFormValues>(emptyForm());
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchCalendarData(RANGE_START, RANGE_END);
      setTracks(data.tracks);
      setBranches(data.branches);
      setPeople(data.people);
      setItems(data.items);
    } catch (e: any) {
      setError(e.message ?? "שגיאה בטעינת הנתונים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAddDialog = (trackId: string, monthDef: MonthDef, day: number) => {
    const track = tracks.find((t) => t.id === trackId);
    const date = isoDate(monthDef.year, monthDef.month, day);
    setEditingId(null);
    setForm({
      ...emptyForm(),
      track_id: trackId,
      start_date: date,
      end_date: date,
      availability_state: track?.key === "availability" ? "reserves" : null,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item: CalendarItem) => {
    setEditingId(item.id);
    setForm({
      title_he: item.title_he,
      description_he: item.description_he ?? "",
      start_time: formatTime((item as any).start_time),
      location_he: (item as any).location_he ?? "",
      track_id: item.track_id,
      branch_id: item.branch_id,
      person_id: item.person_id,
      availability_state: (item.availability_state as any) ?? null,
      start_date: item.start_date,
      end_date: item.end_date,
      status: (item.status as any) ?? "confirmed",
    });
    setDialogOpen(true);
  };

  const pushUndo = (entry: UndoEntry) => {
    undoStack.current = [...undoStack.current.slice(-19), entry];
  };

  const handleSave = async () => {
    if (!form.title_he.trim() || !form.track_id || !form.start_date || !form.end_date) {
      return;
    }
    try {
      setSaving(true);
      if (editingId) {
        const before = items.find((i) => i.id === editingId);
        await updateCalendarItem(editingId, form);
        if (before) {
          pushUndo({ kind: "update", id: editingId, before: rowToForm(before) });
        }
      } else {
        const created = await createCalendarItem(form);
        pushUndo({ kind: "create", id: created.id });
      }
      await load();
      setDialogOpen(false);
    } catch (e: any) {
      setError(e.message ?? "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!editingId) return;
    try {
      setSaving(true);
      const before = items.find((i) => i.id === editingId);
      await deleteCalendarItem(editingId);
      if (before) {
        const { track, branch, person, ...row } = before as any;
        pushUndo({ kind: "delete", row });
      }
      await load();
      setDialogOpen(false);
    } catch (e: any) {
      setError(e.message ?? "שגיאה במחיקה");
    } finally {
      setSaving(false);
    }
  };

  /** ביטול הפעולה האחרונה (⌘Z / Ctrl+Z). */
  const handleUndo = async () => {
    const entry = undoStack.current.pop();
    if (!entry) {
      toast("אין פעולה לביטול");
      return;
    }
    try {
      setSaving(true);
      if (entry.kind === "create") {
        await deleteCalendarItem(entry.id);
        toast.success("ההוספה בוטלה");
      } else if (entry.kind === "update") {
        await updateCalendarItem(entry.id, entry.before);
        toast.success("העריכה בוטלה");
      } else {
        await restoreCalendarItem(entry.row);
        toast.success("המחיקה בוטלה");
      }
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "שגיאה בביטול הפעולה");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === "z";
      if (!isUndo) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;
      e.preventDefault();
      void handleUndo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const selectedTrack = useMemo(
    () => tracks.find((t) => t.id === form.track_id),
    [tracks, form.track_id]
  );

  /** פריטים חתוכים לגבולות חודש, מקובצים לפי מסלול. */
  const itemsByMonth = useMemo(() => {
    const result: Record<string, Record<string, UIItem[]>> = {};
    MONTHS.forEach((m) => {
      const byTrack: Record<string, UIItem[]> = {};
      tracks.forEach((t) => (byTrack[t.key] = []));

      items.forEach((item) => {
        if (item.start_date > m.endISO || item.end_date < m.startISO) return;
        const key = item.track?.key ?? "";
        const clippedStart = item.start_date < m.startISO;
        const clippedEnd = item.end_date > m.endISO;
        const from = clippedStart ? 1 : Number(item.start_date.slice(8, 10));
        const to = clippedEnd ? m.dayCount : Number(item.end_date.slice(8, 10));
        const bgKey = item.availability_state ? `${key}_${item.availability_state}` : key;

        byTrack[key] = byTrack[key] ?? [];
        byTrack[key].push({
          id: item.id,
          title: item.title_he,
          detail: item.description_he ?? undefined,
          time: formatTime((item as any).start_time) || undefined,
          place: (item as any).location_he ?? undefined,
          from,
          to,
          bg: TRACK_BG[bgKey] ?? "#FFFFFF",
          bordered: key === "regular",
          clippedStart,
          clippedEnd,
          raw: item,
        });
      });

      result[m.key] = byTrack;
    });
    return result;
  }, [items, tracks]);

  const renderMonth = (m: MonthDef) => {
    const gridStyle = monthGridStyle(m.dayCount);
    const days = Array.from({ length: m.dayCount }, (_, i) => i + 1);
    const weekdayOf = (day: number) => new Date(m.year, m.month - 1, day).getDay();
    const isWeekend = (day: number) => weekdayOf(day) === 5 || weekdayOf(day) === 6;
    const byTrack = itemsByMonth[m.key] ?? {};

    const renderLane = (
      track: Track,
      lane: UIItem[],
      laneIndex: number,
      rowHeight: number,
      compact: boolean
    ) => {
      const occupied = new Set<number>();
      lane.forEach((item) => {
        for (let d = item.from; d <= item.to; d++) occupied.add(d);
      });

      return (
        <div
          key={`${track.key}-lane-${laneIndex}`}
          style={{
            ...gridStyle,
            minHeight: rowHeight,
            position: "relative",
            zIndex: 1,
            borderTop: laneIndex === 0 ? `1px solid ${COLORS.grid}` : undefined,
          }}
        >
          {lane.map((item) => {
            const span = item.to - item.from + 1;
            const radius = compact ? 4 : 6;
            const startRadius = item.clippedStart ? 0 : radius;
            const endRadius = item.clippedEnd ? 0 : radius;
            const showText = !compact || span * COL_WIDTH >= 60;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openEditDialog(item.raw)}
                style={{
                  gridColumn: `${item.from} / span ${span}`,
                  gridRow: 1,
                  backgroundColor: item.bg,
                  border: item.bordered && !compact ? "1px solid #9CA3AF" : "none",
                  borderStartStartRadius: startRadius,
                  borderEndStartRadius: startRadius,
                  borderStartEndRadius: endRadius,
                  borderEndEndRadius: endRadius,
                  margin: compact ? 2 : 3,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  fontSize: compact ? 11 : 13,
                  color: "#1F2937",
                  minWidth: 0,
                  paddingInline: 8,
                  paddingBlock: compact ? 2 : 4,
                  overflow: "visible",
                  textAlign: "center",
                  cursor: "pointer",
                }}
                title={[item.title, item.detail, item.time, item.place]
                  .filter(Boolean)
                  .join(" — ")}
              >
                {showText && (
                  <span
                    style={{
                      position: "sticky",
                      insetInline: 8,
                      zIndex: 1,
                      display: "block",
                      width: "100%",
                      minWidth: 0,
                      lineHeight: 1.25,
                      textAlign: "center",
                    }}
                  >
                    <span
                      className="font-semibold"
                      style={{
                        display: "block",
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                        wordBreak: "break-word",
                      }}
                    >
                      {item.title}
                    </span>
                    {item.detail && (
                      <span
                        className="font-normal"
                        style={{
                          display: "block",
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                          opacity: 0.9,
                        }}
                      >
                        {item.detail}
                      </span>
                    )}
                    {(item.time || item.place) && (
                      <span
                        className="font-normal"
                        style={{
                          display: "block",
                          whiteSpace: "normal",
                          overflowWrap: "anywhere",
                          opacity: 0.75,
                          fontSize: compact ? 10 : 11,
                        }}
                      >
                        {[item.time, item.place].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                )}
              </button>
            );
          })}
          {days
            .filter((d) => !occupied.has(d))
            .map((d) => (
              <button
                key={`empty-${d}`}
                type="button"
                onClick={() => openAddDialog(track.id, m, d)}
                style={{
                  gridColumn: `${d} / span 1`,
                  gridRow: 1,
                  minHeight: rowHeight,
                  backgroundColor: "transparent",
                  border: "none",
                  cursor: "pointer",
                }}
                aria-label={`הוסף אירוע ב${d} ב${m.label} ${m.year} — ${track.label_he}`}
              />
            ))}
        </div>
      );
    };

    return (
      <div key={m.key} style={{ borderBottom: `2px solid ${COLORS.grid}` }}>
        <div className="flex" style={{ minWidth: "min-content" }}>
          {/* עמודת שם החודש — דביקה */}
          <div
            className="sticky shrink-0"
            style={{
              insetInlineStart: 0,
              zIndex: 3,
              width: MONTH_COL_WIDTH,
              backgroundColor: COLORS.monthHeader,
              color: "#3B1D18",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontFamily: "'Rubik', sans-serif",
              fontWeight: 600,
              fontSize: 18,
            }}
          >
            {m.label} {m.year}
          </div>

          <div className="min-w-0">
            {/* מספרי ימים */}
            <div style={{ ...gridStyle, backgroundColor: COLORS.dayNumbers }}>
              {days.map((d) => (
                <div
                  key={d}
                  style={{
                    minWidth: 0,
                    borderInlineStart: `1px solid ${COLORS.grid}`,
                    textAlign: "center",
                    padding: "4px 0",
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#4B2E27",
                  }}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* ימי שבוע */}
            <div style={{ ...gridStyle, borderBottom: `1px solid ${COLORS.grid}` }}>
              {days.map((d) => (
                <div
                  key={d}
                  style={{
                    minWidth: 0,
                    borderInlineStart: `1px solid ${COLORS.grid}`,
                    textAlign: "center",
                    padding: "3px 0",
                    fontSize: 12,
                    color: "#374151",
                    backgroundColor: isWeekend(d) ? COLORS.weekend : "transparent",
                  }}
                >
                  {HEB_WEEKDAYS[weekdayOf(d)]}
                </div>
              ))}
            </div>

            {/* מסלולי תוכן — עם שכבת רקע רציפה */}
            <div style={{ position: "relative" }}>
              <div
                aria-hidden
                style={{
                  ...gridStyle,
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  zIndex: 0,
                }}
              >
                {days.map((d) => (
                  <div
                    key={d}
                    style={{
                      minWidth: 0,
                      borderInlineStart: `1px solid ${COLORS.grid}`,
                      backgroundColor: isWeekend(d) ? COLORS.weekend : "transparent",
                    }}
                  />
                ))}
              </div>

              {tracks.map((track) => {
                const compact = track.key === "availability";
                const rowHeight = compact ? 22 : 34;
                const lanes = packLanes(byTrack[track.key] ?? []);
                const rendered = lanes.length ? lanes : [[]];
                return (
                  <div key={track.key}>
                    {rendered.map((lane, i) =>
                      renderLane(track, lane, i, rowHeight, compact)
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <AdminLayout title="לוח שנה שנתי">
      <PageTitle title="לוח שנה שנתי" />

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-4 text-red-700">
          {error}
          <Button variant="ghost" size="sm" onClick={() => setError(null)} className="me-2">
            הסתר
          </Button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-muted-foreground">טוען…</div>
      ) : (
        <div
          className="overflow-x-auto rounded-xl border"
          style={{
            borderColor: COLORS.grid,
            fontFamily: "'Assistant', sans-serif",
            scrollBehavior: "smooth",
          }}
        >
          {MONTHS.map((m) => renderMonth(m))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingId ? "עריכת אירוע" : "הוספת אירוע"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">כותרת ראשית</Label>
              <Input
                id="title"
                value={form.title_he}
                onChange={(e) => setForm({ ...form, title_he: e.target.value })}
                placeholder="למשל: ישיבת פתיחת שנה"
                className="h-12 rounded-xl text-right"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">פירוט (אופציונלי)</Label>
              <Input
                id="description"
                value={form.description_he}
                onChange={(e) => setForm({ ...form, description_he: e.target.value })}
                placeholder="למשל: כל מורי האולפן"
                className="h-12 rounded-xl text-right"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="time">שעה</Label>
                <Input
                  id="time"
                  type="time"
                  value={form.start_time}
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                  className="h-12 rounded-xl text-center"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="location">מיקום</Label>
                <Input
                  id="location"
                  value={form.location_he}
                  onChange={(e) => setForm({ ...form, location_he: e.target.value })}
                  placeholder="למשל: העמר"
                  className="h-12 rounded-xl text-right"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>סוג אירוע</Label>
              <Select
                value={form.track_id}
                onValueChange={(value) =>
                  setForm({
                    ...form,
                    track_id: value,
                    availability_state:
                      tracks.find((t) => t.id === value)?.key === "availability"
                        ? "reserves"
                        : null,
                  })
                }
              >
                <SelectTrigger className="h-11 rounded-xl text-right">
                  <SelectValue placeholder="בחר סוג אירוע" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  {tracks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label_he}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedTrack?.key === "availability" && (
              <div className="grid gap-2">
                <Label>צבע</Label>
                <div className="flex gap-3">
                  {(["reserves", "at_work", "home"] as const).map((state) => {
                    const active = (form.availability_state ?? "reserves") === state;
                    return (
                      <button
                        key={state}
                        type="button"
                        onClick={() => setForm({ ...form, availability_state: state })}
                        className="flex flex-1 items-center justify-center gap-2 rounded-xl border px-3 h-11 text-sm transition"
                        style={{
                          borderColor: active ? "#1F2937" : COLORS.grid,
                          borderWidth: active ? 2 : 1,
                          backgroundColor: TRACK_BG[`availability_${state}`],
                          color: "#1F2937",
                        }}
                      >
                        {AVAILABILITY_LABEL[state]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>תאריך התחלה</Label>
                <DateInput
                  value={form.start_date}
                  onChange={(value) => setForm({ ...form, start_date: value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>תאריך סיום</Label>
                <DateInput
                  value={form.end_date}
                  onChange={(value) => setForm({ ...form, end_date: value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>סטטוס</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm({ ...form, status: value as any })}
              >
                <SelectTrigger className="h-11 rounded-xl text-right">
                  <SelectValue placeholder="בחר סטטוס" />
                </SelectTrigger>
                <SelectContent dir="rtl">
                  <SelectItem value="confirmed">{STATUS_LABEL.confirmed}</SelectItem>
                  <SelectItem value="tentative">{STATUS_LABEL.tentative}</SelectItem>
                  <SelectItem value="cancelled">{STATUS_LABEL.cancelled}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-row-reverse">
            {editingId && (
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={saving}
                className="h-12 rounded-xl"
              >
                מחק
              </Button>
            )}
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="h-12 rounded-xl"
            >
              ביטול
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                saving ||
                !form.title_he.trim() ||
                !form.track_id ||
                !form.start_date ||
                !form.end_date
              }
              className="h-12 rounded-xl"
            >
              {saving ? "שומר…" : editingId ? "שמור שינויים" : "הוסף אירוע"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminYearCalendar;
