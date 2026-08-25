export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "מזומן",
  credit_card: "אשראי",
  bank_transfer: "העברה בנקאית",
  cheque: "צ׳ק",
  check: "צ׳ק",
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
