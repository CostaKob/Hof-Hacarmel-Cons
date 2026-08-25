import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileDown, ChevronDown, ChevronUp, Wallet, AlertCircle, Clock } from "lucide-react";
import { format } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPaymentMethodWithCount, isCheckMethod } from "@/lib/paymentMethodLabel";

interface StudentPaymentsSectionProps {
  studentId: string;
  payments: any[];
  enrollments: any[];
  /** Optional calculated tuition total for the selected year/screen. */
  totalDue?: number;
  /** Optional calculated balance. Positive = still owes, zero/negative = fully paid. */
  balanceDue?: number;
  /** Optional extra buttons to render in the header (e.g. year filter) */
  extraHeaderActions?: ReactNode;
  /** Show academic year next to date (used in student card). */
  showYear?: boolean;
  /**
   * Parent national id of the student's family — used to link to the family card,
   * where ALL money actions (payment / receipt / refund / cheque cancellation) live.
   */
  familyParentNationalId?: string | null;
}

/**
 * READ-ONLY view of a student's payments & credits.
 * Every money action (charge, receipt, refund, cheque cancellation, bank-transfer
 * refund) is performed exclusively from the family card (`/admin/families/:id`).
 */
const StudentPaymentsSection = ({
  payments,
  totalDue,
  balanceDue,
  extraHeaderActions,
  showYear = false,
  familyParentNationalId,
}: StudentPaymentsSectionProps) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<"payment_date" | "paid_at">("payment_date");

  const totalPaid = payments.reduce((s: number, p: any) => {
    const amount = Number(p.amount || 0);
    if (amount < 0) return s + amount;
    return p.transaction_type === "payment" ? s + amount : s - amount;
  }, 0);

  const hasCalculatedBalance = typeof balanceDue === "number" && Number.isFinite(balanceDue);
  const calculatedTotal = typeof totalDue === "number" && Number.isFinite(totalDue) ? totalDue : null;
  const preciseBalance = hasCalculatedBalance ? Math.round(balanceDue * 100) / 100 : 0;
  const formatMoney = (n: number) => {
    const abs = Math.abs(n);
    const hasDecimals = Math.round(abs * 100) % 100 !== 0;
    return abs.toLocaleString(undefined, {
      minimumFractionDigits: hasDecimals ? 2 : 0,
      maximumFractionDigits: 2,
    });
  };
  const overallStatus = !hasCalculatedBalance
    ? null
    : calculatedTotal !== null && calculatedTotal <= 0
      ? { label: "לא נקבע חיוב", className: "bg-muted text-muted-foreground border-border" }
      : preciseBalance < -0.005
        ? { label: `קיים זיכוי · ₪${formatMoney(preciseBalance)}`, className: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-700" }
        : Math.abs(preciseBalance) < 0.005
          ? { label: "שולם במלואו", className: "bg-primary/15 text-primary border-primary/40" }
          : totalPaid > 0.005
            ? { label: `שולם חלקית · יתרה ₪${formatMoney(preciseBalance)}`, className: "bg-destructive/10 text-destructive border-destructive/30" }
            : { label: `ממתין לתשלום · יתרה ₪${formatMoney(preciseBalance)}`, className: "bg-destructive/10 text-destructive border-destructive/30" };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-foreground text-base">תשלומים ({payments.length})</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm text-muted-foreground">
            סה״כ שולם: <span className="font-semibold text-foreground">₪{totalPaid.toLocaleString()}</span>
          </div>
          {overallStatus && (
            <span className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${overallStatus.className}`}>
              {overallStatus.label}
            </span>
          )}
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="h-10 w-auto min-w-[160px] rounded-xl gap-2" dir="rtl">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent dir="rtl">
              <SelectItem value="payment_date">תאריך תשלום</SelectItem>
              <SelectItem value="paid_at">תאריך ושעה</SelectItem>
            </SelectContent>
          </Select>
          {extraHeaderActions}
        </div>
      </div>

      {familyParentNationalId ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-3">
          <p className="text-sm text-foreground font-medium">
            ניהול תשלומים וזיכויים מתבצע בכרטיס המשפחה
          </p>
          <Button asChild className="h-12 w-full sm:w-auto rounded-xl px-6 gap-2 shadow-sm">
            <Link to={`/admin/families/${familyParentNationalId}`}>
              <Wallet className="h-4 w-4" /> ניהול כספים בכרטיס המשפחה
            </Link>
          </Button>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            ניהול תשלומים וזיכויים מתבצע בכרטיס המשפחה. לתלמיד זה אין ת״ז הורה — יש להשלים אותה בכרטיס התלמיד כדי לפתוח את כרטיס המשפחה.
          </span>
        </div>
      )}

      {payments.length === 0 ? (
        <p className="text-sm text-muted-foreground">לא בוצעו תשלומים עדיין</p>
      ) : (
        <div className="space-y-2">
          {(() => {
            // Group split payments (e.g. cheque splits) that share a payment_group_id into one row
            const groups = new Map<string, any[]>();
            for (const p of payments) {
              const key = p.payment_group_id ? `g:${p.payment_group_id}` : `p:${p.id}`;
              const arr = groups.get(key);
              if (arr) arr.push(p); else groups.set(key, [p]);
            }
            const entries = [...groups.entries()].map(([key, rows]) => {
              const sorted = [...rows].sort((a, b) =>
                new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
              );
              return { key, head: sorted[0], rows: sorted };
            });
            entries.sort((a, b) => {
              if (sortBy === "paid_at") {
                return (
                  new Date(b.head.paid_at || b.head.created_at || b.head.payment_date).getTime() -
                  new Date(a.head.paid_at || a.head.created_at || a.head.payment_date).getTime()
                );
              }
              return (
                new Date(b.head.payment_date || b.head.created_at).getTime() -
                new Date(a.head.payment_date || a.head.created_at).getTime()
              );
            });
            return entries;
          })().map(({ key, head, rows }) => {
            const p = head;
            const isGroup = rows.length > 1;
            const groupTotal = rows.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
            const isExpanded = !!expanded[key];
            const isCredit = p.transaction_type !== "payment";
            const hasInvoice = !!p.invoice_url;
            const refundedSoFar = payments
              .filter((x: any) => rows.some((r: any) => r.id === x.refund_of_payment_id))
              .reduce((s: number, x: any) => s + Math.abs(Number(x.amount || 0)), 0);

            // Status pill: derived from payment_status / refunds / transaction type
            let statusLabel = "";
            let statusClass = "";
            if (isCredit) {
              statusLabel = "זיכוי";
              statusClass = "bg-destructive/10 text-destructive border-destructive/30";
            } else if (p.payment_status === "failed") {
              statusLabel = "נכשל";
              statusClass = "bg-destructive/10 text-destructive border-destructive/30";
            } else if (p.payment_status === "pending") {
              statusLabel = "ממתין לתשלום";
              statusClass = "bg-amber-500/10 text-amber-700 border-amber-500/30";
            } else if (refundedSoFar >= groupTotal - 0.005 && refundedSoFar > 0) {
              statusLabel = "זוכה במלואו";
              statusClass = "bg-muted text-muted-foreground border-border";
            } else if (refundedSoFar > 0) {
              statusLabel = "זוכה חלקית";
              statusClass = "bg-amber-500/10 text-amber-700 border-amber-500/30";
            } else {
              statusLabel = hasCalculatedBalance ? "תשלום התקבל" : "שולם";
              statusClass = "bg-green-500/10 text-green-700 border-green-500/30";
            }

            const lastRow = rows[rows.length - 1];
            const isCheck = isCheckMethod(p.payment_method);
            const refLabel = isCheck ? "צ׳ק מס׳" : "אסמכתא";

            return (
              <div key={key} className="rounded-xl border border-border transition-colors">
                <div className="flex items-center justify-between p-3 gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-foreground text-sm">
                      {isGroup
                        ? `${format(new Date(p.payment_date), "dd/MM/yyyy")} – ${format(new Date(lastRow.payment_date), "dd/MM/yyyy")}`
                        : sortBy === "paid_at" && p.paid_at
                          ? `${format(new Date(p.paid_at), "dd/MM/yyyy · HH:mm")}`
                          : format(new Date(p.payment_date), "dd/MM/yyyy")}
                      {showYear && p.academic_years?.name && (
                        <span className="text-muted-foreground font-normal"> · {p.academic_years.name}</span>
                      )}
                    </p>
                    <span className={`text-[11px] px-2 py-0.5 rounded-md border font-medium ${statusClass}`}>
                      {statusLabel}
                    </span>
                    {isGroup && (
                      <span className="text-[11px] px-2 py-0.5 rounded-md border border-border bg-muted text-muted-foreground font-medium">
                        פריסה · {rows.length} תשלומים
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {isCredit ? "זיכוי" : "תשלום"}
                    {p.payment_method && ` · ${formatPaymentMethodWithCount(p.payment_method, p.installments)}`}
                    {!isGroup && p.reference_number && ` · ${refLabel} ${p.reference_number}`}
                    {p.icount_doc_number && ` · קבלה ${p.icount_doc_number}`}
                    {p.month_reference && ` · ${p.month_reference}`}
                  </p>
                  {(() => {
                    const bd = p.enrollment_breakdown;
                    const pd = bd && !Array.isArray(bd) ? (bd as any).payerDetails : null;
                    const pl = bd && !Array.isArray(bd) ? (bd as any).payerLabel : null;
                    if (!pd && !pl) return null;
                    const fullName = pd ? [pd.firstName, pd.lastName].filter(Boolean).join(" ").trim() : "";
                    const contact = pd ? [pd.phone, pd.email].filter(Boolean).join(" · ") : "";
                    return (
                      <p className="text-xs text-foreground mt-0.5">
                        <span className="text-muted-foreground">שולם ע״י: </span>
                        {pl}
                        {pl && fullName ? " · " : ""}
                        {fullName && <span className="font-medium">{fullName}</span>}
                        {contact && <span className="text-muted-foreground"> · {contact}</span>}
                      </p>
                    );
                  })()}
                  {p.notes && <p className="text-xs text-muted-foreground mt-0.5">{p.notes}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isGroup && (
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                      title={isExpanded ? "הסתר פירוט" : "הצג פירוט"}
                      onClick={(e) => { e.stopPropagation(); setExpanded((s) => ({ ...s, [key]: !s[key] })); }}>
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  )}
                  {hasInvoice && (
                    <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg"
                      title={isCredit ? "הורד קבלת זיכוי" : "הורד קבלה"}
                      onClick={(e) => { e.stopPropagation(); window.open(p.invoice_url, "_blank"); }}>
                      <FileDown className="h-4 w-4" />
                    </Button>
                  )}
                  <span className={`font-semibold text-sm whitespace-nowrap ${isCredit ? "text-destructive" : "text-primary"}`} dir="ltr">
                    {isCredit ? `−₪${Math.abs(groupTotal).toLocaleString()}` : `₪${Math.abs(groupTotal).toLocaleString()}`}
                  </span>
                </div>
                </div>

                {isGroup && isExpanded && (
                  <div className="border-t border-border px-3 py-2 space-y-1">
                    {rows.map((r: any, idx: number) => {
                      const rRefunded = payments
                        .filter((x: any) => x.refund_of_payment_id === r.id)
                        .reduce((s: number, x: any) => s + Math.abs(Number(x.amount || 0)), 0);
                      const rIsCheck = r.payment_method === "check" || r.payment_method === "צ׳ק" || r.payment_method === "צ'ק";
                      const rRefLabel = rIsCheck ? "צ׳ק מס׳" : "אסמכתא";
                      return (
                        <div
                          key={r.id}
                          className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-muted-foreground">{idx + 1}.</span>
                              <span className="font-medium text-foreground">{format(new Date(r.payment_date), "dd/MM/yyyy")}</span>
                              {r.reference_number && <span className="text-muted-foreground">{rRefLabel} {r.reference_number}</span>}
                              {rRefunded > 0 && <span className="text-amber-700">זוכה ₪{rRefunded.toLocaleString()}</span>}
                            </div>
                            {r.notes && <p className="text-[11px] text-muted-foreground mt-0.5">{r.notes}</p>}
                          </div>
                          <span className="font-semibold text-foreground whitespace-nowrap shrink-0" dir="ltr">
                            ₪{Math.abs(Number(r.amount || 0)).toLocaleString()}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentPaymentsSection;
