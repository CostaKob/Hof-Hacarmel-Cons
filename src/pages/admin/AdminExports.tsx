import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Download, Users, GraduationCap, ClipboardList, BarChart3, Loader2, CreditCard, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type ExportKey = "students" | "teachers" | "enrollments" | "reports" | "yearly" | "registrations" | "payments";

interface ExportOption {
  key: ExportKey;
  label: string;
  description: string;
  icon: React.ElementType;
}

const EXPORTS: ExportOption[] = [
  { key: "students", label: "תלמידים", description: "כל התלמידים כולל פרטים אישיים והורים", icon: Users },
  { key: "teachers", label: "מורים", description: "כל המורים כולל פרטי קשר", icon: GraduationCap },
  { key: "enrollments", label: "רישומים (שיוכים)", description: "כל הרישומים כולל תלמיד, מורה, בי\"ס וכלי", icon: ClipboardList },
  { key: "reports", label: "דיווחי שיעורים", description: "כל דיווחי השיעורים כולל סטטוס נוכחות", icon: BarChart3 },
  { key: "yearly", label: "סיכום שנתי", description: "סיכום שיעורים שנתי לכל רישום", icon: BarChart3 },
  { key: "payments", label: "תשלומים", description: "כל התשלומים כולל שיוך, סכום ואמצעי תשלום", icon: CreditCard },
  { key: "registrations", label: "הרשמות", description: "כל ההרשמות שהתקבלו כולל סטטוס ופרטים", icon: ClipboardList },
];

