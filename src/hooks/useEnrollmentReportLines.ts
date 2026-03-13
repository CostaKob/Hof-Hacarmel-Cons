import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useEnrollmentReportLines(enrollmentId: string | undefined) {
  return useQuery({
    queryKey: ["enrollment-report-lines", enrollmentId],
    enabled: !!enrollmentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("report_lines")
        .select("id, status, notes, report_id, reports!inner(report_date)")
        .eq("enrollment_id", enrollmentId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      // Sort by report_date descending
      return (data ?? []).sort((a, b) => {
        const da = (a.reports as any)?.report_date ?? "";
        const db = (b.reports as any)?.report_date ?? "";
        return db.localeCompare(da);
      });
    },
  });
}
