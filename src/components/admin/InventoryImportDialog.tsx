import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  CONDITION_LABEL_TO_VALUE, CONDITION_LABELS, INSTRUMENT_SIZES,
  normalizeSize, InstrumentCondition,
} from "@/lib/instrumentInventory";

interface RowData {
  instrument_name: string;
  serial_number: string;
  brand?: string;
  model?: string;
  size?: string | null;
  condition: InstrumentCondition;
  storage_location_name?: string | null;
  purchase_date?: string | null;
  notes?: string | null;
}

interface ParsedRow {
  row: number;
  raw: any;
  data?: RowData;
  errors: string[];
  duplicate?: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TEMPLATE_COLUMNS = [
  "instrument_name",
  "serial_number",
  "brand",
  "model",
  "size",
  "condition",
  "storage_location",
  "purchase_date",
  "notes",
];

const COLUMN_LABELS: Record<string, string> = {
  instrument_name: "סוג כלי (חובה)",
  serial_number: "מספר סידורי (חובה)",
  brand: "יצרן",
  model: "דגם",
  size: "גודל",
  condition: "מצב",
  storage_location: "מיקום אחסון",
  purchase_date: "תאריך רכישה",
  notes: "הערות",
};

// Hebrew header aliases
const HEADER_ALIASES: Record<string, string> = {
  "סוג כלי": "instrument_name",
  "סוג": "instrument_name",
  "כלי": "instrument_name",
  "מספר סידורי": "serial_number",
  "סידורי": "serial_number",
  "יצרן": "brand",
  "דגם": "model",
  "גודל": "size",
  "מצב": "condition",
  "מיקום": "storage_location",
  "מיקום אחסון": "storage_location",
  "תאריך רכישה": "purchase_date",
  "הערות": "notes",
};

const normalizeHeader = (h: string): string => {
  const t = String(h || "").trim();
  return HEADER_ALIASES[t] || t;
};

const InventoryImportDialog = ({ open, onOpenChange }: Props) => {
  const qc = useQueryClient();
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [importDone, setImportDone] = useState<{ created: number; skipped: number } | null>(null);

  const downloadTemplate = () => {
    const headers = TEMPLATE_COLUMNS.map((c) => COLUMN_LABELS[c]);
    const example = [
      ["כינור", "V-001", "Yamaha", "V3", "1/2", "זמין", "מחסן ראשי", "2024-09-01", ""],
      ["צ'לו", "C-001", "", "", "3/4", "דרוש תיקון", "מחסן ראשי", "", "סדק קל"],
      ["חצוצרה", "T-100", "Bach", "TR300", "", "מושאל", "", "", ""],
    ];
    const ws = XLSX.utils.aoa_to_sheet([headers, ...example]);
    // RTL friendly column widths
    ws["!cols"] = TEMPLATE_COLUMNS.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "כלים");

    // Instructions sheet
    const instructions = [
      ["הוראות מילוי תבנית מלאי כלי נגינה"],
      [""],
      ["שדות חובה: סוג כלי, מספר סידורי"],
      ["מצב כלי (אם ריק - יוגדר 'זמין'): " + Object.keys(CONDITION_LABEL_TO_VALUE).filter(k => /^[א-ת]/.test(k)).join(" / ")],
      ["גדלים מותרים: " + INSTRUMENT_SIZES.join(", ") + " (גם 'שמינית', 'רבע', 'חצי', 'שלושת רבעי', 'שלם' מתקבלים)"],
      ["סוג כלי: חייב להתאים בדיוק לשם בטבלת כלי נגינה במערכת"],
      ["מיקום אחסון: חייב להתאים לשם מיקום אחסון פעיל במערכת (אופציונלי)"],
      ["תאריך רכישה: בפורמט YYYY-MM-DD (אופציונלי)"],
      ["מספר סידורי כפול עבור אותו סוג כלי - יידחה"],
    ];
    const wsI = XLSX.utils.aoa_to_sheet(instructions);
    wsI["!cols"] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsI, "הוראות");

