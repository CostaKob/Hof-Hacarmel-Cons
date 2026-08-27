// Allocating a family payment across the children it actually covers.
//
// Family payment links create a single `student_payments` row on the "anchor"
// child, even when the line items cover several siblings. Without allocation
// the anchor looks over-paid and the siblings look unpaid.
//
// Allocation source of truth, in order:
//   1. `enrollment_breakdown.lines[].student_id` — written by newer flows.
//   2. The `"<child name> · ..."` prefix of the line description (legacy rows).
//   3. Fallback: the whole amount stays on `payment.student_id`.

export interface AllocatablePayment {
  id?: string | null;
  student_id?: string | null;
  amount: number | string | null;
  enrollment_breakdown?: any;
  /** Credits / refunds point back at the payment they cancel. */
  refund_of_payment_id?: string | null;
}

export interface AllocationChild {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
}

const norm = (s: string) => s.replace(/[\s\u200f\u200e]+/g, " ").trim().toLowerCase();

function linesOf(breakdown: any): any[] {
  if (!breakdown) return [];
  if (Array.isArray(breakdown)) return breakdown;
  if (Array.isArray(breakdown.lines)) return breakdown.lines;
  return [];
}

/**
 * Returns the per-student share of a single payment row.
 * The shares always sum back to the row's amount (rounding drift lands on the
 * largest share), so family totals never change.
 */
export function allocatePayment(
  payment: AllocatablePayment,
  children: AllocationChild[],
  /** All rows in scope — lets credits inherit the split of the payment they cancel. */
  relatedRows?: AllocatablePayment[],
): Map<string, number> {
  const total = Math.round((Number(payment.amount) || 0) * 100) / 100;
  const out = new Map<string, number>();
  const fallback = () => {
    if (payment.student_id) out.set(payment.student_id, total);
    return out;
  };
  if (!total || children.length < 2) return fallback();

  const byName = new Map<string, string>();
  for (const c of children) {
    const full = norm(`${c.first_name ?? ""} ${c.last_name ?? ""}`);
    if (full) byName.set(full, c.id);
    const first = norm(c.first_name ?? "");
    if (first && !byName.has(first)) byName.set(first, c.id);
  }
  const known = new Set(children.map((c) => c.id));

  let lines = linesOf(payment.enrollment_breakdown);
  // A credit / refund carries no breakdown of its own: mirror the split of the
  // original payment so the two cancel each other out per child.
  if (!lines.length && payment.refund_of_payment_id && relatedRows?.length) {
    let ref: string | null | undefined = payment.refund_of_payment_id;
    const seen = new Set<string>();
    for (let i = 0; i < 5 && ref && !seen.has(ref); i++) {
      seen.add(ref);
      const src = relatedRows.find((r) => r.id === ref);
      if (!src) break;
      const srcLines = linesOf(src.enrollment_breakdown);
      if (srcLines.length) {
        lines = srcLines;
        break;
      }
      ref = src.refund_of_payment_id;
    }
  }
  if (!lines.length) return fallback();

  const raw = new Map<string, number>();
  for (const ln of lines) {
    const amt = Number(ln?.amount) || 0;
    if (!amt) continue;
    let sid: string | null =
      ln?.student_id && known.has(ln.student_id) ? ln.student_id : null;
    if (!sid) {
      const desc = String(ln?.description ?? ln?.label ?? "");
      const prefix = desc.split("·")[0];
      const cand = byName.get(norm(prefix));
      if (cand) sid = cand;
    }
    if (!sid) return fallback();
    raw.set(sid, Math.round(((raw.get(sid) ?? 0) + amt) * 100) / 100);
  }

  const sum = [...raw.values()].reduce((s, v) => s + v, 0);
  if (raw.size < 2 || sum <= 0) return fallback();

  // Scale to the actual row amount (handles partial / split payments).
  let running = 0;
  const entries = [...raw.entries()].sort((a, b) => b[1] - a[1]);
  entries.forEach(([sid, v], i) => {
    const share =
      i === entries.length - 1
        ? Math.round((total - running) * 100) / 100
        : Math.round(((total * v) / sum) * 100) / 100;
    running = Math.round((running + share) * 100) / 100;
    out.set(sid, share);
  });
  return out;
}

/** Share of a single payment row that belongs to `studentId`. */
export function studentShareOfPayment(
  payment: AllocatablePayment,
  studentId: string,
  children: AllocationChild[],
): number {
  return allocatePayment(payment, children).get(studentId) ?? 0;
}

/** True when the row's money is shared between several children. */
export function isSplitAcrossChildren(
  payment: AllocatablePayment,
  children: AllocationChild[],
): boolean {
  return allocatePayment(payment, children).size > 1;
}