function downloadXlsx(data: Record<string, string | number | boolean | null>[], filename: string) {
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

const AdminExports = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState<ExportKey | null>(null);

  const exportStudents = async () => {
    // Fetch enrollments with all related data to match import format
    const { data: enrollments, error } = await supabase
      .from("enrollments")
      .select("*, students(*), teachers(email), instruments(name), schools(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;

    return (enrollments ?? []).map((e: any) => ({
      student_first_name: e.students?.first_name ?? "",
      student_last_name: e.students?.last_name ?? "",
      national_id: e.students?.national_id ?? "",
      gender: e.students?.gender ?? "",
      student_phone: e.students?.phone ?? "",
      address: e.students?.address ?? "",
      city: e.students?.city ?? "",
      grade: e.students?.grade ?? "",
      playing_level: e.students?.playing_level ?? "",
      parent_name: e.students?.parent_name ?? "",
      parent_phone: e.students?.parent_phone ?? "",
      parent_email: e.students?.parent_email ?? "",
      teacher_email: e.teachers?.email ?? "",
      instrument: e.instruments?.name ?? "",
      school: e.schools?.name ?? "",
      lesson_duration: e.lesson_duration_minutes,
      lesson_type: e.lesson_type,
      instrument_start_date: e.instrument_start_date ?? "",
    }));
  };

  const exportTeachers = async () => {
    const { data, error } = await supabase.from("teachers").select("*").order("last_name");
    if (error) throw error;
    return (data ?? []).map((t) => ({
      "שם פרטי": t.first_name,
      "שם משפחה": t.last_name,
      "ת.ז.": t.national_id ?? "",
      "תאריך לידה": t.birth_date ?? "",
      "טלפון": t.phone ?? "",
      "אימייל": t.email ?? "",
      "כתובת": t.address ?? "",
      "עיר": t.city ?? "",
      "פעיל": t.is_active ? "כן" : "לא",
    }));
  };

  const exportEnrollments = async () => {
    const { data, error } = await supabase
      .from("enrollments")
      .select("*, students(first_name, last_name), teachers(first_name, last_name), schools(name), instruments(name)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((e: any) => ({
      "תלמיד": `${e.students?.first_name ?? ""} ${e.students?.last_name ?? ""}`.trim(),
      "מורה": `${e.teachers?.first_name ?? ""} ${e.teachers?.last_name ?? ""}`.trim(),
      "בית ספר": e.schools?.name ?? "",
      "כלי": e.instruments?.name ?? "",
      "משך שיעור (דק')": e.lesson_duration_minutes,
      "סוג שיעור": e.lesson_type === "individual" ? "פרטני" : "קבוצתי",
      "תפקיד": e.enrollment_role === "primary" ? "ראשי" : "משני",
      "תאריך התחלה": e.start_date,
      "פעיל": e.is_active ? "כן" : "לא",
    }));
  };

  const exportReports = async () => {
    const { data, error } = await supabase
      .from("report_lines")
      .select("status, notes, reports(report_date, kilometers, teachers(first_name, last_name), schools(name)), enrollments(students(first_name, last_name), instruments(name), lesson_duration_minutes)")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((l: any) => ({
      "תאריך": l.reports?.report_date ?? "",
      "מורה": `${l.reports?.teachers?.first_name ?? ""} ${l.reports?.teachers?.last_name ?? ""}`.trim(),
      "בית ספר": l.reports?.schools?.name ?? "",
      "תלמיד": `${l.enrollments?.students?.first_name ?? ""} ${l.enrollments?.students?.last_name ?? ""}`.trim(),
      "כלי": l.enrollments?.instruments?.name ?? "",
      "משך (דק')": l.enrollments?.lesson_duration_minutes ?? "",
      "סטטוס": statusHe(l.status),
      "הערות": l.notes ?? "",
      "ק\"מ": l.reports?.kilometers ?? 0,
    }));
  };

  const exportYearly = async () => {
    const { data: enrollments } = await supabase
      .from("enrollments")
      .select("id, is_active, lesson_duration_minutes, students(first_name, last_name), teachers(first_name, last_name), instruments(name), schools(name)");
    const { data: lines } = await supabase.from("report_lines").select("enrollment_id, status");

    const countsMap = new Map<string, Record<string, number>>();
    for (const l of lines ?? []) {
      const c = countsMap.get(l.enrollment_id) ?? { present: 0, double_lesson: 0, justified_absence: 0, unjustified_absence: 0, vacation: 0 };
      if (l.status in c) (c as any)[l.status]++;
      countsMap.set(l.enrollment_id, c);
    }

    return (enrollments ?? []).map((e: any) => {
      const c = countsMap.get(e.id) ?? { present: 0, double_lesson: 0, justified_absence: 0, unjustified_absence: 0, vacation: 0 };
      const total = c.present + c.double_lesson * 2 + c.unjustified_absence;
      return {
        "תלמיד": `${e.students?.first_name ?? ""} ${e.students?.last_name ?? ""}`.trim(),
        "מורה": `${e.teachers?.first_name ?? ""} ${e.teachers?.last_name ?? ""}`.trim(),
        "כלי": e.instruments?.name ?? "",
        "בית ספר": e.schools?.name ?? "",
        "משך (דק')": e.lesson_duration_minutes,
        "פעיל": e.is_active ? "כן" : "לא",
        "נוכחות": c.present,
        "שיעור כפול": c.double_lesson,
        "היעדרות מוצדקת": c.justified_absence,
        "היעדרות לא מוצדקת": c.unjustified_absence,
        "חופש": c.vacation,
        "סה\"כ שיעורים": total,
      };
    });
  };

  const exportPayments = async () => {
    const { data, error } = await supabase
      .from("student_payments")
      .select("*, students(first_name, last_name), enrollments(instruments(name), schools(name), teachers(first_name, last_name))")
      .order("payment_date", { ascending: false });
    if (error) throw error;
    const methodMap: Record<string, string> = {
      cash: "מזומן", check: "צ'ק", transfer: "העברה", credit_card: "אשראי", other: "אחר",
    };
    const typeMap: Record<string, string> = { payment: "תשלום", credit: "זיכוי" };
    return (data ?? []).map((p: any) => ({
      "תאריך": p.payment_date,
      "תלמיד": `${p.students?.first_name ?? ""} ${p.students?.last_name ?? ""}`.trim(),
      "מורה": `${p.enrollments?.teachers?.first_name ?? ""} ${p.enrollments?.teachers?.last_name ?? ""}`.trim(),
      "כלי": p.enrollments?.instruments?.name ?? "",
      "בית ספר": p.enrollments?.schools?.name ?? "",
      "סוג": typeMap[p.transaction_type] ?? p.transaction_type,
      "סכום": p.amount,
      "אמצעי תשלום": methodMap[p.payment_method] ?? p.payment_method ?? "",
      "תשלומים": p.installments,
      "מספר אסמכתא": p.reference_number ?? "",
      "חודש ייחוס": p.month_reference ?? "",
      "הערות": p.notes ?? "",
    }));
  };

  const exportRegistrations = async () => {
    const { data, error } = await supabase.from("registrations").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    const statusMap: Record<string, string> = {
      new: "חדש", in_review: "בבדיקה", approved: "אושר", rejected: "נדחה",
      converted: "הומר", waiting_for_call: "ממתין לשיחה", waiting_for_payment: "ממתין לתשלום", ready_to_assign: "מוכן לשיוך",
    };
    return (data ?? []).map((r) => ({
      "שם פרטי": r.student_first_name,
      "שם משפחה": r.student_last_name,
      "ת.ז. תלמיד": r.student_national_id,
      "מין": r.gender === "male" ? "זכר" : r.gender === "female" ? "נקבה" : r.gender ?? "",
      "טלפון תלמיד": r.student_phone ?? "",
      "עיר": r.city,
      "כיתה": r.grade,
      "בית ספר (סניף)": r.branch_school_name,
      "בית ספר (טקסט)": r.student_school_text,
      "כלים מבוקשים": Array.isArray(r.requested_instruments) ? (r.requested_instruments as string[]).join(", ") : "",
      "משך שיעור מבוקש": r.requested_lesson_duration,
      "שם הורה": r.parent_name,
      "ת.ז. הורה": r.parent_national_id,
      "טלפון הורה": r.parent_phone,
      "אימייל הורה": r.parent_email,
      "סטטוס": statusMap[r.status] ?? r.status,
      "הערות": r.notes ?? "",
      "תאריך הרשמה": r.created_at ? new Date(r.created_at).toLocaleDateString("he-IL") : "",
    }));
  };

  const handleExport = async (key: ExportKey) => {
    setLoading(key);
    try {
      let data: Record<string, any>[];
      switch (key) {
        case "students": data = await exportStudents(); break;
        case "teachers": data = await exportTeachers(); break;
        case "enrollments": data = await exportEnrollments(); break;
        case "reports": data = await exportReports(); break;
        case "yearly": data = await exportYearly(); break;
        case "payments": data = await exportPayments(); break;
        case "registrations": data = await exportRegistrations(); break;
      }
      if (data.length === 0) {
        toast.info("אין נתונים לייצוא");
        return;
      }
      const names: Record<ExportKey, string> = {
        students: "תלמידים",
        teachers: "מורים",
        enrollments: "רישומים",
        reports: "דיווחי_שיעורים",
        yearly: "סיכום_שנתי",
        payments: "תשלומים",
        registrations: "הרשמות",
      };
      downloadXlsx(data, names[key]);
      toast.success(`${data.length} רשומות יוצאו בהצלחה`);
    } catch (err: any) {
      toast.error(err.message || "שגיאה בייצוא");
    } finally {
      setLoading(null);
    }
  };

  return (
    <AdminLayout title="דוחות וייצוא" backPath="/admin">
      <div className="space-y-6">
        {/* Salary report link */}
        <a
          href="/admin/salary-report"
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md active:scale-[0.98] text-right"
        >
          <div className="rounded-xl bg-accent p-3.5">
            <FileSpreadsheet className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground text-base">דוח משכורות</p>
            <p className="text-sm text-muted-foreground mt-0.5">הפקת דוח משכורות חודשי לכל המורים</p>
          </div>
        </button>

        {/* Export buttons */}
        <div className="grid gap-4 sm:grid-cols-2">
        {EXPORTS.map((exp) => (
          <div
            key={exp.key}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <div className="rounded-xl bg-accent p-3.5">
              <exp.icon className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground text-base">{exp.label}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{exp.description}</p>
            </div>
            <Button
              variant="outline"
              className="rounded-xl h-11 gap-2"
              onClick={() => handleExport(exp.key)}
              disabled={loading !== null}
            >
              {loading === exp.key ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              ייצוא
            </Button>
          </div>
        ))}
        </div>
      </div>
    </AdminLayout>
  );
};

function statusHe(s: string) {
  const map: Record<string, string> = {
    present: "נוכח/ת",
    double_lesson: "שיעור כפול",
    justified_absence: "היעדרות מוצדקת",
    unjustified_absence: "היעדרות לא מוצדקת",
    vacation: "חופש",
  };
  return map[s] ?? s;
}

export default AdminExports;
