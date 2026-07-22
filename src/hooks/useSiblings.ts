import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ConfirmedSibling {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  link_id: string;
  match_reason: string | null;
}

export interface SiblingCandidate {
  id: string;
  first_name: string;
  last_name: string;
  grade: string | null;
  city: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  match_score: number;
  match_reason: string | null;
  already_linked: boolean;
}

export const useConfirmedSiblings = (studentId?: string) =>
  useQuery({
    queryKey: ["siblings-confirmed", studentId],
    enabled: !!studentId,
    queryFn: async (): Promise<ConfirmedSibling[]> => {
      const { data, error } = await (supabase as any).rpc("get_confirmed_siblings", {
        _student_id: studentId,
      });
      if (error) throw error;
      return (data ?? []) as ConfirmedSibling[];
    },
  });

export const useSiblingCandidates = (studentId?: string, enabled = false) =>
  useQuery({
    queryKey: ["siblings-candidates", studentId],
    enabled: !!studentId && enabled,
    queryFn: async (): Promise<SiblingCandidate[]> => {
      const { data, error } = await (supabase as any).rpc("get_sibling_candidates", {
        _student_id: studentId,
      });
      if (error) throw error;
      return (data ?? []) as SiblingCandidate[];
    },
  });

export const useLinkSiblings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      studentAId: string;
      studentBId: string;
      matchScore?: number;
      matchReason?: string | null;
    }) => {
      const [a, b] = [params.studentAId, params.studentBId].sort();
      const { error } = await (supabase as any).from("student_siblings").insert({
        student_a_id: a,
        student_b_id: b,
        match_score: params.matchScore ?? 100,
        match_reason: params.matchReason ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["siblings-confirmed"] });
      qc.invalidateQueries({ queryKey: ["siblings-candidates"] });
      toast.success("קישור אחים נשמר");
    },
    onError: (e: any) => toast.error(`שגיאה: ${e?.message ?? ""}`),
  });
};

export const useUnlinkSiblings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await (supabase as any).from("student_siblings").delete().eq("id", linkId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["siblings-confirmed"] });
      qc.invalidateQueries({ queryKey: ["siblings-candidates"] });
      toast.success("הקישור הוסר");
    },
    onError: (e: any) => toast.error(`שגיאה: ${e?.message ?? ""}`),
  });
};
