import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";

/* ------------------------------------------------------------------
   שלב 1 — בלוק חודש בודד (אוקטובר 2026), נתונים קשיחים בקוד.
   ציר הימים: יום 1 בקצה הימני (נגזר מ־direction: rtl על ה־Grid).
   כדי להפוך את הציר ל־LTR — שנה את DAY_AXIS_DIR בלבד.
------------------------------------------------------------------- */
const DAY_AXIS_DIR: "rtl" | "ltr" = "rtl";

const YEAR = 2026;
const MONTH = 10; // אוקטובר
const DAYS_IN_MONTH = new Date(YEAR, MONTH, 0).getDate();
const MONTH_LABEL = "אוקטובר";

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

type Item = {
  title: string;
  detail?: string;
  from: number;
  to: number;
  bg: string;
  bordered?: boolean;
};

const AVAILABILITY: Item[] = [
  { title: "קוסטה מילואים", from: 1, to: 8, bg: COLORS.reserves },
  { title: "חייב להיות בעבודה", from: 9, to: 25, bg: COLORS.atWork },
];

const HOLIDAYS: Item[] = [
  { title: "סוכות", from: 5, to: 12, bg: COLORS.holiday },
  { title: "יום הזיכרון", from: 20, to: 20, bg: COLORS.memorial },
];

const BRANCH_EVENTS: Item[] = [
  { title: "כרמל ים", detail: "חלוקת כלים", from: 14, to: 14, bg: "#FFFFFF", bordered: true },
  { title: "קיסריה", detail: "חלוקת כלים", from: 16, to: 16, bg: "#FFFFFF", bordered: true },
];

const days = Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1);
const weekdayOf = (day: number) => new Date(YEAR, MONTH - 1, day).getDay();
const isWeekend = (day: number) => weekdayOf(day) === 5 || weekdayOf(day) === 6;

const gridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: `repeat(${DAYS_IN_MONTH}, minmax(90px, 1fr))`,
  direction: DAY_AXIS_DIR,
  minWidth: `${DAYS_IN_MONTH * 90}px`,
};

const TrackRow = ({ items }: { items: Item[] }) => (
  <div style={{ ...gridStyle, height: 44 }}>
    {days.map((d) => (
      <div
        key={d}
        style={{
          gridColumn: `${d} / span 1`,
          gridRow: 1,
          borderInlineStart: `1px solid ${COLORS.grid}`,
          backgroundColor: isWeekend(d) ? COLORS.weekend : "transparent",
        }}
      />
    ))}
    {items.map((item) => (
      <div
        key={`${item.title}-${item.from}`}
        style={{
          gridColumn: `${item.from} / span ${item.to - item.from + 1}`,
          gridRow: 1,
          backgroundColor: item.bg,
          border: item.bordered ? `1px solid #9CA3AF` : "none",
          borderRadius: 6,
          margin: 3,
          padding: "0 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          fontSize: 13,
          overflow: "hidden",
          whiteSpace: "nowrap",
          textOverflow: "ellipsis",
          color: "#1F2937",
        }}
        title={[item.title, item.detail].filter(Boolean).join(" — ")}
      >
        <span style={{ fontWeight: 600 }}>{item.title}</span>
        {item.detail && <span style={{ fontWeight: 400 }}>{item.detail}</span>}
      </div>
    ))}
  </div>
);

const AdminYearCalendar = () => {
  return (
    <AdminLayout title="לוח שנה שנתי">
      <PageTitle title="לוח שנה שנתי" />

      <div
        className="overflow-x-auto rounded-xl border"
        style={{ borderColor: COLORS.grid, fontFamily: "'Assistant', sans-serif" }}
      >
        <div className="flex" style={{ minWidth: "min-content" }}>
          {/* עמודת שם החודש — דביקה */}
          <div
            className="sticky z-10 shrink-0"
            style={{
              insetInlineStart: 0,
              width: 120,
              backgroundColor: COLORS.monthHeader,
              color: "#3B1D18",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "'Rubik', sans-serif",
              fontWeight: 600,
              fontSize: 18,
              writingMode: "horizontal-tb",
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

            {/* מסלולי תוכן */}
            <TrackRow items={AVAILABILITY} />
            <TrackRow items={HOLIDAYS} />
            <TrackRow items={BRANCH_EVENTS} />
          </div>
        </div>
      </div>

      <p className="mt-3 text-sm text-muted-foreground">
        שלב 1 — תצוגה סטטית של חודש אחד לבדיקת מבנה, כיווניות, פונטים וצבעים.
      </p>
    </AdminLayout>
  );
};

export default AdminYearCalendar;
