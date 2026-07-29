import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface FamilyListItem {
  parent_national_id: string;
  parent_name: string | null;
  parent_phone: string | null;
  parent_email: string | null;
  children_count: number;
  children_ids: string[];
  children_names: string[];
}

export const useFamiliesList = (yearId?: string | null) =>
  useQuery({
    queryKey: ["families-list", yearId ?? null],
    queryFn: async (): Promise<FamilyListItem[]> => {
      const { data, error } = await (supabase as any).rpc("list_families", {
        _year_id: yearId ?? null,
      });
      if (error) throw error;
      return (data ?? []) as FamilyListItem[];
    },
  });

export interface FamilyChildRecord {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  city: string | null;
  student_status: string | null;
  parent_national_id: string | null;
  parent_national_id_2: string | null;
  parent_name: string | null;
  parent_name_2: string | null;
  parent_phone: string | null;
  parent_phone_2: string | null;
  parent_email: string | null;
  parent_email_2: string | null;
  has_music_production_course: boolean;
  has_recital_track: boolean;
}

export interface FamilyEnrollmentRecord {
  id: string;
  student_id: string;
  lesson_duration_minutes: number;
  price_per_lesson: number | null;
  total_lessons_allocated: number;
  is_active: boolean;
  grade: string | null;
  start_date: string;
  end_date: string | null;
  instrument_id: string;
  school_id: string;
  teacher_id: string;
  academic_year_id: string;
  instruments: { name: string } | null;
  schools: { name: string } | null;
  teachers: { first_name: string; last_name: string; phone: string | null } | null;
}

export interface FamilyPaymentRecord {
  id: string;
  student_id: string | null;
  amount: number;
  payment_date: string;
  payment_method: string | null;
  transaction_type: string;
  payment_status: string;
  notes: string | null;
  invoice_url: string | null;
  icount_doc_id: string | null;
  icount_doc_number: string | null;
  payment_link_url: string | null;
  payment_group_id: string | null;
  refund_of_payment_id: string | null;
  family_payment_group_id: string | null;
  family_parent_national_id: string | null;
  academic_year_id: string | null;
  academic_years?: { name: string } | null;
  enrollment_breakdown: any;
  created_at?: string;
  installments?: number | null;
  reference_number?: string | null;
  month_reference?: string | null;
}


export const useFamilyDetails = (
  parentNationalId?: string,
  childrenIds?: string[],
  yearId?: string | null,
) =>
  useQuery({
    queryKey: [
      "family-details",
      parentNationalId,
      yearId ?? null,
      (childrenIds || []).join(","),
    ],
    enabled: !!parentNationalId && !!childrenIds && childrenIds.length > 0,
    queryFn: async () => {
      const ids = childrenIds!;
      const studentsQ = supabase.from("students").select("*").in("id", ids);

      let enrollmentsQ: any = supabase
        .from("enrollments")
        .select(
          "*, instruments(name), schools(name), teachers(first_name, last_name, phone)",
        )
        .in("student_id", ids)
        .order("created_at", { ascending: true });
      if (yearId) enrollmentsQ = enrollmentsQ.eq("academic_year_id", yearId);

      let paymentsQ: any = supabase
        .from("student_payments")
        .select("*")
        .in("student_id", ids)
        .order("payment_date", { ascending: false });
      if (yearId) paymentsQ = paymentsQ.eq("academic_year_id", yearId);

      const [studentsRes, enrollmentsRes, paymentsRes] = await Promise.all([
        studentsQ,
        enrollmentsQ,
        paymentsQ,
      ]);

      if (studentsRes.error) throw studentsRes.error;
      if (enrollmentsRes.error) throw enrollmentsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      return {
        children: (studentsRes.data ?? []) as unknown as FamilyChildRecord[],
        enrollments: (enrollmentsRes.data ?? []) as unknown as FamilyEnrollmentRecord[],
        payments: (paymentsRes.data ?? []) as unknown as FamilyPaymentRecord[],
      };
    },
  });
