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
import { GRADES, PLAYING_LEVELS } from "@/lib/constants";

interface StudentRowData {
  student_first_name: string;
  student_last_name: string;
  national_id?: string;
  gender?: string;
  grade?: string;
  playing_level?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  teacher_email: string;
  instrument: string;
  school: string;
  lesson_duration: number;
  lesson_type: string;
  instrument_start_date?: string;
}

interface ParsedRow {
  row: number;
  data: StudentRowData;
  errors: string[];
  existingStudentId?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TEMPLATE_COLUMNS = [
  "student_first_name",
  "student_last_name",
  "national_id",
  "gender",
  "grade",
  "playing_level",
  "parent_name",
  "parent_phone",
  "parent_email",
  "teacher_email",
  "instrument",
  "school",
  "lesson_duration",
  "lesson_type",
  "instrument_start_date",
];

const COLUMN_LABELS: Record<string, string> = {
  student_first_name: "שם פרטי (חובה)",
  student_last_name: "שם משפחה (חובה)",
  national_id: "ת.ז.",
  gender: "מין (male/female)",
  grade: "כיתה",
  playing_level: "רמת נגינה",
  parent_name: "שם הורה",
  parent_phone: "טלפון הורה",
  parent_email: "אימייל הורה",
  teacher_email: "אימייל מורה (חובה)",
  instrument: "כלי נגינה (חובה)",
  school: "בית ספר (חובה)",
  lesson_duration: "משך שיעור (חובה)",
  lesson_type: "סוג שיעור (חובה)",
  instrument_start_date: "תאריך תחילת נגינה",
};

const VALID_DURATIONS = [30, 45, 60];
const VALID_LESSON_TYPES = ["individual", "group"];
const VALID_GRADES = GRADES as readonly string[];
const VALID_LEVELS = PLAYING_LEVELS as readonly string[];

function parseDateValue(val: unknown): string | null {
  if (!val) return null;
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
  const match = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    TEMPLATE_COLUMNS,
    ["יוסי", "כהן", "123456789", "ד'", "א", "אבי כהן", "0501234567", "avi@mail.com", "teacher@mail.com", "גיטרה", "בית ספר מוסיקה", 45, "individual", "01/09/2024"],
  ]);
  ws["!cols"] = TEMPLATE_COLUMNS.map(() => ({ wch: 20 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "תלמידים");
  XLSX.writeFile(wb, "תבנית_ייבוא_תלמידים.xlsx");
}

export default function StudentImportDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [parsed, setParsed] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [importResult, setImportResult] = useState<{ created: number; reused: number; enrollments: number; failed: number } | null>(null);

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

    // Fetch lookup data
    const [{ data: teachers }, { data: students }] = await Promise.all([
      supabase.from("teachers").select("id, email"),
      supabase.from("students").select("id, first_name, last_name, national_id"),
    ]);

    const teacherByEmail = new Map(
      (teachers ?? []).filter(t => t.email).map(t => [t.email!.toLowerCase(), t.id])
    );

    const result: ParsedRow[] = rows.map((row, i) => {
      const errors: string[] = [];
      const firstName = String(row.student_first_name ?? "").trim();
      const lastName = String(row.student_last_name ?? "").trim();
      const nationalId = String(row.national_id ?? "").trim() || undefined;
      const grade = String(row.grade ?? "").trim() || undefined;
      const playingLevel = String(row.playing_level ?? "").trim() || undefined;
      const parentName = String(row.parent_name ?? "").trim() || undefined;
      const parentPhone = String(row.parent_phone ?? "").trim() || undefined;
      const parentEmail = String(row.parent_email ?? "").trim() || undefined;
      const teacherEmail = String(row.teacher_email ?? "").trim().toLowerCase();
      const instrument = String(row.instrument ?? "").trim();
      const school = String(row.school ?? "").trim();
      const lessonDuration = Number(row.lesson_duration) || 0;
      const lessonType = String(row.lesson_type ?? "").trim().toLowerCase();
      const instrumentStartDate = parseDateValue(row.instrument_start_date);

      // Required fields
      if (!firstName) errors.push("שם פרטי חסר");
      if (!lastName) errors.push("שם משפחה חסר");
      if (!teacherEmail) errors.push("אימייל מורה חסר");
      if (!instrument) errors.push("כלי נגינה חסר");
      if (!school) errors.push("בית ספר חסר");
      if (!lessonDuration) errors.push("משך שיעור חסר");
      if (!lessonType) errors.push("סוג שיעור חסר");

      // Validations
      if (teacherEmail && !teacherByEmail.has(teacherEmail)) {
        errors.push(`מורה עם אימייל ${teacherEmail} לא נמצא`);
      }
      if (lessonDuration && !VALID_DURATIONS.includes(lessonDuration)) {
        errors.push("משך שיעור חייב להיות 30, 45 או 60");
      }
      if (lessonType && !VALID_LESSON_TYPES.includes(lessonType)) {
        errors.push("סוג שיעור חייב להיות individual או group");
      }
      if (grade && !VALID_GRADES.includes(grade)) {
        errors.push("כיתה לא תקינה");
      }
      if (playingLevel && !VALID_LEVELS.includes(playingLevel)) {
        errors.push("רמת נגינה חייבת להיות א, ב או ג");
      }

      // Check if student exists (by national_id or name)
      let existingStudentId: string | undefined;
      if (nationalId) {
        const match = (students ?? []).find(s => s.national_id === nationalId);
        if (match) existingStudentId = match.id;
      }
      if (!existingStudentId) {
        const match = (students ?? []).find(
          s => s.first_name === firstName && s.last_name === lastName
        );
        if (match) existingStudentId = match.id;
      }

      return {
        row: i + 2,
        data: {
          student_first_name: firstName,
          student_last_name: lastName,
          national_id: nationalId,
          grade,
          playing_level: playingLevel,
          parent_name: parentName,
          parent_phone: parentPhone,
          parent_email: parentEmail,
          teacher_email: teacherEmail,
          instrument,
          school,
          lesson_duration: lessonDuration,
          lesson_type: lessonType,
          instrument_start_date: instrumentStartDate ?? undefined,
        },
        errors,
        existingStudentId,
      };
    });

    setParsed(result);
    e.target.value = "";
  };

  const validRows = parsed?.filter((r) => r.errors.length === 0) ?? [];
  const errorRows = parsed?.filter((r) => r.errors.length > 0) ?? [];
  const newStudents = validRows.filter(r => !r.existingStudentId).length;
  const reusedStudents = validRows.filter(r => !!r.existingStudentId).length;

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    let created = 0;
    let reused = 0;
    let enrollments = 0;
    let failed = 0;

    // Fetch teachers, instruments, schools for lookup
    const [{ data: teachers }, { data: instruments }, { data: schools }, { data: academicYears }] = await Promise.all([
      supabase.from("teachers").select("id, email"),
      supabase.from("instruments").select("id, name"),
      supabase.from("schools").select("id, name"),
      supabase.from("academic_years").select("id").eq("is_active", true).limit(1),
    ]);

    const teacherByEmail = new Map(
      (teachers ?? []).filter(t => t.email).map(t => [t.email!.toLowerCase(), t.id])
    );
    const instrumentByName = new Map(
      (instruments ?? []).map(i => [i.name.toLowerCase(), i.id])
    );
    const schoolByName = new Map(
      (schools ?? []).map(s => [s.name.toLowerCase(), s.id])
    );
    const activeYearId = academicYears?.[0]?.id ?? null;

    for (const row of validRows) {
      try {
        // 1. Resolve student
        let studentId = row.existingStudentId;
        if (!studentId) {
          const { data: newStudent, error: sErr } = await supabase
            .from("students")
            .insert({
              first_name: row.data.student_first_name,
              last_name: row.data.student_last_name,
              national_id: row.data.national_id || null,
              grade: row.data.grade || null,
              playing_level: row.data.playing_level || null,
              parent_name: row.data.parent_name || null,
              parent_phone: row.data.parent_phone || null,
              parent_email: row.data.parent_email || null,
              is_active: true,
            })
            .select("id")
            .single();
          if (sErr || !newStudent) { failed++; continue; }
          studentId = newStudent.id;
          created++;
        } else {
          reused++;
        }

        // 2. Resolve teacher
        const teacherId = teacherByEmail.get(row.data.teacher_email);
        if (!teacherId) { failed++; continue; }

        // 3. Resolve instrument (create if missing)
        let instrumentId = instrumentByName.get(row.data.instrument.toLowerCase());
        if (!instrumentId) {
          const { data: newInst, error: iErr } = await supabase
            .from("instruments")
            .insert({ name: row.data.instrument })
            .select("id")
            .single();
          if (iErr || !newInst) { failed++; continue; }
          instrumentId = newInst.id;
          instrumentByName.set(row.data.instrument.toLowerCase(), instrumentId);
        }

        // 4. Resolve school (create if missing)
        let schoolId = schoolByName.get(row.data.school.toLowerCase());
        if (!schoolId) {
          const { data: newSchool, error: scErr } = await supabase
            .from("schools")
            .insert({ name: row.data.school })
            .select("id")
            .single();
          if (scErr || !newSchool) { failed++; continue; }
          schoolId = newSchool.id;
          schoolByName.set(row.data.school.toLowerCase(), schoolId);
        }

        // 5. Create enrollment
        const startDate = row.data.instrument_start_date || new Date().toISOString().split("T")[0];
        const { error: eErr } = await supabase.from("enrollments").insert({
          student_id: studentId,
          teacher_id: teacherId,
          instrument_id: instrumentId,
          school_id: schoolId,
          lesson_duration_minutes: row.data.lesson_duration,
          lesson_type: row.data.lesson_type as "individual" | "group",
          start_date: startDate,
          instrument_start_date: row.data.instrument_start_date || null,
          academic_year_id: activeYearId,
          is_active: true,
        });
        if (eErr) { failed++; continue; }
        enrollments++;
      } catch {
        failed++;
      }
    }

    setImporting(false);
    setDone(true);
    setImportResult({ created, reused, enrollments, failed });
    queryClient.invalidateQueries({ queryKey: ["admin-students-enrollments"] });
    if (enrollments > 0) toast.success(`${enrollments} שיוכים יובאו בהצלחה`);
    if (failed > 0) toast.error(`${failed} שורות נכשלו`);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            ייבוא תלמידים מאקסל
          </DialogTitle>
          <DialogDescription>
            העלה קובץ אקסל (.xlsx) עם נתוני תלמידים ושיוכים לייבוא מרוכז
          </DialogDescription>
        </DialogHeader>

        {done && importResult ? (
          <div className="space-y-4 text-center py-4">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <p className="text-lg font-semibold">הייבוא הושלם</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>{importResult.created} תלמידים חדשים נוצרו</p>
              <p>{importResult.reused} תלמידים קיימים שויכו מחדש</p>
              <p>{importResult.enrollments} שיוכים נוצרו</p>
              {importResult.failed > 0 && (
                <p className="text-destructive">{importResult.failed} שורות נכשלו</p>
              )}
            </div>
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
                <li>כל שורה מייצגת תלמיד + שיוך אחד (מורה, כלי, בית ספר)</li>
                <li>שדות חובה: שם פרטי, שם משפחה, אימייל מורה, כלי נגינה, בית ספר, משך שיעור, סוג שיעור</li>
                <li>אם תלמיד כבר קיים (לפי ת.ז. או שם מלא) — ייעשה שימוש חוזר</li>
                <li>כלי נגינה ובית ספר חדשים ייווצרו אוטומטית</li>
                <li>סוג שיעור: <strong>individual</strong> או <strong>group</strong></li>
                <li>משך שיעור: 30, 45, או 60</li>
                <li>תאריך בפורמט DD/MM/YYYY</li>
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
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{newStudents}</p>
                <p className="text-xs text-muted-foreground">תלמידים חדשים</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{reusedStudents}</p>
                <p className="text-xs text-muted-foreground">תלמידים קיימים</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{validRows.length}</p>
                <p className="text-xs text-muted-foreground">שיוכים ייווצרו</p>
              </div>
              <div className="rounded-xl border border-border bg-muted/50 p-3 text-center">
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
                      <th className="p-2 text-right font-medium">תלמיד</th>
                      <th className="p-2 text-right font-medium">כלי</th>
                      <th className="p-2 text-right font-medium">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validRows.slice(0, 20).map((r) => (
                      <tr key={r.row} className="border-t border-border">
                        <td className="p-2 text-muted-foreground">{r.row}</td>
                        <td className="p-2">{r.data.student_first_name} {r.data.student_last_name}</td>
                        <td className="p-2 text-muted-foreground">{r.data.instrument}</td>
                        <td className="p-2">
                          <Badge variant={r.existingStudentId ? "secondary" : "default"} className="text-[10px] rounded-md">
                            {r.existingStudentId ? "קיים" : "חדש"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                    {validRows.length > 20 && (
                      <tr className="border-t border-border">
                        <td colSpan={4} className="p-2 text-center text-muted-foreground">
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
                  `ייבא ${validRows.length} שורות`
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
