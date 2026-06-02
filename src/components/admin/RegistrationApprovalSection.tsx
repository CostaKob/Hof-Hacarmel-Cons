import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Props {
  studentId: string;
}

const RegistrationApprovalSection = ({ studentId }: Props) => {
  const { data: reg, isLoading } = useQuery({
    queryKey: ["admin-student-registration", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("*, registration_pages:registration_page_id(approval_text, title), academic_years:academic_year_id(name)")
        .eq("existing_student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  if (isLoading) return null;
  if (!reg) return null;

  const submittedAt = reg.created_at ? format(new Date(reg.created_at), "dd/MM/yyyy HH:mm") : "—";
  const instruments: string[] = Array.isArray((reg as any).requested_instruments)
    ? (reg as any).requested_instruments
    : [];
  const duration = (reg as any).requested_lesson_duration;
  const branch = (reg as any).branch_school_name;
  const parent = (reg as any).parent_name;
  const approvalText =
    (reg as any).registration_pages?.approval_text ||
    "קראתי את המידע ואני מאשר/ת את תנאי ההרשמה והלימודים";
  const yearName = (reg as any).academic_years?.name;

  const Row = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex justify-between border-b border-border py-2.5 last:border-0">
        <span className="text-muted-foreground text-sm">{label}</span>
        <span className="font-medium text-foreground text-sm text-left">{value}</span>
      </div>
    ) : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-1">
      <h2 className="font-semibold text-foreground text-base mb-2">
        אישור הרשמה {yearName ? `(${yearName})` : ""}
      </h2>
      <Row label="תאריך ושעת מילוי הטופס" value={submittedAt} />
      <Row label="שם ההורה שמילא" value={parent} />
      <Row
        label={instruments.length > 1 ? "כלים מבוקשים" : "כלי מבוקש"}
        value={instruments.length > 0 ? instruments.join(", ") : null}
      />
      <Row label="משך שיעור מבוקש" value={duration ? `${duration} דקות` : null} />
      <Row label="שלוחה" value={branch} />

      <div className="pt-3 mt-2 border-t border-border space-y-2">
        <p className="text-sm text-muted-foreground">נוסח האישור:</p>
        <p className="text-sm text-foreground whitespace-pre-line bg-muted/40 rounded-lg p-3">
          {approvalText}
        </p>
        <p className="text-sm text-foreground pt-2">
          ההורה אישר את האמור לעיל בלחיצה על תיבת הסימון בתאריך {submittedAt}
        </p>
      </div>
    </div>
  );
};

export default RegistrationApprovalSection;
