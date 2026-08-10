export interface IsraeliBank {
  code: string;
  name: string;
}

// רשימת הבנקים בישראל לפי קוד בנק (בנק ישראל)
export const ISRAELI_BANKS: IsraeliBank[] = [
  { code: "4", name: "בנק יהב לעובדי המדינה" },
  { code: "9", name: "בנק הדואר" },
  { code: "10", name: "בנק לאומי לישראל" },
  { code: "11", name: "בנק דיסקונט לישראל" },
  { code: "12", name: "בנק הפועלים" },
  { code: "13", name: "בנק אגוד לישראל" },
  { code: "14", name: "בנק אוצר החייל" },
  { code: "17", name: "בנק מרכנתיל דיסקונט" },
  { code: "18", name: "וואן זירו הבנק הדיגיטלי" },
  { code: "20", name: "בנק מזרחי טפחות" },
  { code: "22", name: "Citibank N.A" },
  { code: "23", name: "HSBC Bank plc" },
  { code: "26", name: "יובנק" },
  { code: "31", name: "הבנק הבינלאומי הראשון לישראל" },
  { code: "34", name: "בנק ערבי ישראלי" },
  { code: "39", name: "בנק SBI" },
  { code: "46", name: "בנק מסד" },
  { code: "47", name: "בנק אשראי לישראל" },
  { code: "52", name: "בנק פועלי אגודת ישראל" },
  { code: "54", name: "בנק ירושלים" },
  { code: "59", name: "שירותי בנק אוטומטיים" },
  { code: "65", name: "בנק החקלאות לישראל" },
  { code: "67", name: "בנק ישראל" },
  { code: "68", name: "בנק צרפתי ישראלי" },
  { code: "71", name: "מרכז סליקה בנקאי" },
  { code: "77", name: "בנק לאומי למשכנתאות" },
  { code: "99", name: "אחר" },
];

export const findBankByCode = (code: string) =>
  ISRAELI_BANKS.find((b) => b.code === String(code).trim());
