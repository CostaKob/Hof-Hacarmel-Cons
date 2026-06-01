import { describe, it, expect } from "vitest";
import {
  calcTotal,
  getExpectedLessons,
  getMonthlyRate,
  getRateColorClass,
  emptyStatusCounts,
  type StatusCounts,
} from "@/lib/lessonCounts";

// ─── calcTotal ────────────────────────────────────────────────────────────────

describe("calcTotal — חישוב סך שיעורים", () => {
  it("ריק — 0", () => {
    expect(calcTotal(emptyStatusCounts())).toBe(0);
  });

  it("נוכח = 1 שיעור", () => {
    expect(calcTotal({ ...emptyStatusCounts(), present: 1 })).toBe(1);
  });

  it("שיעור כפול = 2 שיעורים", () => {
    expect(calcTotal({ ...emptyStatusCounts(), double_lesson: 1 })).toBe(2);
  });

  it("היעדרות מוצדקת = 0 שיעורים", () => {
    expect(calcTotal({ ...emptyStatusCounts(), justified_absence: 5 })).toBe(0);
  });

  it("היעדרות בלתי מוצדקת = 1 שיעור (נספרת!)", () => {
    expect(calcTotal({ ...emptyStatusCounts(), unjustified_absence: 1 })).toBe(1);
  });

  it("חופש = 0 שיעורים", () => {
    expect(calcTotal({ ...emptyStatusCounts(), vacation: 3 })).toBe(0);
  });

  it("שילוב: 3 נוכח + 1 כפול + 2 היעדרות מוצדקת + 1 לא מוצדקת", () => {
    const counts: StatusCounts = {
      present: 3,
      double_lesson: 1,
      justified_absence: 2,
      unjustified_absence: 1,
      vacation: 0,
    };
    // 3×1 + 1×2 + 2×0 + 1×1 = 6
    expect(calcTotal(counts)).toBe(6);
  });

  it("10 שיעורים כפולים = 20", () => {
    expect(calcTotal({ ...emptyStatusCounts(), double_lesson: 10 })).toBe(20);
  });
});

// ─── getExpectedLessons ───────────────────────────────────────────────────────

describe("getExpectedLessons — שיעורים צפויים לפי תאריך התחלה", () => {
  it("ללא תאריך — ברירת מחדל 32", () => {
    expect(getExpectedLessons(null)).toBe(32);
    expect(getExpectedLessons(undefined)).toBe(32);
  });

  it("התחלה בספטמבר — 10 חודשים × 3.2 = 32", () => {
    expect(getExpectedLessons("2024-09-01")).toBe(32);
  });

  it("התחלה באוקטובר — 9 חודשים × 3.2 = 29", () => {
    expect(getExpectedLessons("2024-10-01")).toBe(29);
  });

  it("התחלה בינואר — 6 חודשים × 3.2 = 19", () => {
    expect(getExpectedLessons("2025-01-01")).toBe(19);
  });

  it("התחלה במרץ — 4 חודשים × 3.2 = 13", () => {
    expect(getExpectedLessons("2025-03-01")).toBe(13);
  });

  it("התחלה ביוני — 1 חודש × 3.2 = 3", () => {
    expect(getExpectedLessons("2025-06-01")).toBe(3);
  });

  it("התחלה בנובמבר — 8 חודשים × 3.2 = 26", () => {
    expect(getExpectedLessons("2024-11-01")).toBe(26);
  });

  it("התחלה בדצמבר — 7 חודשים × 3.2 = 22", () => {
    expect(getExpectedLessons("2024-12-01")).toBe(22);
  });

  it("תמיד מספר שלם (Math.round)", () => {
    const result = getExpectedLessons("2025-02-01"); // 5 × 3.2 = 16
    expect(Number.isInteger(result)).toBe(true);
  });
});

// ─── getMonthlyRate ───────────────────────────────────────────────────────────

describe("getMonthlyRate — קצב שיעורים לחודש", () => {
  it("ללא תאריך התחלה — unknown", () => {
    const { status } = getMonthlyRate(10, null);
    expect(status).toBe("unknown");
  });

  it("תאריך עתידי — unknown", () => {
    const { status } = getMonthlyRate(5, "2099-01-01");
    expect(status).toBe("unknown");
  });

  it("קצב 3.2 ומעלה — good (ירוק)", () => {
    // הפונקציה מחשבת +1 לחודשים, אז חודש אחד אחורה = monthsPassed=2
    // צריך >= 3.2×2 = 6.4 → 7 שיעורים → 7/2 = 3.5 → good
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const { status } = getMonthlyRate(7, oneMonthAgo.toISOString().slice(0, 10));
    expect(status).toBe("good");
  });

  it("קצב בין 2.5 ל-3.2 — medium (צהוב)", () => {
    // monthsPassed=2 → צריך בין 5 ל-6.4 שיעורים → 5 שיעורים → 5/2 = 2.5 → medium
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const { status } = getMonthlyRate(5, oneMonthAgo.toISOString().slice(0, 10));
    expect(status).toBe("medium");
  });

  it("קצב מתחת ל-2.5 — bad (אדום)", () => {
    // monthsPassed=2 → צריך < 5 שיעורים → 4 שיעורים → 4/2 = 2 → bad
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const { status } = getMonthlyRate(4, oneMonthAgo.toISOString().slice(0, 10));
    expect(status).toBe("bad");
  });

  it("0 שיעורים — bad", () => {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const { status } = getMonthlyRate(0, oneMonthAgo.toISOString().slice(0, 10));
    expect(status).toBe("bad");
  });

  it("rate הוא מספר חיובי", () => {
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const { rate } = getMonthlyRate(5, oneMonthAgo.toISOString().slice(0, 10));
    expect(rate).toBeGreaterThan(0);
  });
});

// ─── getRateColorClass ────────────────────────────────────────────────────────

describe("getRateColorClass — צבע לפי סטטוס", () => {
  it("good → ירוק", () => {
    expect(getRateColorClass("good")).toContain("green");
  });

  it("medium → צהוב", () => {
    expect(getRateColorClass("medium")).toContain("yellow");
  });

  it("bad → אדום", () => {
    expect(getRateColorClass("bad")).toContain("red");
  });

  it("unknown → muted", () => {
    expect(getRateColorClass("unknown")).toContain("muted");
  });
});
