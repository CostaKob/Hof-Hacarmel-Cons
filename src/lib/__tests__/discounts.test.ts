import { describe, it, expect } from "vitest";
import {
  computeStandardDiscounts,
  type DiscountType,
  type EnrollmentProrated,
} from "@/lib/discounts";

const YEAR_ID = "year-1";

function mkDiscount(overrides: Partial<DiscountType> & { label: string; percentage: number; applies_to: DiscountType["applies_to"] }): DiscountType {
  return {
    id: overrides.label,
    academic_year_id: YEAR_ID,
    legacy_key: null,
    sort_order: 0,
    is_active: true,
    ...overrides,
  };
}

const SECOND_INSTRUMENT = mkDiscount({
  label: "כלי שני",
  percentage: 5,
  applies_to: "cheapest_enrollment",
});

const AFTERNOON_BRANCH = mkDiscount({
  label: "שלוחה אחה\u05f4צ",
  percentage: 10,
  applies_to: "all",
});

const enr = (id: string, prorated: number): EnrollmentProrated => ({ enrollmentId: id, prorated });

describe("computeStandardDiscounts — כלי שני (cheapest_enrollment)", () => {
  it("שיוך יחיד — לא מפעילה הנחה", () => {
    const rows = [enr("a", 3200)];
    const res = computeStandardDiscounts(rows, [SECOND_INSTRUMENT]);
    expect(res.lines[0].amount).toBe(0);
    expect(res.lines[0].appliedEnrollmentIds).toEqual([]);
    expect(res.perEnrollmentPct.get("a")).toBe(0);
    expect(res.afterStdDiscount).toBe(3200);
  });

  it("שני שיוכים — מנחה רק את הזול", () => {
    const rows = [enr("expensive", 4000), enr("cheap", 2400)];
    const res = computeStandardDiscounts(rows, [SECOND_INSTRUMENT]);
    expect(res.lines[0].appliedEnrollmentIds).toEqual(["cheap"]);
    expect(res.perEnrollmentPct.get("expensive")).toBe(0);
    expect(res.perEnrollmentPct.get("cheap")).toBe(5);
    expect(res.lines[0].amount).toBe(120); // 2400 * 5%
  });

  it("שלושה שיוכים — מנחה את שני הזולים בלבד", () => {
    const rows = [enr("a", 4000), enr("b", 3200), enr("c", 2400)];
    const res = computeStandardDiscounts(rows, [SECOND_INSTRUMENT]);
    expect(res.lines[0].appliedEnrollmentIds.sort()).toEqual(["b", "c"]);
    expect(res.perEnrollmentPct.get("a")).toBe(0);
    expect(res.perEnrollmentPct.get("b")).toBe(5);
    expect(res.perEnrollmentPct.get("c")).toBe(5);
    // 3200*0.05 + 2400*0.05 = 280
    expect(res.lines[0].amount).toBe(280);
  });

  it("ארבעה שיוכים — מנחה את שלושת הזולים", () => {
    const rows = [enr("a", 4000), enr("b", 3200), enr("c", 2400), enr("d", 2000)];
    const res = computeStandardDiscounts(rows, [SECOND_INSTRUMENT]);
    expect(res.lines[0].appliedEnrollmentIds.sort()).toEqual(["b", "c", "d"]);
    expect(res.perEnrollmentPct.get("a")).toBe(0);
    // amount = (3200+2400+2000)*0.05 = 380
    expect(res.lines[0].amount).toBe(380);
  });

  it("אחוז 0 — לא מוריד כלום גם עם 2+ שיוכים", () => {
    const rows = [enr("a", 4000), enr("b", 2400)];
    const res = computeStandardDiscounts(rows, [{ ...SECOND_INSTRUMENT, percentage: 0 }]);
    expect(res.lines[0].amount).toBe(0);
    expect(res.afterStdDiscount).toBe(6400);
  });
});

describe("computeStandardDiscounts — שלוחה אחה״צ (applies_to=all)", () => {
  it("שיוך יחיד — הנחה מלאה עליו", () => {
    const rows = [enr("a", 3200)];
    const res = computeStandardDiscounts(rows, [AFTERNOON_BRANCH]);
    expect(res.perEnrollmentPct.get("a")).toBe(10);
    expect(res.lines[0].amount).toBe(320);
    expect(res.afterStdDiscount).toBe(2880);
  });

  it("שני שיוכים — הנחה על שניהם", () => {
    const rows = [enr("a", 4000), enr("b", 2400)];
    const res = computeStandardDiscounts(rows, [AFTERNOON_BRANCH]);
    expect(res.perEnrollmentPct.get("a")).toBe(10);
    expect(res.perEnrollmentPct.get("b")).toBe(10);
    expect(res.lines[0].amount).toBe(640);
    expect(res.afterStdDiscount).toBe(6400 * 0.9);
  });

  it("appliedEnrollmentIds ריק עבור applies_to=all", () => {
    const rows = [enr("a", 4000), enr("b", 2400)];
    const res = computeStandardDiscounts(rows, [AFTERNOON_BRANCH]);
    expect(res.lines[0].appliedEnrollmentIds).toEqual([]);
  });
});

describe("computeStandardDiscounts — שילוב כלי שני + שלוחה אחה״צ", () => {
  it("שני שיוכים — שלוחה על שניהם, כלי שני רק על הזול", () => {
    const rows = [enr("a", 4000), enr("b", 2400)];
    const res = computeStandardDiscounts(rows, [AFTERNOON_BRANCH, SECOND_INSTRUMENT]);
    expect(res.perEnrollmentPct.get("a")).toBe(10);
    expect(res.perEnrollmentPct.get("b")).toBe(15);
    // a: 4000*0.9=3600; b: 2400*0.85=2040 => 5640
    expect(res.afterStdDiscount).toBeCloseTo(5640, 2);
    const branchLine = res.lines.find((l) => l.label === AFTERNOON_BRANCH.label)!;
    const secondLine = res.lines.find((l) => l.label === SECOND_INSTRUMENT.label)!;
    expect(branchLine.amount).toBe(640);
    expect(secondLine.amount).toBe(120);
  });

  it("שיוך יחיד — רק שלוחה פעילה, כלי שני לא", () => {
    const rows = [enr("a", 3200)];
    const res = computeStandardDiscounts(rows, [AFTERNOON_BRANCH, SECOND_INSTRUMENT]);
    const secondLine = res.lines.find((l) => l.label === SECOND_INSTRUMENT.label)!;
    expect(secondLine.amount).toBe(0);
    expect(secondLine.appliedEnrollmentIds).toEqual([]);
    expect(res.perEnrollmentPct.get("a")).toBe(10);
  });
});

describe("computeStandardDiscounts — ללא הנחות נבחרות", () => {
  it("מחזיר סכום מלא ללא שורות", () => {
    const rows = [enr("a", 4000), enr("b", 2400)];
    const res = computeStandardDiscounts(rows, []);
    expect(res.lines).toEqual([]);
    expect(res.afterStdDiscount).toBe(6400);
    expect(res.perEnrollmentPct.get("a")).toBe(0);
    expect(res.perEnrollmentPct.get("b")).toBe(0);
  });
});
