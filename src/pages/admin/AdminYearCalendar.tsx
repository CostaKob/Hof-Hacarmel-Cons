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
  type CalendarItem,
  type CalendarFormValues,
  type Track,
  type Branch,
  type Person,
} from "@/services/calendarStore";

/* ------------------------------------------------------------------
   שלב 2 — נתונים ממסד הנתונים, הוספה / עריכה / מחיקה בדיאלוג עברי.
   ציר הימים: יום 1 בקצה הימני (נגזר מ־direction: rtl על ה־Grid).
------------------------------------------------------------------- */
const DAY_AXIS_DIR: "rtl" | "ltr" = "rtl";

const YEAR = 2026;
const MONTH = 10; // אוקטובר
const DAYS_IN_MONTH = new Date(YEAR, MONTH, 0).getDate();
const MONTH_LABEL = "אוקטובר";
const COL_WIDTH = 90;

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

const TRACK_BG: Record<string, string> = {
  availability_reserves: COLORS.reserves,
  availability_at_work: COLORS.atWork,
  availability_home: COLORS.home,
  holidays: COLORS.holiday,
  branch_events: "#FFFFFF",
  notes: "#F3F4F6",
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

const days = Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1);
const weekdayOf = (day: number) => new Date(YEAR, MONTH - 1, day).getDay();
const isWeekend = (day: number) => weekdayOf(day) === 5 || weekdayOf(day) === 6;

const dateOfDay = (day: number) => {
  const d = new Date(YEAR, MONTH - 1, day);
  return d.toISOString().split("T")[0];
};

const dayFromDate = (iso: string) => {
  const d = new Date(iso);
  return d.getDate();
};

const emptyForm = (): CalendarFormValues => ({
  title_he: "",
  description_he: "",
  track_id: "",
  branch_id: null,
  person_id: null,
  availability_state: null,
  start_date: "",
  end_date: "",
  status: "confirmed",
});

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: `repeat(${DAYS_IN_MONTH}, minmax(${COL_WIDTH}px, 1fr))`,
  direction: DAY_AXIS_DIR,
  minWidth: `${DAYS_IN_MONTH * COL_WIDTH}px`,
};

const cellTextStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  paddingInline: 8,
  textAlign: "start",
};

type UIItem = {
  id: string;
  title: string;
  detail?: string;
  from: number;
  to: number;
  bg: string;
  bordered?: boolean;
  trackKey: string;
  raw: CalendarItem;
};

