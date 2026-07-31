import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const dupPairKey = (a: string, b: string) => [a, b].sort().join("|");

export const useFamilyDupDismissals = () => {
  const qc = useQueryClient();

  const { data: dismissed = new Set<string>(), isLoading } = useQuery({
    queryKey: ["family-dup-dismissals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("family_dup_dismissals")
        .select("parent_a_national_id, parent_b_national_id");
      if (error) throw error;
      return new Set(
        (data || []).map((r) =>
          dupPairKey(r.parent_a_national_id, r.parent_b_national_id),
        ),
      );
    },
    staleTime: 60_000,
  });

  const dismissPairs = useMutation({
    mutationFn: async (pairs: [string, string][]) => {
      const rows = pairs
        .filter(([a, b]) => a && b && a !== b)
        .map(([a, b]) => {
          const [x, y] = [a, b].sort();
          return { parent_a_national_id: x, parent_b_national_id: y };
        });
      if (!rows.length) return;
      const { error } = await supabase
        .from("family_dup_dismissals")
        .upsert(rows, {
          onConflict: "parent_a_national_id,parent_b_national_id",
          ignoreDuplicates: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["family-dup-dismissals"] });
    },
  });

  return { dismissed, isLoading, dismissPairs };
};
