import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import UnifyParentDetailsDialog from "@/components/admin/UnifyParentDetailsDialog";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users,
  User,
  Phone,
  Mail,
  ExternalLink,
  Wallet,
  Music,
  Receipt,
  ArrowLeft,
} from "lucide-react";
import { useFamiliesList, useFamilyDetails } from "@/hooks/useFamilies";
import { useAcademicYear } from "@/hooks/useAcademicYear";

const STATUS_LABELS: Record<string, string> = {
  paid: "שולם",
  pending: "ממתין",
  failed: "נכשל",
};

const METHOD_LABELS: Record<string, string> = {
  credit_card: "אשראי",
  cash: "מזומן",
  check: "צ׳ק",
  transfer: "העברה",
  other: "אחר",
};

const AdminFamilyCard = () => {
  const { parentNationalId: raw } = useParams();
  const parentNationalId = raw ? decodeURIComponent(raw) : "";
  const navigate = useNavigate();
  const { selectedYearId, activeYear } = useAcademicYear();
  const yearId = selectedYearId ?? activeYear?.id ?? null;

  const [unifyOpen, setUnifyOpen] = useState(false);

  const { data: families = [] } = useFamiliesList(yearId);
  const family = useMemo(
    () => families.find((f) => f.parent_national_id === parentNationalId),
    [families, parentNationalId],
  );

  const { data, isLoading } = useFamilyDetails(
    parentNationalId,
    family?.children_ids,
    yearId,
  );

  const children = data?.children ?? [];
  const enrollments = data?.enrollments ?? [];
  const payments = data?.payments ?? [];

  // Compute expected annual per enrollment: price_per_lesson × total_lessons_allocated.
  const enrollmentTotal = (e: any) =>
    Math.round(
      (Number(e.price_per_lesson) || 0) * (Number(e.total_lessons_allocated) || 0),
    );

  const totalExpected = enrollments.reduce((s, e) => s + enrollmentTotal(e), 0);
  const totalPaid = payments
    .filter((p) => p.transaction_type === "payment" && p.payment_status === "paid")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalCredit = payments
    .filter((p) => p.transaction_type === "credit")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  const balance = totalExpected - totalPaid + totalCredit;

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of children) m.set(c.id, `${c.first_name} ${c.last_name}`.trim());
    return m;
  }, [children]);

  return (
    <AdminLayout title="כרטיס משפחה" backPath="/admin/families">
      <PageTitle title={family?.parent_name || "כרטיס משפחה"} />

      {!family && !isLoading ? (
        <div className="text-center text-muted-foreground py-12">משפחה לא נמצאה</div>
      ) : (
        <div className="space-y-5">
          {/* Header */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-5 w-5 text-primary" />
                  <h1 className="text-xl font-bold text-foreground">
                    {family?.parent_name || "ללא שם"}
                  </h1>
                </div>
                <div className="text-sm text-muted-foreground">
                  ת.ז. הורה: <span className="font-mono">{parentNationalId}</span>
                </div>
                <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground flex-wrap">
                  {family?.parent_phone && (
                    <a
                      href={`tel:${family.parent_phone}`}
                      className="inline-flex items-center gap-1 hover:text-primary"
                    >
                      <Phone className="h-4 w-4" /> {family.parent_phone}
                    </a>
                  )}
                  {family?.parent_email && (
                    <a
                      href={`mailto:${family.parent_email}`}
                      className="inline-flex items-center gap-1 hover:text-primary"
                    >
                      <Mail className="h-4 w-4" /> {family.parent_email}
                    </a>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge variant="default" className="text-sm">
                  {children.length} {children.length === 1 ? "ילד" : "ילדים"}
                </Badge>
                {children.length > 1 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUnifyOpen(true)}
                    className="rounded-xl"
                  >
                    אחד פרטי הורה
                  </Button>
                )}
              </div>
            </div>
          </div>

          <UnifyParentDetailsDialog
            open={unifyOpen}
            onOpenChange={setUnifyOpen}
            parentNationalId={parentNationalId}
            children={children}
          />


          {/* Children */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-semibold text-foreground text-base flex items-center gap-2 mb-3">
              <User className="h-4 w-4" /> ילדים
            </h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {children.map((c) => (
                <button
                  key={c.id}
                  onClick={() => navigate(`/admin/students/${c.id}`)}
                  className="text-right rounded-xl border border-border p-3 hover:bg-muted/50 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-foreground truncate">
                      {c.first_name} {c.last_name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {c.grade && `כיתה ${c.grade}`}
                      {c.city && ` · ${c.city}`}
                    </div>
                  </div>
                  <ArrowLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Enrollments */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-semibold text-foreground text-base flex items-center gap-2 mb-3">
              <Music className="h-4 w-4" /> שיוכים ({enrollments.length})
            </h2>
            {enrollments.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין שיוכים בשנה זו.</p>
            ) : (
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="text-right py-2 pe-3">ילד</th>
                      <th className="text-right py-2 pe-3">כלי</th>
                      <th className="text-right py-2 pe-3">מורה</th>
                      <th className="text-right py-2 pe-3">שלוחה</th>
                      <th className="text-right py-2 pe-3">מחיר לשיעור</th>
                      <th className="text-right py-2">סה"כ שנתי</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollments.map((e) => (
                      <tr key={e.id} className="border-b border-border/50">
                        <td className="py-2 pe-3">{nameById.get(e.student_id) || "—"}</td>
                        <td className="py-2 pe-3">{e.instruments?.name || "—"}</td>
                        <td className="py-2 pe-3">
                          {e.teachers
                            ? `${e.teachers.first_name} ${e.teachers.last_name}`
                            : "—"}
                        </td>
                        <td className="py-2 pe-3">{e.schools?.name || "—"}</td>
                        <td className="py-2 pe-3">
                          {e.price_per_lesson
                            ? `₪${Number(e.price_per_lesson).toLocaleString()}`
                            : "—"}
                        </td>
                        <td className="py-2 font-medium">
                          ₪{enrollmentTotal(e).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td colSpan={5} className="py-2 pe-3 text-right">
                        סה"כ צפוי
                      </td>
                      <td className="py-2">₪{totalExpected.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Financial summary */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-semibold text-foreground text-base flex items-center gap-2 mb-3">
              <Wallet className="h-4 w-4" /> סיכום כספי משפחתי
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-muted/40 p-3">
                <div className="text-xs text-muted-foreground">סה"כ צפוי</div>
                <div className="text-lg font-bold text-foreground">
                  ₪{totalExpected.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 p-3">
                <div className="text-xs text-emerald-700 dark:text-emerald-300">שולם</div>
                <div className="text-lg font-bold text-emerald-700 dark:text-emerald-300">
                  ₪{totalPaid.toLocaleString()}
                </div>
              </div>
              <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 p-3">
                <div className="text-xs text-amber-700 dark:text-amber-300">זיכויים</div>
                <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
                  ₪{totalCredit.toLocaleString()}
                </div>
              </div>
              <div
                className={`rounded-xl p-3 ${
                  balance > 0
                    ? "bg-rose-50 dark:bg-rose-950/30"
                    : "bg-sky-50 dark:bg-sky-950/30"
                }`}
              >
                <div
                  className={`text-xs ${
                    balance > 0
                      ? "text-rose-700 dark:text-rose-300"
                      : "text-sky-700 dark:text-sky-300"
                  }`}
                >
                  יתרה לגבייה
                </div>
                <div
                  className={`text-lg font-bold ${
                    balance > 0
                      ? "text-rose-700 dark:text-rose-300"
                      : "text-sky-700 dark:text-sky-300"
                  }`}
                >
                  ₪{balance.toLocaleString()}
                </div>
              </div>
            </div>
          </div>

          {/* Payments history */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="font-semibold text-foreground text-base flex items-center gap-2 mb-3">
              <Receipt className="h-4 w-4" /> תשלומים משותפים ({payments.length})
            </h2>
            {payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">אין תשלומים בשנה זו.</p>
            ) : (
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th className="text-right py-2 pe-3">תאריך</th>
                      <th className="text-right py-2 pe-3">ילד</th>
                      <th className="text-right py-2 pe-3">סוג</th>
                      <th className="text-right py-2 pe-3">סטטוס</th>
                      <th className="text-right py-2 pe-3">שיטה</th>
                      <th className="text-right py-2 pe-3">סכום</th>
                      <th className="text-right py-2">קבלה</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-b border-border/50">
                        <td className="py-2 pe-3 whitespace-nowrap">
                          {p.payment_date}
                        </td>
                        <td className="py-2 pe-3">
                          {p.family_payment_group_id ? (
                            <Badge variant="secondary" className="text-[10px]">
                              משפחתי
                            </Badge>
                          ) : (
                            (p.student_id && nameById.get(p.student_id)) || "—"
                          )}
                        </td>
                        <td className="py-2 pe-3">
                          {p.transaction_type === "credit" ? "זיכוי" : "תשלום"}
                        </td>
                        <td className="py-2 pe-3">
                          <Badge
                            variant={
                              p.payment_status === "paid"
                                ? "default"
                                : p.payment_status === "failed"
                                ? "destructive"
                                : "secondary"
                            }
                            className="text-[10px]"
                          >
                            {STATUS_LABELS[p.payment_status] || p.payment_status}
                          </Badge>
                        </td>
                        <td className="py-2 pe-3">
                          {(p.payment_method &&
                            (METHOD_LABELS[p.payment_method] || p.payment_method)) ||
                            "—"}
                        </td>
                        <td className="py-2 pe-3 font-medium">
                          {p.transaction_type === "credit" ? "−" : ""}₪
                          {Number(p.amount).toLocaleString()}
                        </td>
                        <td className="py-2">
                          {p.invoice_url ? (
                            <a
                              href={p.invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {p.icount_doc_number || "צפייה"}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              יצירת קישור תשלום מאוחד עבור כל ילדי המשפחה
            </p>
            <Button
              variant="outline"
              disabled
              className="h-11 rounded-xl"
              title="בפיתוח"
            >
              יצירת קישור תשלום מאוחד (בקרוב)
            </Button>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminFamilyCard;
