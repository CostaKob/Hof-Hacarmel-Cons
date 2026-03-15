// Shared registration status configuration — simplified workflow
export const REGISTRATION_STATUSES: Record<string, { label: string; color: string }> = {
  new: { label: "חדש", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300" },
  in_review: { label: "בטיפול", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300" },
  waiting_for_payment: { label: "ממתין לתשלום", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
  ready_to_assign: { label: "מוכן לשיבוץ", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300" },
  rejected: { label: "נדחה", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
  converted: { label: "שובץ", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
};

// Statuses the secretary can pick from the dropdown (excludes "converted" which is set automatically)
export const SETTABLE_STATUSES = ["new", "in_review", "waiting_for_payment", "ready_to_assign", "rejected"];

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
