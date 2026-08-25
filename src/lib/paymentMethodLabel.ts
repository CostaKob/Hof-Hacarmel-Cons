export interface PaymentSummaryEntry {
  payment_method: string | null | undefined;
  installments?: number | string | null | undefined;
  payment_group_id?: string | null;
  amount?: number | string | null;
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "מזומן",
  credit_card: "אשראי",
  bank_transfer: "העברה בנקאית",
  cheque: "צ׳ק",
  check: "צ׳ק",
  bit: "ביט",
  other: "אחר",
};

const hebrewCount = (n: number, singular: string, plural: string) => {
  if (n === 1) return `1 ${singular}`;
  if (n === 2) return `2 ${plural}`;
  return `${n} ${plural}`;
};

/**
 * Returns a concise Hebrew description of the payment method.
 * - credit_card: "אשראי · 3 תשלומים" (or "אשראי · תשלום אחד")
 * - check/cheque: "צ׳ק · 2 צ׳קים" (or "צ׳ק · צ׳ק אחד")
 * - cash: "מזומן"
 * - other methods: just the method label
 */
export const formatPaymentMethodWithCount = (
  method: string | null | undefined,
  installments: number | string | null | undefined,
): string => {
  const normalized = method?.toString().toLowerCase() ?? "";
  const label = PAYMENT_METHOD_LABELS[normalized] ?? method ?? "";
  const count = Math.max(0, Number(installments || 0));

  if (normalized === "credit_card") {
    if (count > 1) return `${label} · ${hebrewCount(count, "תשלום", "תשלומים")}`;
    if (count === 1) return `${label} · תשלום אחד`;
    return label;
  }

  if (normalized === "check" || normalized === "cheque") {
    if (count > 1) return `${label} · ${hebrewCount(count, "צ׳ק", "צ׳קים")}`;
    if (count === 1) return `${label} · צ׳ק אחד`;
    return label;
  }

  return label;
};

export const isCheckMethod = (method: string | null | undefined) => {
  const normalized = method?.toString().toLowerCase() ?? "";
  return normalized === "check" || normalized === "cheque";
};

/**
 * Summarises payment methods used across a list of payments.
 * Groups by payment_group_id when present so each group counts as one unit.
 * Example: ["אשראי · 8 תשלומים", "צ׳ק · 3 צ׳קים"]
 */
export const summarizePaymentMethods = (payments: PaymentSummaryEntry[]): string[] => {
  const groupMap = new Map<string, PaymentSummaryEntry>();
  const standalone: PaymentSummaryEntry[] = [];

  for (const p of payments) {
    const groupId = p.payment_group_id;
    if (groupId) {
      if (!groupMap.has(groupId)) groupMap.set(groupId, p);
    } else {
      standalone.push(p);
    }
  }

  const grouped = Array.from(groupMap.values()).concat(standalone);

  // For the method summary we show each method's total count
  const countsByMethod: Map<string, { count: number; installments: number }> = new Map();
  for (const p of grouped) {
    const method = p.payment_method || "other";
    const key = method.toLowerCase();
    const existing = countsByMethod.get(key);
    const installments = Math.max(0, Number(p.installments || 0));
    if (existing) {
      existing.count += 1;
      existing.installments += installments;
    } else {
      countsByMethod.set(key, { count: 1, installments });
    }
  }

  const result: string[] = [];
  for (const [method, { installments }] of countsByMethod) {
    result.push(formatPaymentMethodWithCount(method, installments > 0 ? installments : null));
  }

  return result;
};

