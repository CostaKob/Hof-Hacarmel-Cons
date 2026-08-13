import ExcelJS from "exceljs";

export type CashflowMethod = "cash" | "cheque" | "credit" | "transfer" | "other";

export interface CashflowExcelRow {
  due_date: string;
  month: string;
  method: CashflowMethod;
  amount: number;
  client_name: string;
  doc_number: string;
  doc_date: string;
  note: string;
  source: "students" | "school_music" | "external";
}

export interface CashflowExcelMonth {
  month: string;
  total: number;
  count: number;
  byMethod: Record<CashflowMethod, number>;
}

const METHOD_LABEL: Record<CashflowMethod, string> = {
  cash: "מזומן",
  cheque: "שיקים",
  credit: "אשראי",
  transfer: "העברה בנקאית",
  other: "אחר",
};

const SOURCE_LABEL: Record<CashflowExcelRow["source"], string> = {
  students: "תלמידים",
  school_music: "בית ספר מנגן",
  external: "אחר / חיצוני",
};

const NAVY = "FF0F2E4C";
const SKY = "FF2E7FB8";
const SOFT = "FFEAF3FA";
const STRIPE = "FFF7FAFC";
const BORDER = "FFD3E0EA";

const MONEY = '₪ #,##0.00;[Red](₪ #,##0.00);"-"';

const formatDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};
const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return `${mm}-${y}`;
};

async function fetchLogo(url: string): Promise<{ base64: string; ext: "png" | "jpeg" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const type = res.headers.get("content-type") || "";
    return { base64: btoa(bin), ext: type.includes("jpeg") || type.includes("jpg") ? "jpeg" : "png" };
  } catch {
    return null;
  }
}

function styleHeaderRow(row: ExcelJS.Row, cols: number) {
  row.height = 26;
  for (let i = 1; i <= cols; i++) {
    const c = row.getCell(i);
    c.font = { name: "Arial", bold: true, size: 11, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    c.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
    c.border = {
      top: { style: "thin", color: { argb: NAVY } },
      bottom: { style: "thin", color: { argb: NAVY } },
      left: { style: "thin", color: { argb: NAVY } },
      right: { style: "thin", color: { argb: NAVY } },
    };
  }
}

function bodyBorders(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "hair", color: { argb: BORDER } },
    bottom: { style: "hair", color: { argb: BORDER } },
    left: { style: "hair", color: { argb: BORDER } },
    right: { style: "hair", color: { argb: BORDER } },
  };
}