    XLSX.writeFile(wb, "תבנית_מלאי_כלים.xlsx");
  };

  const reset = () => {
    setParsedRows([]);
    setFileName("");
    setImportDone(null);
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    setImportDone(null);
    setFileName(file.name);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "", raw: false });

      // Load lookup data
      const [instrRes, locRes, existRes] = await Promise.all([
        supabase.from("instruments").select("id, name"),
        supabase.from("instrument_storage_locations").select("id, name"),
        supabase.from("inventory_instruments").select("instrument_id, serial_number"),
      ]);

      const instrMap = new Map<string, string>();
      (instrRes.data || []).forEach((i: any) => instrMap.set(i.name.trim().toLowerCase(), i.id));
      const locMap = new Map<string, string>();
      (locRes.data || []).forEach((l: any) => locMap.set(l.name.trim().toLowerCase(), l.id));
      const existSet = new Set<string>();
      (existRes.data || []).forEach((e: any) => existSet.add(`${e.instrument_id}|${(e.serial_number || "").trim().toLowerCase()}`));

      const parsed: ParsedRow[] = [];
      const seenInBatch = new Set<string>();

      rows.forEach((rowRaw, idx) => {
        // Normalize headers
        const row: any = {};
        Object.keys(rowRaw).forEach((k) => {
          row[normalizeHeader(k)] = rowRaw[k];
        });

        const errors: string[] = [];
        const instrumentName = String(row.instrument_name || "").trim();
        const serial = String(row.serial_number || "").trim();
        const conditionRaw = String(row.condition || "").trim();
        const sizeRaw = String(row.size || "").trim();
        const locName = String(row.storage_location || "").trim();
        const purchaseDateRaw = String(row.purchase_date || "").trim();

        if (!instrumentName) errors.push("חסר סוג כלי");
        if (!serial) errors.push("חסר מספר סידורי");

        const instrumentId = instrumentName ? instrMap.get(instrumentName.toLowerCase()) : undefined;
        if (instrumentName && !instrumentId) errors.push(`סוג הכלי "${instrumentName}" לא קיים במערכת`);

        let conditionValue: InstrumentCondition = "available";
        if (conditionRaw) {
          const v = CONDITION_LABEL_TO_VALUE[conditionRaw];
          if (!v) errors.push(`מצב לא תקין: "${conditionRaw}"`);
          else conditionValue = v;
        }

        let storageLocationId: string | null = null;
        if (locName) {
          const lid = locMap.get(locName.toLowerCase());
          if (!lid) errors.push(`מיקום אחסון "${locName}" לא קיים במערכת`);
          else storageLocationId = lid;
        }

        let purchaseDate: string | null = null;
        if (purchaseDateRaw) {
          const d = new Date(purchaseDateRaw);
          if (!isNaN(d.getTime())) purchaseDate = d.toISOString().split("T")[0];
          else errors.push(`תאריך רכישה לא תקין: "${purchaseDateRaw}"`);
        }

        const sizeNorm = normalizeSize(sizeRaw);

        let duplicate = false;
        if (instrumentId && serial) {
          const key = `${instrumentId}|${serial.toLowerCase()}`;
          if (existSet.has(key)) {
            errors.push("מספר סידורי כבר קיים במערכת עבור סוג כלי זה");
            duplicate = true;
          } else if (seenInBatch.has(key)) {
            errors.push("שורה זו מופיעה כפול בקובץ");
            duplicate = true;
          } else {
            seenInBatch.add(key);
          }
        }

        const data: RowData | undefined = errors.length === 0 ? {
          instrument_name: instrumentName,
          serial_number: serial,
          brand: String(row.brand || "").trim() || undefined,
          model: String(row.model || "").trim() || undefined,
          size: sizeNorm,
          condition: conditionValue,
          storage_location_name: locName || null,
          purchase_date: purchaseDate,
          notes: String(row.notes || "").trim() || null,
        } : undefined;

        parsed.push({
          row: idx + 2, // +1 for 1-index, +1 for header row
          raw: row,
          data,
          errors,
          duplicate,
        });
      });

      setParsedRows(parsed);
    } catch (e: any) {
      toast.error("שגיאה בקריאת הקובץ: " + (e.message || ""));
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    const valid = parsedRows.filter((r) => r.data && r.errors.length === 0);
    if (valid.length === 0) return;
    setImporting(true);
    try {
      // Re-fetch lookup maps
      const [instrRes, locRes] = await Promise.all([
        supabase.from("instruments").select("id, name"),
        supabase.from("instrument_storage_locations").select("id, name"),
      ]);
      const instrMap = new Map<string, string>();
      (instrRes.data || []).forEach((i: any) => instrMap.set(i.name.trim().toLowerCase(), i.id));
      const locMap = new Map<string, string>();
      (locRes.data || []).forEach((l: any) => locMap.set(l.name.trim().toLowerCase(), l.id));

      const payloads = valid.map((r) => ({
        instrument_id: instrMap.get(r.data!.instrument_name.toLowerCase())!,
        serial_number: r.data!.serial_number,
        brand: r.data!.brand || null,
        model: r.data!.model || null,
        size: r.data!.size || null,
        condition: r.data!.condition,
        storage_location_id: r.data!.storage_location_name
          ? locMap.get(r.data!.storage_location_name.toLowerCase()) || null
          : null,
        purchase_date: r.data!.purchase_date || null,
        notes: r.data!.notes,
      }));

      const { error } = await supabase.from("inventory_instruments").insert(payloads);
      if (error) throw error;

      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      setImportDone({ created: valid.length, skipped: parsedRows.length - valid.length });
      toast.success(`יובאו ${valid.length} כלים`);
    } catch (e: any) {
      toast.error("שגיאה בייבוא: " + (e.message || ""));
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRows.filter((r) => r.errors.length === 0).length;
  const errorCount = parsedRows.length - validCount;

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>ייבוא מאגר כלי נגינה מאקסל</DialogTitle>
          <DialogDescription>
            העלה קובץ Excel עם רשימת הכלים. הורד תבנית כדי לראות את הפורמט הנדרש.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={downloadTemplate} className="h-12 rounded-xl">
              <Download className="h-4 w-4" /> הורד תבנית
            </Button>
            <label className="flex-1">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
              <Button asChild className="h-12 rounded-xl w-full cursor-pointer">
                <span>
                  <Upload className="h-4 w-4" /> {fileName ? "החלף קובץ" : "בחר קובץ"}
                </span>
              </Button>
            </label>
          </div>

          {parsing && (
            <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> מעבד...
            </div>
          )}

          {fileName && !parsing && (
            <div className="rounded-xl border border-border bg-card p-3 flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium flex-1 truncate">{fileName}</span>
              <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                <CheckCircle2 className="h-3 w-3 ml-1" /> {validCount} תקין
              </Badge>
              {errorCount > 0 && (
                <Badge variant="outline" className="bg-destructive/10 text-destructive border-destructive/20">
                  <AlertCircle className="h-3 w-3 ml-1" /> {errorCount} שגיאות
                </Badge>
              )}
            </div>
          )}

          {importDone && (
            <div className="rounded-xl border border-green-300 bg-green-50 p-4 text-center">
              <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto mb-2" />
              <p className="font-semibold text-green-900">
                יובאו {importDone.created} כלים בהצלחה
              </p>
              {importDone.skipped > 0 && (
                <p className="text-sm text-green-800 mt-1">{importDone.skipped} שורות דולגו עקב שגיאות</p>
              )}
            </div>
          )}

          {parsedRows.length > 0 && !importDone && (
            <div className="space-y-1 max-h-80 overflow-y-auto border rounded-xl p-2">
              {parsedRows.map((r) => (
                <div
                  key={r.row}
                  className={`text-xs p-2 rounded-lg ${
                    r.errors.length === 0
                      ? "bg-green-50 border border-green-200"
                      : "bg-destructive/5 border border-destructive/20"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span className="font-mono text-muted-foreground shrink-0">שורה {r.row}</span>
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">
                        {r.raw.instrument_name || "—"} #{r.raw.serial_number || "—"}
                        {r.raw.size && ` (${r.raw.size})`}
                      </span>
                      {r.errors.length > 0 && (
                        <ul className="text-destructive mt-1 space-y-0.5">
                          {r.errors.map((e, i) => <li key={i}>• {e}</li>)}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 sticky bottom-0 bg-background pt-2">
            {!importDone ? (
              <>
                <Button
                  onClick={handleImport}
                  disabled={validCount === 0 || importing}
                  className="h-12 rounded-xl flex-1"
                >
                  {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> מייבא...</> : `ייבוא ${validCount} כלים`}
                </Button>
                <Button variant="outline" onClick={() => onOpenChange(false)} className="h-12 rounded-xl">
                  ביטול
                </Button>
              </>
            ) : (
              <Button onClick={() => onOpenChange(false)} className="h-12 rounded-xl flex-1">
                סגור
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InventoryImportDialog;
