import { useState, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { GRADES } from "@/lib/constants";

const VALID_GRADES = GRADES as readonly string[];

interface RowParsed {
  row: number;
  national_id?: string;
  first_name?: string;
  last_name?: string;
  grade?: string;
  studentId?: string;
  matchedBy?: "id" | "name";
  currentGrade?: string | null;
  status: "ok" | "no-match" | "ambiguous" | "invalid-grade" | "missing-grade" | "missing-key" | "no-change";
  errorMsg?: string;
}

function stripGeresh(s: string) {
  return (s ?? "").replace(/['"׳״']/g, "").trim();
}

function normalizeGrade(input: string | undefined): string | null {
  if (!input) return null;
  const stripped = stripGeresh(input);
  // Match against GRADES (which are stored without geresh)
  const match = VALID_GRADES.find((g) => stripGeresh(g) === stripped);
  return match ?? null;
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ["national_id", "first_name", "last_name", "grade"],
    ["123456789", "יוסי", "כהן", "ד"],
    ["", "שרה", "לוי", "ז"],
  ]);
  ws["!cols"] = [{ wch: 16 }, { wch: 18 }, { wch: 18 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "כיתות");
  XLSX.writeFile(wb, "תבנית_עדכון_כיתות.xlsx");
}

const AdminGradeImport = () => {
  const queryClient = useQueryClient();
  const [parsed, setParsed] = useState<RowParsed[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [result, setResult] = useState<{ updated: number; skipped: number; failed: number } | null>(null);

  const reset = useCallback(() => {
    setParsed(null);
    setDone(false);
    setResult(null);
  }, []);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });

    const { data: students } = await supabase
      .from("students")
      .select("id, first_name, last_name, national_id, grade");

    const allStudents = students ?? [];
    const byId = new Map<string, any>();
    allStudents.forEach((s: any) => {
      if (s.national_id) byId.set(String(s.national_id).trim(), s);
    });

    // For name-matching: group by normalized name
    const byName = new Map<string, any[]>();
    allStudents.forEach((s: any) => {
      const key = `${(s.first_name ?? "").trim()}|${(s.last_name ?? "").trim()}`.toLowerCase();
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key)!.push(s);
    });

    const out: RowParsed[] = rows.map((row, i) => {
      const national_id = String(row.national_id ?? row["ת.ז."] ?? row["ת״ז"] ?? "").trim() || undefined;
      const first_name = String(row.first_name ?? row["שם פרטי"] ?? "").trim() || undefined;
      const last_name = String(row.last_name ?? row["שם משפחה"] ?? "").trim() || undefined;
      const gradeRaw = String(row.grade ?? row["כיתה"] ?? "").trim() || undefined;

      const base: RowParsed = {
        row: i + 2,
        national_id,
        first_name,
        last_name,
        grade: gradeRaw,
        status: "ok",
      };

      if (!gradeRaw) {
        return { ...base, status: "missing-grade", errorMsg: "כיתה חסרה" };
      }
      const normalizedGrade = normalizeGrade(gradeRaw);
      if (!normalizedGrade) {
        return { ...base, status: "invalid-grade", errorMsg: `כיתה לא חוקית: ${gradeRaw}` };
      }
      base.grade = normalizedGrade;

      // Match: prefer national_id
      let matched: any = null;
      let matchedBy: "id" | "name" | undefined;
      if (national_id) {
        const m = byId.get(national_id);
        if (m) {
          matched = m;
          matchedBy = "id";
        }
      }
      if (!matched && first_name && last_name) {
        const key = `${first_name}|${last_name}`.toLowerCase();
        const list = byName.get(key) ?? [];
        if (list.length === 1) {
          matched = list[0];
          matchedBy = "name";
        } else if (list.length > 1) {
          return { ...base, status: "ambiguous", errorMsg: `נמצאו ${list.length} תלמידים בשם זה` };
        }
      }

      if (!matched) {
        if (!national_id && (!first_name || !last_name)) {
          return { ...base, status: "missing-key", errorMsg: "חסרים פרטי זיהוי (ת.ז. או שם מלא)" };
        }
        return { ...base, status: "no-match", errorMsg: "לא נמצא תלמיד מתאים" };
      }

      if (stripGeresh(matched.grade ?? "") === stripGeresh(normalizedGrade)) {
        return {
          ...base,
          studentId: matched.id,
          matchedBy,
          currentGrade: matched.grade,
          status: "no-change",
        };
      }

      return {
        ...base,
        studentId: matched.id,
        matchedBy,
        currentGrade: matched.grade,
        status: "ok",
      };
    });

    setParsed(out);
    e.target.value = "";
  };

  const counts = useMemo(() => {
    if (!parsed) return null;
    return {
      total: parsed.length,
      toUpdate: parsed.filter((r) => r.status === "ok").length,
      noChange: parsed.filter((r) => r.status === "no-change").length,
      errors: parsed.filter((r) => !["ok", "no-change"].includes(r.status)).length,
    };
  }, [parsed]);

  const handleImport = async () => {
    if (!parsed) return;
    setImporting(true);
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of parsed) {
      if (row.status === "no-change") {
        skipped++;
        continue;
      }
      if (row.status !== "ok" || !row.studentId || !row.grade) {
        failed++;
        continue;
      }
      const { error } = await supabase
        .from("students")
        .update({ grade: row.grade })
        .eq("id", row.studentId);
      if (error) failed++;
      else updated++;
    }

    setImporting(false);
    setDone(true);
    setResult({ updated, skipped, failed });
    queryClient.invalidateQueries({ queryKey: ["admin-students-enrollments"] });
    if (updated > 0) toast.success(`${updated} כיתות עודכנו`);
    if (failed > 0) toast.error(`${failed} שורות נכשלו`);
  };

  return (
    <AdminLayout title="ייבוא כיתות מאקסל" backPath="/admin/academic-years">
      <div className="max-w-3xl space-y-5">
        {done && result ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-center space-y-3">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-lg font-semibold">העדכון הושלם</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>{result.updated} כיתות עודכנו</p>
              <p>{result.skipped} ללא שינוי (כיתה זהה)</p>
              {result.failed > 0 && <p className="text-destructive">{result.failed} שורות נכשלו</p>}
            </div>
            <Button onClick={reset} className="rounded-xl h-12">קובץ נוסף</Button>
          </div>
        ) : !parsed ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-muted/40 p-5 space-y-2 text-sm">
              <p className="font-semibold text-base">איך זה עובד?</p>
              <ul className="list-disc pr-5 space-y-1 text-muted-foreground">
                <li>מעדכן <b>רק את הכיתה בכרטיס התלמיד</b> (לא משנה שיוכים)</li>
                <li>זיהוי לפי ת.ז. (עדיף) או לפי שם מלא (פרטי + משפחה)</li>
                <li>עמודות בקובץ: <code>national_id</code>, <code>first_name</code>, <code>last_name</code>, <code>grade</code></li>
                <li>ערכי כיתה: א, ב, ג, ד, ה, ו, ז, ח, ט, י, יא, יב, בוגר (עם או בלי גרש)</li>
              </ul>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button variant="outline" className="h-12 rounded-xl text-base" onClick={downloadTemplate}>
                <Download className="h-4 w-4" /> הורד תבנית
              </Button>
              <label className="inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground text-base font-medium cursor-pointer px-4 hover:bg-primary/90 transition">
                <Upload className="h-4 w-4" /> העלה קובץ
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
              </label>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <p className="font-semibold">סיכום קובץ</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="rounded-lg">סה״כ: {counts?.total}</Badge>
                <Badge className="rounded-lg bg-green-500/10 text-green-700 border-green-500/30">לעדכון: {counts?.toUpdate}</Badge>
                <Badge variant="outline" className="rounded-lg">ללא שינוי: {counts?.noChange}</Badge>
                {counts && counts.errors > 0 && (
                  <Badge variant="outline" className="rounded-lg bg-destructive/10 text-destructive border-destructive/30">
                    בעיות: {counts.errors}
                  </Badge>
                )}
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="max-h-[55vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-right p-2 font-medium">שורה</th>
                      <th className="text-right p-2 font-medium">ת.ז.</th>
                      <th className="text-right p-2 font-medium">שם</th>
                      <th className="text-right p-2 font-medium">כיתה נוכחית</th>
                      <th className="text-right p-2 font-medium">כיתה חדשה</th>
                      <th className="text-right p-2 font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((r) => (
                      <tr key={r.row} className="border-t border-border">
                        <td className="p-2 text-muted-foreground">{r.row}</td>
                        <td className="p-2">{r.national_id ?? "—"}</td>
                        <td className="p-2">{[r.first_name, r.last_name].filter(Boolean).join(" ") || "—"}</td>
                        <td className="p-2 text-muted-foreground">{r.currentGrade ?? "—"}</td>
                        <td className="p-2 font-medium">{r.grade ?? "—"}</td>
                        <td className="p-2">
                          {r.status === "ok" && (
                            <Badge className="rounded-lg bg-green-500/10 text-green-700 border-green-500/30">
                              {r.matchedBy === "name" ? "תואם לפי שם" : "מוכן"}
                            </Badge>
                          )}
                          {r.status === "no-change" && (
                            <Badge variant="outline" className="rounded-lg">ללא שינוי</Badge>
                          )}
                          {!["ok", "no-change"].includes(r.status) && (
                            <span className="inline-flex items-center gap-1 text-destructive text-xs">
                              <AlertCircle className="h-3.5 w-3.5" /> {r.errorMsg}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" className="h-12 rounded-xl" onClick={reset} disabled={importing}>
                ביטול
              </Button>
              <Button
                className="h-12 rounded-xl"
                disabled={importing || !counts || counts.toUpdate === 0}
                onClick={handleImport}
              >
                {importing ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> מעדכן...</>
                ) : (
                  <>עדכן {counts?.toUpdate ?? 0} כיתות</>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminGradeImport;
