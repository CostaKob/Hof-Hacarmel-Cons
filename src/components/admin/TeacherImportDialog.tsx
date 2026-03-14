import { useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface TeacherRow {
  first_name: string;
  last_name: string;
  national_id?: string;
  birth_date?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
}

interface ParsedRow {
  row: number;
  data: TeacherRow;
  errors: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TEMPLATE_COLUMNS = [
  "first_name",
  "last_name",
  "national_id",
  "birth_date",
  "phone",
  "email",
  "address",
  "city",
];

const COLUMN_LABELS: Record<string, string> = {
  first_name: "שם פרטי",
  last_name: "שם משפחה",
  national_id: "תעודת זהות",
  birth_date: "תאריך לידה",
  phone: "טלפון",
  email: "אימייל",
  address: "כתובת",
  city: "עיר",
};

function parseDateValue(val: unknown): string | null {
  if (!val) return null;
  // Excel serial date number
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) {
      const mm = String(d.m).padStart(2, "0");
      const dd = String(d.d).padStart(2, "0");
      return `${d.y}-${mm}-${dd}`;
    }
    return null;
  }
  const s = String(val).trim();
  // DD/MM/YYYY
  const match = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_COLUMNS,
    ["יוסי", "כהן", "123456789", "01/03/1980", "0501234567", "yossi@mail.com", "הרצל 10", "חיפה"],
  ]);
  ws["!cols"] = TEMPLATE_COLUMNS.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "מורים");
  XLSX.writeFile(wb, "תבנית_ייבוא_מורים.xlsx");
}

