// Shared registration status configuration
export const REGISTRATION_STATUSES: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; color: string }> = {
  new: { label: "חדש", variant: "default", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  in_review: { label: "בטיפול", variant: "secondary", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  waiting_for_call: { label: "ממתין לשיחה", variant: "outline", color: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300" },
  waiting_for_payment: { label: "ממתין לתשלום", variant: "outline", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  approved: { label: "אושר", variant: "outline", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  converted: { label: "הומר לתלמיד", variant: "outline", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
  rejected: { label: "נדחה", variant: "destructive", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
};

// Statuses that represent "active" / actionable registrations
export const ACTIVE_STATUSES = ["new", "in_review", "waiting_for_call", "waiting_for_payment", "approved"];

export function daysAgo(dateStr: string): number {
  const created = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

export function daysAgoLabel(dateStr: string): string {
  const days = daysAgo(dateStr);
  if (days === 0) return "היום";
  if (days === 1) return "אתמול";
  return `לפני ${days} ימים`;
}
