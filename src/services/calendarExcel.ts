import ExcelJS from "exceljs";
import type { CalendarItem } from "@/services/calendarStore";

/* ------------------------------------------------------------------
   ייצוא הלוח השנתי לקובץ אקסל — מבנה זהה לתצוגה במסך:
   כל חודש בלוק, עמודה לכל יום, שורות (Lanes) לאירועים, זמינות בתחתית.
------------------------------------------------------------------- */

export type ExcelMonth = {
  key: string;
  year: number;
  month: number;
  label: string;
  dayCount: number;
  startISO: string;
  endISO: string;
};

export type ExcelItem = {
  title: string;
  detail?: string;
  time?: string;
  place?: string;
  from: number;
  to: number;
  argb: string;
  lane: number;
};

const HEB_WEEKDAYS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

const COLORS = {
  monthHeader: "FFE88C7D",
  dayNumbers: "FFF5C9A8",
  weekend: "FFD9D9D9",
  grid: "FFE5E5E5",
};

const hexToArgb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

const thin = { style: "thin" as const, color: { argb: COLORS.grid } };
const border = { top: thin, left: thin, bottom: thin, right: thin };

const packLanes = <T extends { from: number; to: number }>(list: T[]): T[][] => {
  const sorted = [...list].sort((a, b) => a.from - b.from || a.to - b.to);
  const lanes: T[][] = [];
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

const cellText = (item: ExcelItem) =>
  [item.detail, item.time, item.place].filter(Boolean).join(" · ");

export type MonthData = {
  month: ExcelMonth;
  general: ExcelItem[];
  availability: ExcelItem[];
  laneCount: number;
};

export const exportYearCalendarToExcel = async (
  months: MonthData[],
  fileName = "לוח-שנה-שנתי.xlsx"
) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "קונסרבטוריון חוף הכרמל";
  const sheet = workbook.addWorksheet("לוח שנה שנתי", {
    views: [{ rightToLeft: true, state: "frozen", xSplit: 1 }],
    pageSetup: { orientation: "landscape", fitToPage: true },
  });

  sheet.getColumn(1).width = 16;
  for (let d = 1; d <= 31; d += 1) sheet.getColumn(1 + d).width = 9;

  let row = 1;

  months.forEach(({ month, general, availability, laneCount }) => {
    const headerRow = sheet.getRow(row);
    const weekdayRow = sheet.getRow(row + 1);

    const monthCell = headerRow.getCell(1);
    monthCell.value = `${month.label} ${month.year}`;
    monthCell.font = { name: "Arial", bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    monthCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.monthHeader } };
    monthCell.alignment = { vertical: "middle", horizontal: "center" };
    monthCell.border = border;

    const weekdayMonthCell = weekdayRow.getCell(1);
    weekdayMonthCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.monthHeader },
    };
    weekdayMonthCell.border = border;

    for (let d = 1; d <= month.dayCount; d += 1) {
      const weekday = new Date(month.year, month.month - 1, d).getDay();
      const weekend = weekday === 5 || weekday === 6;
      const fillArgb = weekend ? COLORS.weekend : COLORS.dayNumbers;

      const dayCell = headerRow.getCell(1 + d);
      dayCell.value = d;
      dayCell.font = { name: "Arial", bold: true, size: 11 };
      dayCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
      dayCell.alignment = { vertical: "middle", horizontal: "center" };
      dayCell.border = border;

      const wdCell = weekdayRow.getCell(1 + d);
      wdCell.value = HEB_WEEKDAYS[weekday];
      wdCell.font = { name: "Arial", size: 9, color: { argb: "FF6B6B6B" } };
      wdCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
      wdCell.alignment = { vertical: "middle", horizontal: "center" };
      wdCell.border = border;
    }

    headerRow.height = 20;
    weekdayRow.height = 15;
    row += 2;

    const writeLane = (laneItems: ExcelItem[], rowIndex: number, height: number) => {
      const excelRow = sheet.getRow(rowIndex);
      excelRow.height = height;
      for (let d = 1; d <= month.dayCount; d += 1) {
        const cell = excelRow.getCell(1 + d);
        cell.border = border;
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      }
      const laneCell = excelRow.getCell(1);
      laneCell.border = border;

      laneItems.forEach((item) => {
        const from = Math.max(1, item.from);
        const to = Math.min(month.dayCount, item.to);
        if (to < from) return;
        if (to > from) {
          try {
            sheet.mergeCells(rowIndex, 1 + from, rowIndex, 1 + to);
          } catch {
            /* חפיפה — נשאיר את התא הבודד */
          }
        }
        const cell = sheet.getRow(rowIndex).getCell(1 + from);
        const extra = cellText(item);
        cell.value = {
          richText: [
            { text: item.title, font: { name: "Arial", bold: true, size: 10 } },
            ...(extra
              ? [{ text: "\n" + extra, font: { name: "Arial", size: 9 } }]
              : []),
          ],
        };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: item.argb } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = border;
      });
    };

    // שורות אירועים לפי בחירת המשתמש (lane_index)
    const lanes: ExcelItem[][] = Array.from({ length: laneCount }, () => []);
    general.forEach((item) => {
      const idx = Math.min(Math.max(0, item.lane), laneCount - 1);
      lanes[idx].push(item);
    });
    lanes.forEach((laneItems, i) => writeLane(laneItems, row + i, 34));
    row += laneCount;

    // זמינות — תמיד בתחתית
    const availabilityLanes = packLanes(availability);
    (availabilityLanes.length ? availabilityLanes : [[]]).forEach((laneItems, i) => {
      const rowIndex = row + i;
      if (i === 0) {
        const label = sheet.getRow(rowIndex).getCell(1);
        label.value = "זמינות";
        label.font = { name: "Arial", size: 9, bold: true };
        label.alignment = { vertical: "middle", horizontal: "center" };
      }
      writeLane(laneItems, rowIndex, 20);
    });
    row += availabilityLanes.length || 1;

    // שורת רווח בין חודשים
    row += 1;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export const argbFromHex = hexToArgb;
export type { CalendarItem };
