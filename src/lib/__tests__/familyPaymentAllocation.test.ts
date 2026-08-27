import { describe, it, expect } from "vitest";
import { allocatePayment, studentShareOfPayment } from "@/lib/familyPaymentAllocation";

const yaara = { id: "y", first_name: "יערה", last_name: "טויטו" };
const adva = { id: "a", first_name: "אדוה", last_name: "טויטו" };
const kids = [yaara, adva];

describe("allocatePayment", () => {
  it("splits a legacy family payment by the name prefix of each line", () => {
    const p = {
      student_id: "y",
      amount: 11115,
      enrollment_breakdown: {
        lines: [
          { amount: 5200, description: "יערה טויטו · שכר לימוד" },
          { amount: -260, description: "יערה טויטו · אח שני (5%)" },
          { amount: 6500, description: "אדוה טויטו · שכר לימוד" },
          { amount: -325, description: "אדוה טויטו · תלמיד מגמה (5%)" },
        ],
      },
    };
    const alloc = allocatePayment(p, kids);
    expect(alloc.get("y")).toBeCloseTo(4940, 2);
    expect(alloc.get("a")).toBeCloseTo(6175, 2);
    expect([...alloc.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(11115, 2);
  });

  it("prefers explicit student_id on lines", () => {
    const p = {
      student_id: "y",
      amount: 300,
      enrollment_breakdown: { lines: [
        { amount: 100, description: "x", student_id: "y" },
        { amount: 200, description: "x", student_id: "a" },
      ] },
    };
    expect(studentShareOfPayment(p, "a", kids)).toBeCloseTo(200, 2);
  });

  it("keeps single-child payments on their own student", () => {
    const p = { student_id: "a", amount: 500, enrollment_breakdown: { lines: [{ amount: 500, description: "אדוה טויטו · שכר לימוד" }] } };
    expect(studentShareOfPayment(p, "a", kids)).toBe(500);
    expect(studentShareOfPayment(p, "y", kids)).toBe(0);
  });

  it("scales a partial payment proportionally", () => {
    const p = {
      student_id: "y",
      amount: 1000,
      enrollment_breakdown: { lines: [
        { amount: 5000, description: "יערה טויטו · שכר לימוד" },
        { amount: 5000, description: "אדוה טויטו · שכר לימוד" },
      ] },
    };
    const alloc = allocatePayment(p, kids);
    expect(alloc.get("y")).toBeCloseTo(500, 2);
    expect(alloc.get("a")).toBeCloseTo(500, 2);
  });
});