export async function exportCashflowWorkbook(opts: {
  rows: CashflowExcelRow[];
  months: CashflowExcelMonth[];
  startDate: string;
  endDate: string;
  logoUrl?: string;
  sourceLabel: string;
}) {
  const { rows, months, startDate, endDate, logoUrl, sourceLabel } = opts;

  const wb = new ExcelJS.Workbook();
  wb.creator = "אולפן המוסיקה";
  wb.created = new Date();

  const logo = logoUrl ? await fetchLogo(logoUrl) : null;
  const logoId = logo ? wb.addImage({ base64: logo.base64, extension: logo.ext }) : null;

  /* ---------- Sheet 1: summary ---------- */
  const s1 = wb.addWorksheet("סיכום חודשי", {
    views: [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: 7 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  s1.properties.defaultRowHeight = 20;
  s1.columns = [
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 },
    { width: 20 }, { width: 14 }, { width: 18 }, { width: 12 },
  ];

  const titleBlock = (ws: ExcelJS.Worksheet, subtitle: string, cols: number) => {
    ws.mergeCells(1, 1, 4, cols);
    const t = ws.getCell(1, 1);
    t.value = {
      richText: [
        { text: "אולפן המוסיקה\n", font: { name: "Arial", bold: true, size: 20, color: { argb: "FFFFFFFF" } } },
        { text: "דוח תזרים מזומנים\n", font: { name: "Arial", bold: true, size: 14, color: { argb: "FFD7E9F7" } } },
        { text: subtitle, font: { name: "Arial", size: 10, color: { argb: "FFC3DCEF" } } },
      ],
    };
    t.alignment = { horizontal: "right", vertical: "middle", wrapText: true, readingOrder: "rtl", indent: 1 };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    for (let r = 1; r <= 4; r++) ws.getRow(r).height = 24;
    if (logoId !== null) {
      ws.addImage(logoId, { tl: { col: cols - 1.85, row: 0.3 }, ext: { width: 110, height: 68 }, editAs: "oneCell" });
    }
    ws.getRow(5).height = 8;
  };

  const subtitle = `תקופה: ${formatDate(startDate)} – ${formatDate(endDate)}  |  סוג: ${sourceLabel}  |  הופק: ${new Date().toLocaleDateString("he-IL")}`;
  titleBlock(s1, subtitle, 8);

  const h1 = s1.getRow(6);
  h1.values = ["חודש", "מזומן", "שיקים", "אשראי", "העברה בנקאית", "אחר", 'סה"כ', "תנועות"];
  styleHeaderRow(h1, 8);

  let r = 7;
  months.forEach((m, idx) => {
    const row = s1.getRow(r++);
    row.values = [
      monthLabel(m.month), m.byMethod.cash, m.byMethod.cheque, m.byMethod.credit,
      m.byMethod.transfer, m.byMethod.other, m.total, m.count,
    ];
    for (let i = 1; i <= 8; i++) {
      const c = row.getCell(i);
      c.font = { name: "Arial", size: 11 };
      if (idx % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
      if (i >= 2 && i <= 7) c.numFmt = MONEY;
      if (i === 7) c.font = { name: "Arial", size: 11, bold: true, color: { argb: NAVY } };
      c.alignment = { horizontal: i === 1 ? "right" : "center", vertical: "middle", readingOrder: "rtl" };
      bodyBorders(c);
    }
    row.height = 20;
  });

  const totalRow = s1.getRow(r);
  const first = 7, last = r - 1;
  totalRow.values = [
    'סה"כ',
    ...["B", "C", "D", "E", "F", "G", "H"].map((col) =>
      months.length ? { formula: `SUM(${col}${first}:${col}${last})` } : 0,
    ),
  ];
  for (let i = 1; i <= 8; i++) {
    const c = totalRow.getCell(i);
    c.font = { name: "Arial", bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SKY } };
    if (i >= 2 && i <= 7) c.numFmt = MONEY;
    c.alignment = { horizontal: i === 1 ? "right" : "center", vertical: "middle", readingOrder: "rtl" };
    bodyBorders(c);
  }
  totalRow.height = 24;
  s1.autoFilter = { from: { row: 6, column: 1 }, to: { row: last > 6 ? last : 6, column: 8 } };

  /* ---------- Sheet 2: detail ---------- */
  const s2 = wb.addWorksheet("פירוט תנועות", {
    views: [{ rightToLeft: true, showGridLines: false, state: "frozen", ySplit: 7 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  s2.properties.defaultRowHeight = 19;
  s2.columns = [
    { width: 14 }, { width: 11 }, { width: 11 }, { width: 16 }, { width: 26 },
    { width: 16 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 30 },
  ];
  titleBlock(s2, subtitle, 10);

  const h2 = s2.getRow(6);
  h2.values = [
    "תאריך פרעון", "חודש", "סוג תנועה", "אסמכתא", "לקוח",
    "סוג פעולה", "סכום", "מקור", "תאריך מסמך", "הערות",
  ];
  styleHeaderRow(h2, 10);

  let dr = 7;
  rows.forEach((row, idx) => {
    const x = s2.getRow(dr++);
    x.values = [
      formatDate(row.due_date),
      monthLabel(row.month),
      row.amount < 0 ? "חובה" : "זכות",
      `קבלה ${row.doc_number}`,
      row.client_name,
      METHOD_LABEL[row.method],
      row.amount,
      SOURCE_LABEL[row.source],
      formatDate(row.doc_date),
      row.note,
    ];
    for (let i = 1; i <= 10; i++) {
      const c = x.getCell(i);
      c.font = { name: "Arial", size: 10 };
      if (idx % 2 === 1) c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: STRIPE } };
      if (i === 7) {
        c.numFmt = MONEY;
        c.font = { name: "Arial", size: 10, bold: true, color: { argb: row.amount < 0 ? "FFB4232B" : NAVY } };
      }
      c.alignment = { horizontal: i === 5 || i === 10 ? "right" : "center", vertical: "middle", readingOrder: "rtl" };
      bodyBorders(c);
    }
  });

  const dTotal = s2.getRow(dr);
  dTotal.getCell(6).value = 'סה"כ';
  dTotal.getCell(7).value = rows.length ? { formula: `SUM(G7:G${dr - 1})` } : 0;
  for (let i = 1; i <= 10; i++) {
    const c = dTotal.getCell(i);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
    c.font = { name: "Arial", bold: true, size: 11, color: { argb: NAVY } };
    if (i === 7) c.numFmt = MONEY;
    c.alignment = { horizontal: "center", vertical: "middle", readingOrder: "rtl" };
    bodyBorders(c);
  }
  dTotal.height = 22;
  s2.autoFilter = { from: { row: 6, column: 1 }, to: { row: dr - 1 > 6 ? dr - 1 : 6, column: 10 } };

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `דוח-תזרים-${startDate}-${endDate}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
