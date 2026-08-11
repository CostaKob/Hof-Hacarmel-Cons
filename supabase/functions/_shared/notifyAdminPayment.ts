// Sends the "payment received" notification to the studio admin inbox.
// Fire-and-forget: never throws, failures are logged only.
export interface AdminPaymentNotification {
  moduleLabel?: string;
  studentName?: string;
  studentNationalId?: string;
  parentName?: string;
  parentPhone?: string;
  parentEmail?: string;
  yearName?: string;
  schoolName?: string;
  amount?: number | string;
  paymentMethod?: string;
  installments?: number | string;
  docNumber?: string;
  invoiceUrl?: string;
  transactionId?: string;
  paidAt?: string;
  notes?: string;
  items?: { label: string; amount?: number | string }[];
}

export const ADMIN_PAYMENT_INBOX = "musichof@gmail.com";

export function formatIsraelDateTime(d: Date = new Date()): string {
  return d.toLocaleString("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function notifyAdminPayment(
  data: AdminPaymentNotification,
  idempotencyKey: string,
): Promise<void> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        apikey: SERVICE_ROLE,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        templateName: "admin-payment-received",
        recipientEmail: ADMIN_PAYMENT_INBOX,
        idempotencyKey,
        messageId: idempotencyKey,
        templateData: {
          paidAt: formatIsraelDateTime(),
          adminUrl: "https://musichof.com",
          ...data,
        },
      }),
    });
    if (!res.ok) {
      console.error("[notifyAdminPayment] failed", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("[notifyAdminPayment] error", e);
  }
}