export default function TeacherImportDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);

  const reset = useCallback(() => {
    setParsed(null);
    setImporting(false);
    setDone(false);
    setImportResult(null);
  }, []);

  const handleClose = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    // Fetch existing for duplicate check
    const { data: existingTeachers } = await supabase
      .from("teachers")
      .select("national_id, email");

    const existingNids = new Set(
      (existingTeachers ?? []).map((t) => t.national_id).filter(Boolean)
    );
    const existingEmails = new Set(
      (existingTeachers ?? []).map((t) => t.email?.toLowerCase()).filter(Boolean)
    );

    // Track within-file duplicates
    const fileNids = new Set<string>();
    const fileEmails = new Set<string>();

    const result: ParsedRow[] = rows.map((row, i) => {
      const errors: string[] = [];
      const firstName = String(row.first_name ?? "").trim();
      const lastName = String(row.last_name ?? "").trim();
      const nationalId = String(row.national_id ?? "").trim() || undefined;
      const email = String(row.email ?? "").trim().toLowerCase() || undefined;
      const phone = String(row.phone ?? "").trim() || undefined;
      const address = String(row.address ?? "").trim() || undefined;
      const city = String(row.city ?? "").trim() || undefined;
      const birthDate = parseDateValue(row.birth_date);

      if (!firstName) errors.push("שם פרטי חסר");
      if (!lastName) errors.push("שם משפחה חסר");

      if (nationalId) {
        if (existingNids.has(nationalId) || fileNids.has(nationalId)) {
          errors.push("תעודת זהות כפולה");
        }
        fileNids.add(nationalId);
      }
      if (email) {
        if (existingEmails.has(email) || fileEmails.has(email)) {
          errors.push("אימייל כפול");
        }
        fileEmails.add(email);
      }

      return {
        row: i + 2,
        data: {
          first_name: firstName,
          last_name: lastName,
          national_id: nationalId,
          birth_date: birthDate ?? undefined,
          phone,
          email: email || undefined,
          address,
          city,
        },
        errors,
      };
    });

    setParsed(result);
    // Reset file input
    e.target.value = "";
  };

  const validRows = parsed?.filter((r) => r.errors.length === 0) ?? [];
  const errorRows = parsed?.filter((r) => r.errors.length > 0) ?? [];

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    let success = 0;
    let failed = 0;

    for (const row of validRows) {
      try {
        const payload = {
          first_name: row.data.first_name,
          last_name: row.data.last_name,
          national_id: row.data.national_id || null,
          birth_date: row.data.birth_date || null,
          phone: row.data.phone || null,
          email: row.data.email || null,
          address: row.data.address || null,
          city: row.data.city || null,
          is_active: true,
        };

        const { data: inserted, error } = await supabase
          .from("teachers")
          .insert(payload)
          .select("id")
          .single();

        if (error) {
          failed++;
          continue;
        }

        // If email exists, create user account
        if (row.data.email && inserted) {
          try {
            await supabase.functions.invoke("create-teacher-user", {
              body: { email: row.data.email, teacher_id: inserted.id },
            });
          } catch {
            // Teacher created but user account failed - not critical
          }
        }

        success++;
      } catch {
        failed++;
      }
    }

    setImporting(false);
    setDone(true);
    setImportResult({ success, failed });
    queryClient.invalidateQueries({ queryKey: ["admin-teachers"] });
    if (success > 0) toast.success(`${success} מורים יובאו בהצלחה`);
    if (failed > 0) toast.error(`${failed} שורות נכשלו`);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            ייבוא מורים מאקסל
          </DialogTitle>
          <DialogDescription>
            העלה קובץ אקסל (.xlsx) עם נתוני מורים לייבוא מרוכז
          </DialogDescription>
        </DialogHeader>

        {done && importResult ? (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-lg font-semibold">הייבוא הושלם</p>
            <p className="text-muted-foreground">
              {importResult.success} מורים יובאו בהצלחה
              {importResult.failed > 0 && `, ${importResult.failed} נכשלו`}
            </p>
            <Button onClick={() => handleClose(false)} className="rounded-xl">
              סגור
            </Button>
          </div>
        ) : !parsed ? (
          <div className="space-y-4">
            {/* Instructions */}
            <div className="rounded-xl border border-border bg-muted/50 p-4 space-y-2 text-sm">
              <p className="font-semibold">הוראות:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>השורה הראשונה חייבת להכיל כותרות עמודות באנגלית</li>
                <li>שדות חובה: <strong>first_name</strong>, <strong>last_name</strong></li>
                <li>שדות אופציונליים: national_id, birth_date, phone, email, address, city</li>
                <li>תאריך לידה בפורמט DD/MM/YYYY</li>
                <li>מורים עם אימייל יקבלו חשבון כניסה אוטומטי (סיסמה: 1234)</li>
              </ul>
            </div>

            {/* Column reference */}
            <div className="flex flex-wrap gap-1.5">
              {TEMPLATE_COLUMNS.map((col) => (
                <Badge key={col} variant="outline" className="text-xs rounded-lg">
                  {col} = {COLUMN_LABELS[col]}
                </Badge>
              ))}
            </div>

            {/* Template download */}
            <Button
              variant="outline"
              className="w-full rounded-xl h-11"
              onClick={downloadTemplate}
            >
              <Download className="h-4 w-4 ml-2" />
              הורד תבנית אקסל
            </Button>

            {/* Upload area */}
            <label className="flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border p-8 cursor-pointer transition-colors hover:border-primary hover:bg-muted/30">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">לחץ כאן להעלאת קובץ אקסל</span>
              <span className="text-xs text-muted-foreground">.xlsx בלבד</span>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFile}
              />
            </label>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex gap-3">
              <div className="flex-1 rounded-xl border border-border bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{validRows.length}</p>
                <p className="text-xs text-muted-foreground">מוכנים לייבוא</p>
              </div>
              <div className="flex-1 rounded-xl border border-border bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold text-destructive">{errorRows.length}</p>
                <p className="text-xs text-muted-foreground">שורות עם שגיאות</p>
              </div>
            </div>

            {/* Error details */}
            {errorRows.length > 0 && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2 max-h-40 overflow-y-auto">
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  שגיאות
                </p>
                {errorRows.map((r) => (
                  <p key={r.row} className="text-xs text-muted-foreground">
                    שורה {r.row}: {r.errors.join(", ")}
                  </p>
                ))}
              </div>
            )}

            {/* Valid rows preview */}
            {validRows.length > 0 && (
              <div className="rounded-xl border border-border max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-right font-medium">#</th>
                      <th className="p-2 text-right font-medium">שם</th>
                      <th className="p-2 text-right font-medium">אימייל</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 20).map((r) => (
                      <tr key={r.row} className="border-t border-border">
                        <td className="p-2 text-muted-foreground">{r.row}</td>
                        <td className="p-2">{r.data.first_name} {r.data.last_name}</td>
                        <td className="p-2 text-muted-foreground">{r.data.email || "—"}</td>
                      </tr>
                    ))}
                    {validRows.length > 20 && (
                      <tr className="border-t border-border">
                        <td colSpan={3} className="p-2 text-center text-muted-foreground">
                          ועוד {validRows.length - 20} שורות...
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                className="flex-1 h-12 rounded-xl text-base"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                    מייבא...
                  </>
                ) : (
                  `ייבא ${validRows.length} מורים`
                )}
              </Button>
              <Button variant="outline" onClick={() => setParsed(null)} className="h-12 rounded-xl">
                חזרה
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
