/**
 * Default instrument_start_date:
 * - If today is before the academic year's start date (e.g. 1.9) → return that start date.
 * - Otherwise → return today.
 * Falls back to today if no year info is provided.
 */
export function computeDefaultInstrumentStartDate(
  year?: { start_date?: string | null } | null
): string {
  const todayStr = new Date().toISOString().slice(0, 10);
  const start = year?.start_date;
  if (!start) return todayStr;
  return todayStr < start ? start : todayStr;
}
