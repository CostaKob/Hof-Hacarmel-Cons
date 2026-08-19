import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  CHEQUE_REQUEST_STATUS_META,
  type ChequeRequestStatus,
} from "@/lib/chequeCancellation";

/** Requests that are still moving through the refund pipeline. */
export const OPEN_REFUND_STATUSES: ChequeRequestStatus[] = [
  "awaiting_cheques",
  "awaiting_transfer",
  "transfer_requested",
];

export interface OpenRefundInfo {
  status: ChequeRequestStatus;
  label: string;
  className: string;
}

/**
 * Families (by paying parent national id) that currently have an open
 * cheque-cancellation / refund process, so they can be spotted in lists.
 */
export const useOpenRefundProcesses = (yearId?: string | null) =>
  useQuery({
    queryKey: ["open-refund-processes", yearId],
    queryFn: async () => {
      let query = supabase
        .from("cheque_cancellation_requests")
        .select("id,status,family_parent_national_id,student_id,created_at")
        .in("status", OPEN_REFUND_STATUSES);
      if (yearId) query = query.eq("academic_year_id", yearId);
      const { data, error } = await query;
      if (error) throw error;

      const byFamily = new Map<string, OpenRefundInfo>();
      const byStudent = new Map<string, OpenRefundInfo>();
      (data ?? []).forEach((r: any) => {
        const status = r.status as ChequeRequestStatus;
        const meta = CHEQUE_REQUEST_STATUS_META[status];
        const info: OpenRefundInfo = {
          status,
          label: meta?.label ?? "בתהליך זיכוי",
          className: meta?.className ?? "",
        };
        if (r.family_parent_national_id) byFamily.set(r.family_parent_national_id, info);
        if (r.student_id) byStudent.set(r.student_id, info);
      });
      return { byFamily, byStudent };
    },
  });
