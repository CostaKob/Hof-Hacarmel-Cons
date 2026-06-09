// Dynamic discount types managed per academic year.
// Each discount has a percentage and an `applies_to` scope:
//   - "all":                 reduces every enrollment by the percentage.
//   - "cheapest_enrollment": reduces only the single cheapest enrollment
//                            (mirrors the legacy "כלי שני" behavior).
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
  appliedEnrollmentId: string | null; // for "cheapest_enrollment"
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
 */
export function computeStandardDiscounts(
  rows: EnrollmentProrated[],
  selected: DiscountType[],
): ComputeDiscountsResult {
  const cheapest =
    rows.length >= 2
      ? [...rows].sort((a, b) => a.prorated - b.prorated)[0]?.enrollmentId ?? null
      : null;

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
        appliedEnrollmentId: d.applies_to === "cheapest_enrollment" ? cheapest : null,
        amount: 0,
      });
      continue;
    }
    if (d.applies_to === "cheapest_enrollment") {
      if (!cheapest) {
        // Needs 2+ enrollments — skip
        lines.push({
          discountTypeId: d.id,
          label: d.label,
          percentage: pct,
          applies_to: d.applies_to,
          appliedEnrollmentId: null,
          amount: 0,
        });
        continue;
      }
      perEnrollmentPct.set(cheapest, (perEnrollmentPct.get(cheapest) ?? 0) + pct);
      const row = rows.find((r) => r.enrollmentId === cheapest)!;
      lines.push({
        discountTypeId: d.id,
        label: d.label,
        percentage: pct,
        applies_to: d.applies_to,
        appliedEnrollmentId: cheapest,
        amount: Math.round(row.prorated * pct) / 100,
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
        appliedEnrollmentId: null,
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
