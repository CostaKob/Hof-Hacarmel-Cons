import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Car, FileSpreadsheet, Loader2 } from "lucide-react";
import { getMonthRange } from "@/hooks/useTeacherDashboardData";
import ExcelJS from "exceljs";
import { toast } from "sonner";

const MONTH_NAMES = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

const KM_RATE = 1.1;

interface Row {
  teacherId: string;
  name: string;
  days: number;
  km: number;
}

const AdminTravelReport = () => {
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [exporting, setExporting] = useState(false);

  const { from, to } = useMemo(
    () => getMonthRange(selectedYear, selectedMonth),
    [selectedYear, selectedMonth],
  );

  const { data: reports, isLoading } = useQuery({
    queryKey: ["travel-report", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, teacher_id, report_date, kilometers, teachers(first_name, last_name)")
        .gte("report_date", from)
        .lte("report_date", to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows: Row[] = useMemo(() => {
    const map = new Map<string, Row>();
    for (const r of (reports ?? []) as any[]) {
      const km = Number(r.kilometers) || 0;
      const name = `${r.teachers?.last_name ?? ""} ${r.teachers?.first_name ?? ""}`.trim() || "—";
      const existing = map.get(r.teacher_id) ?? { teacherId: r.teacher_id, name, days: 0, km: 0 };
      existing.days += 1;
      existing.km += km;
      map.set(r.teacher_id, existing);
    }
    return Array.from(map.values())
      .filter((r) => r.km > 0)
      .sort((a, b) => b.km - a.km);
  }, [reports]);

  const totalKm = rows.reduce((s, r) => s + r.km, 0);
  const totalCost = Math.round(totalKm * KM_RATE * 100) / 100;

  const yearOptions = useMemo(() => {
    const y = now.getFullYear();
    return [y + 1, y, y - 1, y - 2];
  }, []);

  const handleExport = async () => {
    if (rows.length === 0) {
      toast.error("אין נתונים לייצוא");
      return;
    }
    setExporting(true);
    try {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("נסיעות");
      ws.views = [{ rightToLeft: true }];
      ws.columns = [
        { header: "מורה", key: "name", width: 28 },
        { header: "ימי דיווח", key: "days", width: 14 },
        { header: 'סה"כ ק״מ', key: "km", width: 14 },
        { header: "החזר נסיעות (₪)", key: "cost", width: 18 },
      ];
      ws.getRow(1).font = { bold: true };
      rows.forEach((r) =>
        ws.addRow({
          name: r.name,
          days: r.days,
          km: r.km,
          cost: Math.round(r.km * KM_RATE * 100) / 100,
        }),
      );
      const totalRow = ws.addRow({ name: 'סה"כ', days: rows.reduce((s, r) => s + r.days, 0), km: totalKm, cost: totalCost });
      totalRow.font = { bold: true };

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `דוח-נסיעות-${MONTH_NAMES[selectedMonth]}-${selectedYear}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message ?? "שגיאה בייצוא");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminLayout title="דוח נסיעות מורים" backPath="/admin/exports">
      <PageTitle title="דוח נסיעות מורים" />
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">חודש</Label>
            <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(Number(v))}>
              <SelectTrigger className="h-11 w-[140px] rounded-xl bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTH_NAMES.map((m, i) => (
                  <SelectItem key={m} value={String(i)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">שנה</Label>
            <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
              <SelectTrigger className="h-11 w-[110px] rounded-xl bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="h-11 rounded-xl gap-2" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
            ייצוא לאקסל
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">מורים מדווחים</p>
            <p className="text-2xl font-bold text-foreground">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">סה״כ ק״מ</p>
            <p className="text-2xl font-bold text-primary">{totalKm.toLocaleString()}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
            <p className="text-xs text-muted-foreground">החזר משוער (₪{KM_RATE} לק״מ)</p>
            <p className="text-2xl font-bold text-foreground">₪{totalCost.toLocaleString()}</p>
          </div>
        </div>

        {isLoading ? (
          <p className="py-8 text-center text-muted-foreground">טוען...</p>
        ) : rows.length === 0 ? (
          <div className="space-y-3 py-12 text-center">
            <Car className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">אין נסיעות מדווחות בחודש זה</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 border-b border-border px-4 py-3 text-xs font-semibold text-muted-foreground">
              <span>מורה</span>
              <span className="w-16 text-center">ימים</span>
              <span className="w-20 text-center">ק״מ</span>
              <span className="w-24 text-center">החזר</span>
            </div>
            {rows.map((r) => (
              <div key={r.teacherId} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-0">
                <span className="truncate font-medium text-foreground">{r.name}</span>
                <span className="w-16 text-center text-muted-foreground">{r.days}</span>
                <span className="w-20 text-center font-semibold text-foreground">{r.km.toLocaleString()}</span>
                <span className="w-24 text-center text-muted-foreground">
                  ₪{(Math.round(r.km * KM_RATE * 100) / 100).toLocaleString()}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 bg-muted/50 px-4 py-3 text-sm font-bold">
              <span>סה״כ</span>
              <span className="w-16 text-center">{rows.reduce((s, r) => s + r.days, 0)}</span>
              <span className="w-20 text-center">{totalKm.toLocaleString()}</span>
              <span className="w-24 text-center">₪{totalCost.toLocaleString()}</span>
            </div>
          </div>
        )}

        <Badge variant="secondary" className="rounded-xl">
          {MONTH_NAMES[selectedMonth]} {selectedYear}
        </Badge>
      </div>
    </AdminLayout>
  );
};

export default AdminTravelReport;