const WeekendBackdrop = () => (
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
);

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
      const data = await fetchCalendarData(YEAR);
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

  const itemsByTrack = useMemo(() => {
    const map: Record<string, UIItem[]> = {};
    tracks.forEach((t) => (map[t.key] = []));

    items.forEach((item) => {
      const key = item.track?.key ?? "";
      const from = dayFromDate(item.start_date);
      const to = dayFromDate(item.end_date);
      const bgKey = item.availability_state
        ? `${key}_${item.availability_state}`
        : key;
      const bg = TRACK_BG[bgKey] ?? "#F3F4F6";
      const isContinuous = item.track?.is_continuous ?? false;

      map[key] = map[key] ?? [];
      map[key].push({
        id: item.id,
        title: item.title_he,
        detail: item.description_he ?? undefined,
        from,
        to,
        bg,
        bordered: !isContinuous,
        trackKey: key,
        raw: item,
      });
    });

    return map;
  }, [items, tracks]);

  const openAddDialog = (trackId: string, day?: number) => {
    const track = tracks.find((t) => t.id === trackId);
    const start = day ? dateOfDay(day) : dateOfDay(1);
    const end = day ? dateOfDay(day) : dateOfDay(DAYS_IN_MONTH);

    setEditingId(null);
    setForm({
      ...emptyForm(),
      track_id: trackId,
      start_date: start,
      end_date: end,
      availability_state:
        track?.key === "availability" ? "reserves" : null,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (item: CalendarItem) => {
    setEditingId(item.id);
    setForm({
      title_he: item.title_he,
      description_he: item.description_he ?? "",
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

  const handleSave = async () => {
    if (!form.title_he.trim() || !form.track_id || !form.start_date || !form.end_date) {
      return;
    }
    try {
      setSaving(true);
      if (editingId) {
        await updateCalendarItem(editingId, form);
      } else {
        await createCalendarItem(form);
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
      await deleteCalendarItem(editingId);
      await load();
      setDialogOpen(false);
    } catch (e: any) {
      setError(e.message ?? "שגיאה במחיקה");
    } finally {
      setSaving(false);
    }
  };

  const selectedTrack = useMemo(
    () => tracks.find((t) => t.id === form.track_id),
    [tracks, form.track_id]
  );

  const TrackRow = ({ trackKey }: { trackKey: string }) => {
    const track = tracks.find((t) => t.key === trackKey);
    const rowItems = itemsByTrack[trackKey] ?? [];

    return (
      <div style={{ ...gridStyle, minHeight: 34, position: "relative", zIndex: 1 }}>
        {rowItems.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => openEditDialog(item.raw)}
            style={{
              gridColumn: `${item.from} / span ${item.to - item.from + 1}`,
              gridRow: 1,
              backgroundColor: item.bg,
              border: item.bordered ? `1px solid #9CA3AF` : "none",
              borderRadius: 6,
              margin: 3,
              display: "flex",
              alignItems: "center",
              position: "relative",
              fontSize: 13,
              color: "#1F2937",
              minWidth: 0,
              paddingInline: 8,
              overflow: "hidden",
              textAlign: "start",
              cursor: "pointer",
            }}
            title={[item.title, item.detail].filter(Boolean).join(" — ")}
          >
            <span
              style={{
                position: "sticky",
                insetInlineStart: 8,
                zIndex: 1,
                display: "flex",
                alignItems: "center",
                gap: 6,
                minWidth: 0,
              }}
            >
              <span
                className="font-semibold"
                style={{
                  paddingInline: 0,
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                }}
              >
                {item.title}
              </span>
              {item.detail && (
                <span
                  className="font-normal"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    paddingInline: 0,
                  }}
                >
                  {item.detail}
                </span>
              )}
            </span>
          </button>
        ))}
        {track &&
          days.map((d) => (
            <button
              key={`empty-${d}`}
              type="button"
              onClick={() => openAddDialog(track.id, d)}
              style={{
                gridColumn: `${d} / span 1`,
                gridRow: 1,
                minHeight: 34,
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
              }}
              aria-label={`הוסף אירוע ב${d} ב${MONTH_LABEL}`}
            />
          ))}
      </div>
    );
  };

  const AvailabilityRow = ({ trackKey }: { trackKey: string }) => {
    const track = tracks.find((t) => t.key === trackKey);
    const rowItems = itemsByTrack[trackKey] ?? [];

    return (
      <div
        style={{
          ...gridStyle,
          minHeight: 22,
          position: "relative",
          zIndex: 1,
          borderTop: `1px solid ${COLORS.grid}`,
        }}
      >
        {rowItems.map((item) => {
          const span = item.to - item.from + 1;
          const showText = span * COL_WIDTH >= 60;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => openEditDialog(item.raw)}
              style={{
                ...cellTextStyle,
                gridColumn: `${item.from} / span ${span}`,
                gridRow: 1,
                backgroundColor: item.bg,
                borderRadius: 4,
                margin: 2,
                display: "flex",
                alignItems: "center",
                fontSize: 11,
                color: "#1F2937",
                position: "relative",
                cursor: "pointer",
                border: "none",
                textAlign: "start",
              }}
              title={item.title}
            >
              {showText && (
                <span style={{ position: "sticky", insetInlineStart: 8, zIndex: 1 }}>
                  {item.title}
                </span>
              )}
            </button>
          );
        })}
        {track &&
          days.map((d) => (
            <button
              key={`empty-${d}`}
              type="button"
              onClick={() => openAddDialog(track.id, d)}
              style={{
                gridColumn: `${d} / span 1`,
                gridRow: 1,
                minHeight: 22,
                backgroundColor: "transparent",
                border: "none",
                cursor: "pointer",
              }}
              aria-label={`הוסף זמינות ב${d} ב${MONTH_LABEL}`}
            />
          ))}
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
          style={{ borderColor: COLORS.grid, fontFamily: "'Assistant', sans-serif" }}
        >
          <div className="flex" style={{ minWidth: "min-content" }}>
            {/* עמודת שם החודש — דביקה */}
            <div
              className="sticky shrink-0"
              style={{
                insetInlineStart: 0,
                zIndex: 2,
                width: 120,
                backgroundColor: COLORS.monthHeader,
                color: "#3B1D18",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'Rubik', sans-serif",
                fontWeight: 600,
                fontSize: 18,
              }}
            >
              {MONTH_LABEL} {YEAR}
            </div>

            {/* אזור הימים */}
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
                <WeekendBackdrop />
                {tracks.map((track) =>
                  track.key === "availability" ? (
                    <AvailabilityRow key={track.key} trackKey={track.key} />
                  ) : (
                    <TrackRow key={track.key} trackKey={track.key} />
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingId ? "עריכת אירוע" : "הוספת אירוע"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="title">כותרת</Label>
              <Input
                id="title"
                value={form.title_he}
                onChange={(e) => setForm({ ...form, title_he: e.target.value })}
                placeholder="למשל: סוכות"
                className="h-12 rounded-xl text-right"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="description">תיאור (אופציונלי)</Label>
              <Input
                id="description"
                value={form.description_he}
                onChange={(e) => setForm({ ...form, description_he: e.target.value })}
                placeholder="למשל: חלוקת כלים"
                className="h-12 rounded-xl text-right"
              />
            </div>

            <div className="grid gap-2">
              <Label>מסלול</Label>
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
                  <SelectValue placeholder="בחר מסלול" />
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
                <Label>סטטוס זמינות</Label>
                <Select
                  value={form.availability_state ?? "reserves"}
                  onValueChange={(value) =>
                    setForm({ ...form, availability_state: value as any })
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl text-right">
                    <SelectValue placeholder="בחר סטטוס" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="reserves">{AVAILABILITY_LABEL.reserves}</SelectItem>
                    <SelectItem value="at_work">{AVAILABILITY_LABEL.at_work}</SelectItem>
                    <SelectItem value="home">{AVAILABILITY_LABEL.home}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedTrack?.key === "branch_events" && (
              <div className="grid gap-2">
                <Label>סניף</Label>
                <Select
                  value={form.branch_id ?? "__none__"}
                  onValueChange={(value) =>
                    setForm({ ...form, branch_id: value === "__none__" ? null : value })
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl text-right">
                    <SelectValue placeholder="בחר סניף" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="__none__">ללא סניף</SelectItem>
                    {branches.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name_he}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedTrack?.key === "availability" && (
              <div className="grid gap-2">
                <Label>אדם</Label>
                <Select
                  value={form.person_id ?? "__none__"}
                  onValueChange={(value) =>
                    setForm({ ...form, person_id: value === "__none__" ? null : value })
                  }
                >
                  <SelectTrigger className="h-11 rounded-xl text-right">
                    <SelectValue placeholder="בחר אדם" />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="__none__">ללא אדם</SelectItem>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name_he}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
