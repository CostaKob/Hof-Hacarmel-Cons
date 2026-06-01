import { describe, it, expect } from "vitest";
import { calcEnrollment, totalDiscountPct, LESSONS_PER_YEAR } from "@/lib/paymentCalc";

// ─── helpers ────────────────────────────────────────────────────────────────

const YEAR_START = "2024-09-01";
const YEAR_END = "2025-06-30";
const PRICES = { "30": 2400, "45": 3200, "60": 4000 };

function makeEnrollment(overrides: Partial<Parameters<typeof calcEnrollment>[0]> = {}) {
  return {
    id: "enr-1",
    duration: 45,
    startDate: YEAR_START,
    endDate: null,
    pricePerLessonOverride: null,
    ...overrides,
  };
}

// ─── calcEnrollment ──────────────────────────────────────────────────────────

describe("calcEnrollment", () => {
  describe("מחיר בסיסי", () => {
    it("שנה מלאה (מהתחלה עד סוף) — lessonsRemaining = 32", () => {
      const row = calcEnrollment(makeEnrollment(), PRICES, YEAR_START, YEAR_END);
      expect(row.lessonsTotal).toBe(LESSONS_PER_YEAR);
      expect(row.lessonsRemaining).toBe(LESSONS_PER_YEAR);
      expect(row.prorated).toBe(row.annualBase);
      expect(row.source).toBe("global");
    });

    it("שיעור 45 דק׳ — annualBase = 3200", () => {
      const row = calcEnrollment(makeEnrollment({ duration: 45 }), PRICES, YEAR_START, YEAR_END);
      expect(row.annualBase).toBe(3200);
    });

    it("שיעור 30 דק׳ — annualBase = 2400", () => {
      const row = calcEnrollment(makeEnrollment({ duration: 30 }), PRICES, YEAR_START, YEAR_END);
      expect(row.annualBase).toBe(2400);
    });

    it("שיעור 60 דק׳ — annualBase = 4000", () => {
      const row = calcEnrollment(makeEnrollment({ duration: 60 }), PRICES, YEAR_START, YEAR_END);
      expect(row.annualBase).toBe(4000);
    });

    it("משך לא קיים בטבלה — source = missing, annualBase = 0", () => {
      const row = calcEnrollment(makeEnrollment({ duration: 90 }), PRICES, YEAR_START, YEAR_END);
      expect(row.source).toBe("missing");
      expect(row.annualBase).toBe(0);
      expect(row.prorated).toBe(0);
    });
  });

  describe("override מחיר", () => {
    it("pricePerLessonOverride גובר על מחיר גלובלי", () => {
      const row = calcEnrollment(
        makeEnrollment({ duration: 45, pricePerLessonOverride: 5000 }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      expect(row.annualBase).toBe(5000);
      expect(row.source).toBe("override");
    });

    it("pricePerLessonOverride = 0 — נופל למחיר גלובלי", () => {
      const row = calcEnrollment(
        makeEnrollment({ duration: 45, pricePerLessonOverride: 0 }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      expect(row.source).toBe("global");
      expect(row.annualBase).toBe(3200);
    });
  });

  describe("חישוב יחסי לפי תאריך התחלה", () => {
    it("התחלה אחרי תחילת שנה — lessonsRemaining < 32", () => {
      const row = calcEnrollment(
        makeEnrollment({ startDate: "2025-01-01" }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      expect(row.lessonsRemaining).toBeGreaterThan(0);
      expect(row.lessonsRemaining).toBeLessThan(LESSONS_PER_YEAR);
    });

    it("התחלה לפני תחילת שנה — מתייחס לתחילת שנה", () => {
      const rowEarly = calcEnrollment(
        makeEnrollment({ startDate: "2024-07-01" }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      const rowFull = calcEnrollment(makeEnrollment(), PRICES, YEAR_START, YEAR_END);
      expect(rowEarly.lessonsRemaining).toBe(rowFull.lessonsRemaining);
    });

    it("prorated = pricePerLesson × lessonsRemaining", () => {
      const row = calcEnrollment(
        makeEnrollment({ startDate: "2025-01-01" }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      const expected = Math.round(row.pricePerLesson * row.lessonsRemaining * 100) / 100;
      expect(row.prorated).toBe(expected);
    });

    it("pricePerLesson = annualBase / 32", () => {
      const row = calcEnrollment(makeEnrollment(), PRICES, YEAR_START, YEAR_END);
      expect(row.pricePerLesson).toBeCloseTo(row.annualBase / LESSONS_PER_YEAR, 5);
    });
  });

  describe("תאריך סיום (endDate)", () => {
    it("endDate לפני סוף שנה — מקזז שיעורים", () => {
      const rowWithEnd = calcEnrollment(
        makeEnrollment({ endDate: "2025-01-01" }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      const rowFull = calcEnrollment(makeEnrollment(), PRICES, YEAR_START, YEAR_END);
      expect(rowWithEnd.lessonsRemaining).toBeLessThan(rowFull.lessonsRemaining);
      expect(rowWithEnd.prorated).toBeLessThan(rowFull.prorated);
    });

    it("endDate אחרי סוף שנה — לא משפיע", () => {
      const row = calcEnrollment(
        makeEnrollment({ endDate: "2026-01-01" }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      expect(row.lessonsRemaining).toBe(LESSONS_PER_YEAR);
    });

    it("endDate = startDate — 0 שיעורים", () => {
      const row = calcEnrollment(
        makeEnrollment({ startDate: YEAR_START, endDate: YEAR_START }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      expect(row.lessonsRemaining).toBe(0);
      expect(row.prorated).toBe(0);
    });
  });

  describe("ערכי קצה", () => {
    it("lessonsRemaining אף פעם לא עולה על 32", () => {
      const row = calcEnrollment(
        makeEnrollment({ startDate: "2020-01-01" }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      expect(row.lessonsRemaining).toBeLessThanOrEqual(LESSONS_PER_YEAR);
    });

    it("lessonsRemaining אף פעם לא שלילי", () => {
      const row = calcEnrollment(
        makeEnrollment({ startDate: "2026-01-01" }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      expect(row.lessonsRemaining).toBeGreaterThanOrEqual(0);
    });

    it("prorated לא שלילי", () => {
      const row = calcEnrollment(
        makeEnrollment({ startDate: "2030-01-01" }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      expect(row.prorated).toBeGreaterThanOrEqual(0);
    });

    it("enrollmentId עובר נכון", () => {
      const row = calcEnrollment(
        makeEnrollment({ id: "test-id-123" }),
        PRICES,
        YEAR_START,
        YEAR_END
      );
      expect(row.enrollmentId).toBe("test-id-123");
    });
  });
});

// ─── totalDiscountPct ────────────────────────────────────────────────────────

describe("totalDiscountPct", () => {
  const RATES = { sibling: 10, secondInstrument: 15, majorStudent: 20 };

  it("ללא הנחות — 0%", () => {
    expect(totalDiscountPct({}, RATES)).toBe(0);
  });

  it("הנחת אחים בלבד — 10%", () => {
    expect(totalDiscountPct({ sibling: true }, RATES)).toBe(10);
  });

  it("הנחת כלי שני בלבד — 15%", () => {
    expect(totalDiscountPct({ secondInstrument: true }, RATES)).toBe(15);
  });

  it("הנחת תלמיד מגמה בלבד — 20%", () => {
    expect(totalDiscountPct({ majorStudent: true }, RATES)).toBe(20);
  });

  it("אחים + כלי שני — 25%", () => {
    expect(totalDiscountPct({ sibling: true, secondInstrument: true }, RATES)).toBe(25);
  });

  it("כל שלוש ההנחות — 45%", () => {
    expect(
      totalDiscountPct({ sibling: true, secondInstrument: true, majorStudent: true }, RATES)
    ).toBe(45);
  });

  it("הנחה מותאמת אחוזים", () => {
    expect(
      totalDiscountPct({ custom: [{ label: "עמותה", pct: 5 }] }, RATES)
    ).toBe(5);
  });

  it("מספר הנחות מותאמות מצטברות", () => {
    expect(
      totalDiscountPct(
        { sibling: true, custom: [{ label: "א", pct: 5 }, { label: "ב", pct: 3 }] },
        RATES
      )
    ).toBe(18);
  });

  it("false flags לא נספרים", () => {
    expect(
      totalDiscountPct({ sibling: false, secondInstrument: false, majorStudent: false }, RATES)
    ).toBe(0);
  });
});
