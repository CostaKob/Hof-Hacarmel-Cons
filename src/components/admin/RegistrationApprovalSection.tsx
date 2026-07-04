import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { FileText } from "lucide-react";

interface Props {
  studentId: string;
}

const RegistrationApprovalSection = ({ studentId }: Props) => {
  const navigate = useNavigate();
  const { data: reg, isLoading } = useQuery({
    queryKey: ["admin-student-registration", studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registrations")
        .select("id, status, created_at, academic_years:academic_year_id(name)")
        .eq("existing_student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!studentId,
  });

  if (isLoading || !reg) return null;

  const submittedAt = reg.created_at
    ? format(new Date(reg.created_at), "dd/MM/yyyy")
    : "—";
  const yearName = (reg as any).academic_years?.name;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-semibold text-foreground text-sm">פרטי הרשמה</h2>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">
          {yearName ? `${yearName} · ` : ""}הוגשה ב-{submittedAt}
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-10 rounded-xl shrink-0"
        onClick={() => navigate(`/admin/registrations/${reg.id}`)}
      >
        <FileText className="h-4 w-4 ml-1.5" />
        צפה
      </Button>
    </div>
  );
};

export default RegistrationApprovalSection;

