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
import * as XLSX from "xlsx";


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

// ברירת מחדל: שנת הלימודים 1.9.2026 – 31.8.2027
const DEFAULT_START = "2026-09-01";
const DEFAULT_END = "2027-08-31";

const AdminCashflow = () => {
  const [startDate, setStartDate] = useState(DEFAULT_START);
  const [endDate, setEndDate] = useState(DEFAULT_END);
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [creditDay, setCreditDay] = useState("2");
  const [rows, setRows] = useState<CashflowRow[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({});

  const runReport = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("icount-cashflow", {
        body: { startDate, endDate, creditSettlementDay: Number(creditDay) },
      });
      if (error) throw new Error(error.message || "שגיאה בהפקת הדוח");
      if ((data as any)?.error) throw new Error((data as any).error);
      return data as { rows: CashflowRow[]; docs_scanned: number; warnings?: string[] };
    },
    onSuccess: (data) => {
      setRows(data.rows);
      setWarnings(data.warnings ?? []);
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

  const exportXlsx = () => {
    if (!filtered.length) return;
    const summary = months.map((m) => ({
      "חודש": monthLabel(m.month),
      "מזומן": m.byMethod.cash,
      "שיקים": m.byMethod.cheque,
      "אשראי": m.byMethod.credit,
      "העברה בנקאית": m.byMethod.transfer,
      "אחר": m.byMethod.other,
      'סה"כ': m.total,
      "תנועות": m.count,
    }));
    const detail = filtered.map((r) => ({
      "תאריך פרעון": formatDate(r.due_date),
      "חודש": monthLabel(r.month),
      "סוג תנועה": r.amount < 0 ? "חובה" : "זכות",
      "אסמכתא": `קבלה ${r.doc_number}`,
      "לקוח": r.client_name,
      "סוג פעולה": METHOD_LABEL[r.method],
      "סכום": r.amount,
      "מקור": SOURCE_LABEL[r.source],
      "תאריך מסמך": formatDate(r.doc_date),
      "הערות": r.note,
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), "סיכום חודשי");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detail), "פירוט תנועות");
    XLSX.writeFile(wb, `cashflow-${startDate}-${endDate}.xlsx`);
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
                                    <span className="block text-xs text-muted-foreground">{SOURCE_LABEL[r.source]}</span>
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
