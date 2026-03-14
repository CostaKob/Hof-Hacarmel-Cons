import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

function getMonthRange(offset = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { from: fmt(start), to: fmt(end) };
}

/** Reports for a teacher in a given month (offset: 0=current, -1=previous) */
export function useTeacherMonthReports(teacherId: string | undefined, monthOffset = 0) {
  const { from, to } = getMonthRange(monthOffset);
  return useQuery({
    queryKey: ["teacher-month-reports", teacherId, from, to],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reports")
        .select("id, report_date, kilometers")
        .eq("teacher_id", teacherId!)
        .gte("report_date", from)
        .lte("report_date", to)
        .order("report_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
