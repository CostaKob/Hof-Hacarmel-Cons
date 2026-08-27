import { describe, it, expect } from "vitest";
import { allocatePayment, studentShareOfPayment } from "@/lib/familyPaymentAllocation";
import { summarizePaymentMethods } from "@/lib/paymentMethodLabel";

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

describe("summarizePaymentMethods", () => {
  it("does not double-count installments for split family payment copies", () => {
    const original = {
      id: "pay-1",
      payment_method: "credit_card",
      installments: 10,
      amount: 9880,
    };
    const splitRows = [
      { ...original, student_id: "a", amount: 4940, _splitFromPaymentId: "pay-1" },
      { ...original, student_id: "y", amount: 4940, _splitFromPaymentId: "pay-1" },
    ];
    expect(summarizePaymentMethods(splitRows)).toEqual(["אשראי · 10 תשלומים"]);
  });

  it("still sums installments across distinct transactions", () => {
    const rows = [
      { id: "pay-1", payment_method: "credit_card", installments: 5, amount: 1000 },
      { id: "pay-2", payment_method: "credit_card", installments: 3, amount: 800 },
    ];
    expect(summarizePaymentMethods(rows)).toEqual(["אשראי · 8 תשלומים"]);
  });
});

describe("credits mirror the original payment split", () => {
  const children = [
    { id: "a", first_name: "אברהם", last_name: "אבינו" },
    { id: "b", first_name: "רבקה", last_name: "אבינו" },
  ];
  const payment = {
    id: "p1",
    student_id: "a",
    amount: 9,
    enrollment_breakdown: {
      lines: [
        { amount: 5, description: "אברהם אבינו · שכר לימוד" },
        { amount: 4, description: "רבקה אבינו · שכר לימוד" },
      ],
    },
  };
  const credit = { id: "c1", student_id: "a", amount: -9, refund_of_payment_id: "p1" };

  it("nets out per child", () => {
    const rows = [payment, credit];
    const pay = allocatePayment(payment, children, rows);
    const cred = allocatePayment(credit, children, rows);
    expect(pay.get("a")! + cred.get("a")!).toBe(0);
    expect(pay.get("b")! + cred.get("b")!).toBe(0);
  });
});
