// Dynamic discount types managed per academic year.
// Each discount has a percentage and an `applies_to` scope:
//   - "all":                 reduces every enrollment by the percentage.
//   - "cheapest_enrollment": reduces every enrollment EXCEPT the single most
//                            expensive one (extends the legacy "כלי שני"
//                            behavior: 2 enrollments → discount on 1,
//                            3 → on 2, 4 → on 3, etc.).
//                            Only active when there are 2+ enrollments.

export type DiscountAppliesTo = "all" | "cheapest_enrollment";

export interface DiscountType {
  id: string;
  academic_year_id: string;
  label: string;
  percentage: number;
  applies_to: DiscountAppliesTo;
  legacy_key: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface EnrollmentProrated {
  enrollmentId: string;
  prorated: number;
}

export interface DiscountLine {
  discountTypeId: string;
  label: string;
  percentage: number;
  applies_to: DiscountAppliesTo;
  /** For "cheapest_enrollment" — all enrollments the discount applied to
   *  (every row except the single most expensive). */
  appliedEnrollmentIds: string[];
  amount: number; // total discount amount in ILS (positive number)
}

export interface ComputeDiscountsResult {
  /** Map of enrollmentId -> total standard discount percentage applied. */
  perEnrollmentPct: Map<string, number>;
  /** Sum of prorated values after standard discounts. */
  afterStdDiscount: number;
  /** Detailed breakdown per selected discount, with amount. */
  lines: DiscountLine[];
}

/**
 * Apply selected discount_types against a set of prorated enrollments.
 *
 * `overridesByDiscountId` — optional per-discount override selecting exactly
 * which enrollments receive that discount. Only meaningful for
 * `cheapest_enrollment` scope; when provided (non-empty array), it fully
 * replaces the automatic "all except most expensive" default. Pass an empty
 * object (or omit) to keep automatic behavior.
 */
export function computeStandardDiscounts(
  rows: EnrollmentProrated[],
  selected: DiscountType[],
  overridesByDiscountId: Record<string, string[]> = {},
): ComputeDiscountsResult {
  // For "cheapest_enrollment": default = every enrollment EXCEPT the single
  // most expensive one. Requires 2+ enrollments.
  const autoDiscountedIds: string[] = (() => {
    if (rows.length < 2) return [];
    const sorted = [...rows].sort((a, b) => b.prorated - a.prorated); // desc
    return sorted.slice(1).map((r) => r.enrollmentId);
  })();


  const perEnrollmentPct = new Map<string, number>();
  for (const r of rows) perEnrollmentPct.set(r.enrollmentId, 0);

  const lines: DiscountLine[] = [];

  for (const d of selected) {
    const pct = Number(d.percentage) || 0;
    if (!pct) {
      lines.push({
        discountTypeId: d.id,
        label: d.label,
        percentage: pct,
        applies_to: d.applies_to,
        appliedEnrollmentIds: d.applies_to === "cheapest_enrollment" ? discountedIds : [],
        amount: 0,
      });
      continue;
    }
    if (d.applies_to === "cheapest_enrollment") {
      if (discountedIds.length === 0) {
        // Needs 2+ enrollments — skip
        lines.push({
          discountTypeId: d.id,
          label: d.label,
          percentage: pct,
          applies_to: d.applies_to,
          appliedEnrollmentIds: [],
          amount: 0,
        });
        continue;
      }
      let amount = 0;
      for (const id of discountedIds) {
        perEnrollmentPct.set(id, (perEnrollmentPct.get(id) ?? 0) + pct);
        const row = rows.find((r) => r.enrollmentId === id)!;
        amount += row.prorated * pct;
      }
      lines.push({
        discountTypeId: d.id,
        label: d.label,
        percentage: pct,
        applies_to: d.applies_to,
        appliedEnrollmentIds: [...discountedIds],
        amount: Math.round(amount) / 100,
      });
    } else {
      let amount = 0;
      for (const r of rows) {
        perEnrollmentPct.set(r.enrollmentId, (perEnrollmentPct.get(r.enrollmentId) ?? 0) + pct);
        amount += r.prorated * pct;
      }
      lines.push({
        discountTypeId: d.id,
        label: d.label,
        percentage: pct,
        applies_to: d.applies_to,
        appliedEnrollmentIds: [],
        amount: Math.round(amount) / 100,
      });
    }
  }

  let afterStdDiscount = 0;
  for (const r of rows) {
    const pct = perEnrollmentPct.get(r.enrollmentId) ?? 0;
    afterStdDiscount += Math.round(r.prorated * (1 - pct / 100) * 100) / 100;
  }

  return { perEnrollmentPct, afterStdDiscount, lines };
}
