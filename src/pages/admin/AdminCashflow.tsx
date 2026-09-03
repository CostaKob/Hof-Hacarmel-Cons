import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, FileSpreadsheet, ChevronDown, ChevronLeft, ExternalLink, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { exportCashflowWorkbook } from "@/lib/cashflowExcel";
import { useAppLogo } from "@/hooks/useAppLogo";


type Method = "cash" | "cheque" | "credit" | "transfer" | "other";

interface CashflowRow {
  due_date: string;
  month: string;
  method: Method;
  amount: number;
  client_name: string;
  doc_id: string;
  doc_number: string;
  doc_type: string;
  doc_date: string;
  doc_url: string | null;
  note: string;
  source: "students" | "school_music" | "external";
}

const METHOD_LABEL: Record<Method, string> = {
  cash: "מזומן",
  cheque: "שיקים",
  credit: "אשראי",
  transfer: "העברה בנקאית",
  other: "אחר",
};

const SOURCE_LABEL: Record<CashflowRow["source"], string> = {
  students: "תלמידים",
  school_music: "בית ספר מנגן",
  external: "אחר / חיצוני",
};

const ILS = (n: number) =>
  `₪ ${n.toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const monthLabel = (m: string) => {
  const [y, mm] = m.split("-");
  return `${mm}-${y}`;
};

// ברירת מחדל: מתחילת שנת הפעילות הכספית — 30.8.2026 (כדי שצ׳ק התאריך הזה ייכנס בדוח)
const DEFAULT_START = "2026-08-30";
const DEFAULT_END = "2027-08-31";

interface Reconciliation {
  icount_total: number;
  system_total: number;
  external_total?: number;
  missing_in_system: { doc_number: string; amount: number; client_name: string; doc_date: string }[];
  missing_in_icount: { doc_number: string; amount: number; source: string }[];
  amount_mismatches: { doc_number: string; icount_amount: number; system_amount: number; client_name: string }[];
}

const AdminCashflow = () => {
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [creditDay, setCreditDay] = useState("2");
  const [rows, setRows] = useState<CashflowRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [recon, setRecon] = useState<Reconciliation | null>(null);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});
  const { logoUrl } = useAppLogo();

  const runReport = useMutation({
    mutationFn: async () => {
      // Refresh the session first — an expired token makes the function return 401
      let { data: { session } } = await supabase.auth.getSession();
      const expSoon = !session?.expires_at || session.expires_at * 1000 - Date.now() < 60_000;
      if (expSoon) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        session = refreshed.session ?? session;
      }
      if (!session?.access_token) {
        throw new Error("פג תוקף ההתחברות — יש להתחבר מחדש ולנסות שוב");
      }
      const { data, error } = await supabase.functions.invoke("icount-cashflow", {
        body: { startDate, endDate, creditSettlementDay: Number(creditDay) },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let detail = "";
        try {
          const body = await ctx?.json?.();
          detail = body?.error ?? "";
          if (ctx?.status === 401) detail = "פג תוקף ההתחברות — יש להתחבר מחדש ולנסות שוב";
          if (ctx?.status === 403) detail = "אין הרשאה להפקת דוח תזרים";
        } catch { /* ignore */ }
        throw new Error(detail || error.message || "שגיאה בהפקת הדוח");
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { rows: CashflowRow[]; docs_scanned: number; warnings?: string[]; reconciliation?: Reconciliation };
    },

    onSuccess: (data) => {
      setRows(data.rows);
      setWarnings(data.warnings ?? []);
      setRecon(data.reconciliation ?? null);
      setOpenMonths({});
      if (data.warnings?.length) {
        toast.warning(`הדוח הופק חלקית — ${data.warnings.length} אזהרות`, {
          description: data.warnings[0],
          duration: 10000,
        });
      } else {
        toast.success("הדוח הופק בהצלחה — כל המסמכים נמשכו במלואם", {
          description: `נסרקו ${data.docs_scanned} מסמכים · ${data.rows.length} תנועות בטווח`,
          duration: 6000,
        });
      }
    },
    onError: (e: Error) => {
      setWarnings([]);
      setRecon(null);
      toast.error("הפקת הדוח נכשלה", { description: e.message, duration: 12000 });
    },
  });


  const filtered = useMemo(
    () => (rows ?? []).filter((r) => sourceFilter === "all" || r.source === sourceFilter),
    [rows, sourceFilter],
  );

  const months = useMemo(() => {
    const map = new Map<string, { month: string; total: number; count: number; byMethod: Record<Method, number>; rows: CashflowRow[] }>();
    for (const r of filtered) {
      if (!map.has(r.month)) {
        map.set(r.month, {
          month: r.month,
          total: 0,
          count: 0,
          byMethod: { cash: 0, cheque: 0, credit: 0, transfer: 0, other: 0 },
          rows: [],
        });
      }
      const bucket = map.get(r.month)!;
      bucket.total += r.amount;
      bucket.count += 1;
      bucket.byMethod[r.method] += r.amount;
      bucket.rows.push(r);
    }
    return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
  }, [filtered]);

  const grand = useMemo(() => {
    const t = { total: 0, cash: 0, cheque: 0, credit: 0, transfer: 0, other: 0 };
    for (const r of filtered) {
      t.total += r.amount;
      t[r.method] += r.amount;
    }
    return t;
  }, [filtered]);

  const exportXlsx = async () => {
    if (!filtered.length) return;
    try {
      await exportCashflowWorkbook({
        rows: filtered,
        months,
        startDate,
        endDate,
        logoUrl,
        sourceLabel: sourceFilter === "all" ? "הכל" : SOURCE_LABEL[sourceFilter as CashflowRow["source"]],
      });
    } catch (e) {
      toast.error("ייצוא לאקסל נכשל", { description: (e as Error).message });
    }
  };


  return (
    <AdminLayout title="דוח תזרים">
      <PageTitle title="דוח תזרים" />
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">דוח תזרים</h1>
          <p className="text-sm text-muted-foreground mt-1">
            נתוני אמת מתוך המסמכים באייקאונט — ללא תחזיות. כל תנועה משויכת לחודש לפי תאריך הפרעון בפועל
            (שיק לפי תאריך השיק, אשראי לפי יום הזיכוי מחברת האשראי בחודש שאחרי העסקה, ובתשלומים — מפוצל לחודשי החיוב).
          </p>
        </div>

        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-4">
              <div className="space-y-2">
                <Label>מתאריך</Label>
                <DateInput value={startDate} onChange={setStartDate} />
              </div>
              <div className="space-y-2">
                <Label>עד תאריך</Label>
                <DateInput value={endDate} onChange={setEndDate} />
              </div>
              <div className="space-y-2">
                <Label>סוג</Label>
                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    <SelectItem value="students">תלמידים</SelectItem>
                    <SelectItem value="school_music">בית ספר מנגן</SelectItem>
                    <SelectItem value="external">אחר / חיצוני</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>יום זיכוי אשראי (בחודש שאחרי)</Label>
                <Select value={creditDay} onValueChange={setCreditDay}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
                      <SelectItem key={d} value={d}>{d} לחודש</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                className="h-12 rounded-xl flex-1 sm:flex-none"
                onClick={() => runReport.mutate()}
                disabled={runReport.isPending || !startDate || !endDate}
              >
                {runReport.isPending ? (
                  <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> מפיק דוח, אנא המתן…</>
                ) : (
                  <><Search className="h-4 w-4 ml-2" /> הפק דוח</>
                )}
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-xl"
                onClick={exportXlsx}
                disabled={!filtered.length}
              >
                <FileSpreadsheet className="h-4 w-4 ml-2" /> ייצוא לאקסל
              </Button>
            </div>
          </CardContent>
        </Card>

        {runReport.isPending && (
          <div className="flex items-center justify-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            מושך מסמכים מאייקאונט ומחשב תזרים…
          </div>
        )}

        {runReport.isError && !runReport.isPending && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-4 flex gap-3 items-start">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
              <div className="text-sm">
                <div className="font-semibold text-destructive">הפקת הדוח נכשלה — הנתונים אינם מלאים</div>
                <div className="text-muted-foreground mt-1">{(runReport.error as Error)?.message}</div>
              </div>
            </CardContent>
          </Card>
        )}

        {rows && !runReport.isPending && (
          warnings.length ? (
            <Card className="border-amber-500/50 bg-amber-500/5">
              <CardContent className="py-4 flex gap-3 items-start">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <div className="font-semibold text-amber-700">שימו לב — הדוח הופק באופן חלקי</div>
                  <ul className="text-muted-foreground mt-1 space-y-1 list-disc pr-4">
                    {warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-emerald-500/50 bg-emerald-500/5">
              <CardContent className="py-4 flex gap-3 items-start">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                <div className="text-sm">
                  <span className="font-semibold text-emerald-700">הדוח הופק בהצלחה</span>
                  <span className="text-muted-foreground"> — כל המסמכים נמשכו מאייקאונט במלואם ({rows.length} תנועות בטווח).</span>
                </div>
              </CardContent>
            </Card>
          )
        )}

        {recon && !runReport.isPending && (() => {
          const diff = Math.round((recon.icount_total - recon.system_total) * 100) / 100;
          const clean = Math.abs(diff) < 0.5 && !recon.missing_in_system.length &&
            !recon.missing_in_icount.length && !recon.amount_mismatches.length;
          return (
            <Card className={clean ? "border-emerald-500/50" : "border-amber-500/50"}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {clean
                    ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                  התאמה לדוח התשלומים במערכת
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">סה"כ באייקאונט (מסמכים מזוהים)</div>
                    <div className="text-lg font-semibold">{ILS(recon.icount_total)}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">סה"כ במערכת</div>
                    <div className="text-lg font-semibold">{ILS(recon.system_total)}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">פער</div>
                    <div className={`text-lg font-semibold ${Math.abs(diff) >= 0.5 ? "text-destructive" : "text-emerald-600"}`}>{ILS(diff)}</div>
                  </div>
                  <div className="rounded-xl border p-3">
                    <div className="text-xs text-muted-foreground">מסמכים חיצוניים (לא מזוהים)</div>
                    <div className="text-lg font-semibold text-muted-foreground">{ILS(recon.external_total ?? 0)}</div>
                  </div>
                </div>



                {clean ? (
                  <p className="text-sm text-muted-foreground">כל המסמכים באייקאונט תואמים לתשלומים במערכת.</p>
                ) : (
                  <div className="space-y-3 text-sm">
                    {recon.missing_in_system.length > 0 && (
                      <div>
                        <div className="font-medium text-amber-700">מסמכים באייקאונט שאין להם תשלום במערכת ({recon.missing_in_system.length})</div>
                        <ul className="mt-1 space-y-1 text-muted-foreground list-disc pr-4">
                          {recon.missing_in_system.slice(0, 20).map((d) => (
                            <li key={d.doc_number}>מסמך {d.doc_number} · {d.client_name || "—"} · {ILS(d.amount)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {recon.missing_in_icount.length > 0 && (
                      <div>
                        <div className="font-medium text-amber-700">תשלומים במערכת שלא נמצאו באייקאונט ({recon.missing_in_icount.length})</div>
                        <ul className="mt-1 space-y-1 text-muted-foreground list-disc pr-4">
                          {recon.missing_in_icount.slice(0, 20).map((d) => (
                            <li key={d.doc_number}>מסמך {d.doc_number} · {ILS(d.amount)} · {d.source === "students" ? "תלמידים" : "בית ספר מנגן"}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {recon.amount_mismatches.length > 0 && (
                      <div>
                        <div className="font-medium text-destructive">פערי סכומים ({recon.amount_mismatches.length})</div>
                        <ul className="mt-1 space-y-1 text-muted-foreground list-disc pr-4">
                          {recon.amount_mismatches.slice(0, 20).map((d) => (
                            <li key={d.doc_number}>מסמך {d.doc_number} · {d.client_name || "—"} · אייקאונט {ILS(d.icount_amount)} מול מערכת {ILS(d.system_amount)}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  ההשוואה מתבצעת ברמת מסמך על כל המסמכים שנסרקו (לא רק בטווח התאריכים המוצג), ומתעלמת ממסמכי הטסט הישנים.
                </p>
              </CardContent>
            </Card>
          );
        })()}


        {rows && !runReport.isPending && (
          filtered.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">לא נמצאו תנועות בטווח שנבחר</CardContent></Card>
          ) : (
            <>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">סיכום חודשי</CardTitle>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="p-3 text-right font-medium">חודש</th>
                        <th className="p-3 text-right font-medium">מזומן</th>
                        <th className="p-3 text-right font-medium">שיקים</th>
                        <th className="p-3 text-right font-medium">אשראי</th>
                        <th className="p-3 text-right font-medium">העברה</th>
                        <th className="p-3 text-right font-medium">אחר</th>
                        <th className="p-3 text-right font-medium">תנועות</th>
                        <th className="p-3 text-right font-semibold">סה"כ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((m) => (
                        <tr key={m.month} className="border-t">
                          <td className="p-3 font-medium">{monthLabel(m.month)}</td>
                          <td className="p-3">{m.byMethod.cash ? ILS(m.byMethod.cash) : "—"}</td>
                          <td className="p-3">{m.byMethod.cheque ? ILS(m.byMethod.cheque) : "—"}</td>
                          <td className="p-3">{m.byMethod.credit ? ILS(m.byMethod.credit) : "—"}</td>
                          <td className="p-3">{m.byMethod.transfer ? ILS(m.byMethod.transfer) : "—"}</td>
                          <td className="p-3">{m.byMethod.other ? ILS(m.byMethod.other) : "—"}</td>
                          <td className="p-3 text-muted-foreground">{m.count}</td>
                          <td className={`p-3 font-semibold ${m.total < 0 ? "text-destructive" : ""}`}>{ILS(m.total)}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-muted/40 font-semibold">
                        <td className="p-3">סה"כ</td>
                        <td className="p-3">{ILS(grand.cash)}</td>
                        <td className="p-3">{ILS(grand.cheque)}</td>
                        <td className="p-3">{ILS(grand.credit)}</td>
                        <td className="p-3">{ILS(grand.transfer)}</td>
                        <td className="p-3">{ILS(grand.other)}</td>
                        <td className="p-3">{filtered.length}</td>
                        <td className="p-3">{ILS(grand.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <div className="space-y-3">
                {months.map((m) => {
                  const open = !!openMonths[m.month];
                  return (
                    <Card key={m.month}>
                      <button
                        type="button"
                        className="w-full flex items-center justify-between gap-3 p-4 text-right"
                        onClick={() => setOpenMonths((s) => ({ ...s, [m.month]: !s[m.month] }))}
                      >
                        <div className="flex items-center gap-3">
                          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                          <span className="font-semibold">{monthLabel(m.month)}</span>
                          <Badge variant="secondary">{m.count} תנועות</Badge>
                        </div>
                        <span className={`font-semibold ${m.total < 0 ? "text-destructive" : ""}`}>{ILS(m.total)}</span>
                      </button>
                      {open && (
                        <CardContent className="p-0 overflow-x-auto border-t">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50 text-muted-foreground">
                              <tr>
                                <th className="p-3 text-right font-medium">תאריך פרעון</th>
                                <th className="p-3 text-right font-medium">סוג תנועה</th>
                                <th className="p-3 text-right font-medium">אסמכתא</th>
                                <th className="p-3 text-right font-medium">לקוח / ספק</th>
                                <th className="p-3 text-right font-medium">סוג פעולה</th>
                                <th className="p-3 text-right font-medium">סכום</th>
                                <th className="p-3 text-right font-medium">הערות</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.rows.map((r, i) => (
                                <tr key={`${r.doc_id}-${i}`} className="border-t">
                                  <td className="p-3 whitespace-nowrap">{formatDate(r.due_date)}</td>
                                  <td className={`p-3 ${r.amount < 0 ? "text-destructive" : "text-emerald-600"}`}>
                                    {r.amount < 0 ? "חובה" : "זכות"}
                                  </td>
                                  <td className="p-3 whitespace-nowrap">
                                    {r.doc_url ? (
                                      <a href={r.doc_url} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                                        קבלה {r.doc_number} <ExternalLink className="h-3 w-3" />
                                      </a>
                                    ) : `קבלה ${r.doc_number}`}
                                  </td>
                                  <td className="p-3">
                                    {r.client_name}
                                    {r.source === "external" ? (
                                      <span className="block mt-1">
                                        <Badge variant="outline" className="border-amber-500/60 text-amber-700 text-[11px]">
                                          לא מזוהה במערכת
                                        </Badge>
                                      </span>
                                    ) : (
                                      <span className="block text-xs text-muted-foreground">{SOURCE_LABEL[r.source]}</span>
                                    )}
                                  </td>

                                  <td className="p-3 whitespace-nowrap">{METHOD_LABEL[r.method]}</td>
                                  <td className={`p-3 whitespace-nowrap font-medium ${r.amount < 0 ? "text-destructive" : ""}`}>{ILS(r.amount)}</td>
                                  <td className="p-3 text-muted-foreground">{r.note}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            </>
          )
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminCashflow;
