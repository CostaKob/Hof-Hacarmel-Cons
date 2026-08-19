// Pure logic for building a "future payments" schedule (לוח פירעונות) out of
// student_payments rows, covering the three billing flows used in the system:
//   • cheques        – one DB row per cheque (payment_date = due date)
//   • credit card    – ONE DB row + installments count → expanded into virtual
//                      monthly clearing entries (clearing day 2 of the next month)
//   • cash / transfer– a single already-settled entry
//
// Nothing here touches the network, so it can be unit-tested in isolation.

export type ScheduleKind = "cheque" | "credit_installment" | "one_off";
export type ScheduleStatus =
  | "cleared"
  | "future"
  | "cancelled"
  | "refunded"
  /** Withdrawal from the bank was requested — the cheque no longer counts, but is not cancelled yet. */
  | "pending_cancellation";

export interface ScheduleRow {
  /** Unique row key (virtual rows get an index suffix). */
  key: string;
  /** The real student_payments row id this entry belongs to. */
  paymentId: string;
  kind: ScheduleKind;
  /** Due / clearing date (ISO yyyy-MM-dd). */
  dueDate: string;
  amount: number;
  /** Amount that can still be cancelled or credited on this entry. */
  remaining: number;
  status: ScheduleStatus;
  method: string | null;
  reference: string | null;
  docNumber: string | null;
  installmentIndex?: number;
  installmentCount?: number;
  enrollmentId: string | null;
  /** True when the entry is in the future and can be cancelled outright (cheques only). */
  cancellable: boolean;
  /** True when money already moved and only a credit/refund is possible. */
  refundable: boolean;
  notes: string | null;
}

const CHEQUE_METHODS = new Set(["check", "cheque", "צ׳ק", "צ'ק"]);

export const isChequeMethod = (m?: string | null) => !!m && CHEQUE_METHODS.has(m);

export const toIsoDate = (d: string | Date) =>
  (typeof d === "string" ? d : d.toISOString()).slice(0, 10);

/** Credit-card installment n (0-based) clears on the 2nd of the month after the charge month. */
export function installmentDueDate(chargeDate: string | Date, index: number): string {
  const base = new Date(typeof chargeDate === "string" ? chargeDate : chargeDate.toISOString());
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1 + index, 2));
  return d.toISOString().slice(0, 10);
}

/** Split a total into `count` installments, cents-safe, remainder on the first one. */
export function splitInstallments(total: number, count: number): number[] {
  if (count <= 1) return [Math.round(total * 100) / 100];
  const cents = Math.round(Math.abs(total) * 100);
  const base = Math.floor(cents / count);
  const rest = cents - base * count;
  const out = Array.from({ length: count }, () => base / 100);
  out[0] = (base + rest) / 100;
  return out;
}

interface BuildOptions {
  /** Reference "today" (defaults to now) — anything after it counts as future. */
  today?: Date;
}

/**
 * Build the full payment schedule for a set of student_payments rows.
 * Credit rows (transaction_type = 'credit') are consumed as refunds against
 * their source payment and never shown as schedule entries themselves.
 */
