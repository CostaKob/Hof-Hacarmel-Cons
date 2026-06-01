import { describe, it, expect } from "vitest";
import { normalizePhone, isValidIsraeliPhone } from "@/lib/phoneValidation";

// ─── normalizePhone ──────────────────────────────────────────────────────────

describe("normalizePhone", () => {
  it("מספר נקי — לא משתנה", () => {
    expect(normalizePhone("0521234567")).toBe("0521234567");
  });

  it("מספר עם מקפים", () => {
    expect(normalizePhone("052-123-4567")).toBe("0521234567");
  });

  it("מספר עם רווחים", () => {
    expect(normalizePhone("052 123 4567")).toBe("0521234567");
  });

  it("מספר עם סוגריים", () => {
    expect(normalizePhone("(052) 123-4567")).toBe("0521234567");
  });

  it("מספר עם +972", () => {
    expect(normalizePhone("+972521234567")).toBe("972521234567");
  });

  it("מחרוזת ריקה", () => {
    expect(normalizePhone("")).toBe("");
  });

  it("מספר קווי עם מקפים", () => {
    expect(normalizePhone("03-123-4567")).toBe("031234567");
  });
});

// ─── isValidIsraeliPhone ─────────────────────────────────────────────────────

describe("isValidIsraeliPhone — מספרים תקינים", () => {
  it("050 — פלאפון", () => {
    expect(isValidIsraeliPhone("0501234567")).toBe(true);
  });

  it("052 — סלקום", () => {
    expect(isValidIsraeliPhone("0521234567")).toBe(true);
  });

  it("053 — הוט מובייל", () => {
    expect(isValidIsraeliPhone("0531234567")).toBe(true);
  });

  it("054 — בזק בינלאומי", () => {
    expect(isValidIsraeliPhone("0541234567")).toBe(true);
  });

  it("055 — פרטנר", () => {
    expect(isValidIsraeliPhone("0551234567")).toBe(true);
  });

  it("058 — גולן", () => {
    expect(isValidIsraeliPhone("0581234567")).toBe(true);
  });

  it("03 — מרכז (קווי)", () => {
    expect(isValidIsraeliPhone("031234567")).toBe(true);
  });

  it("02 — ירושלים (קווי)", () => {
    expect(isValidIsraeliPhone("021234567")).toBe(true);
  });

  it("04 — צפון (קווי)", () => {
    expect(isValidIsraeliPhone("041234567")).toBe(true);
  });

  it("08 — דרום (קווי)", () => {
    expect(isValidIsraeliPhone("081234567")).toBe(true);
  });

  it("מספר עם מקפים — נורמליזציה לפני בדיקה", () => {
    expect(isValidIsraeliPhone("052-123-4567")).toBe(true);
  });
});

describe("isValidIsraeliPhone — מספרים לא תקינים", () => {
  it("קצר מדי", () => {
    expect(isValidIsraeliPhone("052123")).toBe(false);
  });

  it("ארוך מדי", () => {
    expect(isValidIsraeliPhone("052123456789")).toBe(false);
  });

  it("קידומת לא מוכרת — 070", () => {
    expect(isValidIsraeliPhone("0701234567")).toBe(false);
  });

  it("מספר חו״ל", () => {
    expect(isValidIsraeliPhone("+14155551234")).toBe(false);
  });

  it("מחרוזת ריקה", () => {
    expect(isValidIsraeliPhone("")).toBe(false);
  });

  it("אותיות בלבד", () => {
    expect(isValidIsraeliPhone("abcdefghij")).toBe(false);
  });

  it("קווי עם קידומת שגויה (07)", () => {
    expect(isValidIsraeliPhone("071234567")).toBe(false);
  });
});