export function buildPaymentSchedule(payments: any[], opts: BuildOptions = {}): ScheduleRow[] {
  const today = toIsoDate(opts.today ?? new Date());

  const refundedByPayment = new Map<string, number>();
  for (const p of payments) {
    if (!p?.refund_of_payment_id) continue;
    const prev = refundedByPayment.get(p.refund_of_payment_id) ?? 0;
    refundedByPayment.set(p.refund_of_payment_id, prev + Math.abs(Number(p.amount || 0)));
  }

  const rows: ScheduleRow[] = [];

  for (const p of payments) {
    if (p?.transaction_type !== "payment") continue;
    if (p?.payment_status === "failed" || p?.payment_status === "pending") continue;
    const amount = Math.abs(Number(p.amount || 0));
    if (amount <= 0) continue;

    const refunded = refundedByPayment.get(p.id) ?? 0;
    const remainingOnRow = Math.max(0, Math.round((amount - refunded) * 100) / 100);
    const common = {
      paymentId: p.id as string,
      method: (p.payment_method ?? null) as string | null,
      reference: (p.reference_number ?? null) as string | null,
      docNumber: (p.icount_doc_number ?? null) as string | null,
      enrollmentId: (p.enrollment_id ?? null) as string | null,
      notes: (p.notes ?? null) as string | null,
    };

    if (isChequeMethod(p.payment_method)) {
      const due = toIsoDate(p.payment_date);
      const chequeStatus: string = p.cheque_status ?? "pending";
      const status: ScheduleStatus =
        chequeStatus === "cancelled"
          ? "cancelled"
          : chequeStatus === "pending_cancellation"
            ? "pending_cancellation"
            : refunded >= amount - 0.005
              ? "refunded"
              : chequeStatus === "cleared" || due <= today
                ? "cleared"
                : "future";
      rows.push({
        ...common,
        key: `c:${p.id}`,
        kind: "cheque",
        dueDate: due,
        amount,
        remaining: status === "cancelled" || status === "pending_cancellation" ? 0 : remainingOnRow,
        status,
        cancellable: status === "future",
        refundable: status === "cleared" && remainingOnRow > 0.005,
      });
      continue;
    }

    if (p.payment_method === "credit_card" && Number(p.installments) > 1) {
      const count = Number(p.installments);
      const parts = splitInstallments(amount, count);
      const charge = p.paid_at ?? p.payment_date;
      // Refunds are applied against the LAST installments first (that is what a
      // partial credit-card refund effectively cancels out for the payer).
      let refundLeft = refunded;
      const perRow: number[] = parts.map(() => 0);
      for (let i = count - 1; i >= 0 && refundLeft > 0.005; i--) {
        const take = Math.min(parts[i], refundLeft);
        perRow[i] = take;
        refundLeft -= take;
      }
      parts.forEach((part, i) => {
        const due = installmentDueDate(charge, i);
        const rowRefunded = perRow[i];
        const remaining = Math.max(0, Math.round((part - rowRefunded) * 100) / 100);
        const status: ScheduleStatus =
          remaining <= 0.005 ? "refunded" : due <= today ? "cleared" : "future";
        rows.push({
          ...common,
          key: `i:${p.id}:${i}`,
          kind: "credit_installment",
          dueDate: due,
          amount: part,
          remaining,
          status,
          installmentIndex: i + 1,
          installmentCount: count,
          // A captured credit-card transaction cannot have future installments
          // cancelled at the clearing house — only credited back.
          cancellable: false,
          refundable: remaining > 0.005,
        });
      });
      continue;
    }

    const due = toIsoDate(p.payment_date);
    const status: ScheduleStatus =
      remainingOnRow <= 0.005 ? "refunded" : due <= today ? "cleared" : "future";
    rows.push({
      ...common,
      key: `p:${p.id}`,
      kind: "one_off",
      dueDate: due,
      amount,
      remaining: remainingOnRow,
      status,
      cancellable: false,
      refundable: remainingOnRow > 0.005,
    });
  }

  rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return rows;
}

export interface ScheduleTotals {
  paid: number;
  future: number;
  cancelled: number;
  refunded: number;
}

export function scheduleTotals(rows: ScheduleRow[]): ScheduleTotals {
  const t: ScheduleTotals = { paid: 0, future: 0, cancelled: 0, refunded: 0 };
  for (const r of rows) {
    if (r.status === "cancelled" || r.status === "pending_cancellation") t.cancelled += r.amount;
    else if (r.status === "refunded") t.refunded += r.amount;
    else if (r.status === "future") t.future += r.remaining;
    else t.paid += r.remaining;
  }
  return t;
}

/**
 * Rows the system suggests to act on when studies stop on `stopDate`:
 * everything whose due date is after the stop date (money not yet earned).
 */
export function suggestRowsForStopDate(rows: ScheduleRow[], stopDate: string): ScheduleRow[] {
  return rows.filter(
    (r) => (r.status === "future" || r.status === "cleared") &&
      r.dueDate > stopDate &&
      (r.cancellable || r.refundable),
  );
}
