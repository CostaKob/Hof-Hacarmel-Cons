import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const AdminPaymentSettings = () => {
  const queryClient = useQueryClient();
  const { activeYear, selectedYearId, years } = useAcademicYear();
  const yearId = selectedYearId ?? activeYear?.id;

  const { data: settings, isLoading } = useQuery({
    queryKey: ["payment-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_settings" as any).select("*").limit(1).maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: year } = useQuery({
    queryKey: ["payment-year", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase.from("academic_years").select("*").eq("id", yearId!).single();
      if (error) throw error;
      return data as any;
    },
  });

  const [price30, setPrice30] = useState("");
  const [price45, setPrice45] = useState("");
  const [price60, setPrice60] = useState("");
  const [vat, setVat] = useState("18");
  const [discSibling, setDiscSibling] = useState("5");
  const [discSecondInst, setDiscSecondInst] = useState("5");
  const [discMajor, setDiscMajor] = useState("10");

  useEffect(() => {
    if (settings) {
      const lp = settings.lesson_prices ?? {};
      setPrice30(String(lp["30"] ?? 0));
      setPrice45(String(lp["45"] ?? 0));
      setPrice60(String(lp["60"] ?? 0));
      setVat(String(settings.vat_rate ?? 18));
    }
  }, [settings]);

  useEffect(() => {
    if (year) {
      setDiscSibling(String(year.discount_sibling_pct ?? 5));
      setDiscSecondInst(String(year.discount_second_instrument_pct ?? 5));
      setDiscMajor(String(year.discount_major_student_pct ?? 10));
    }
  }, [year]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await supabase
        .from("payment_settings" as any)
        .update({
          lesson_prices: { "30": Number(price30) || 0, "45": Number(price45) || 0, "60": Number(price60) || 0 },
          vat_rate: Number(vat) || 0,
        })
        .eq("id", settings.id);
      if (e1) throw e1;

      if (yearId) {
        const { error: e2 } = await supabase
          .from("academic_years")
          .update({
            discount_sibling_pct: Number(discSibling) || 0,
            discount_second_instrument_pct: Number(discSecondInst) || 0,
            discount_major_student_pct: Number(discMajor) || 0,
          } as any)
          .eq("id", yearId);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success("ההגדרות נשמרו");
      queryClient.invalidateQueries({ queryKey: ["payment-settings"] });
      queryClient.invalidateQueries({ queryKey: ["payment-year", yearId] });
    },
    onError: (e: any) => toast.error(e.message ?? "שגיאה בשמירה"),
  });

  if (isLoading) {
    return (
      <AdminLayout title="הגדרות תשלום" backPath="/admin">
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </AdminLayout>
    );
  }

  const yearName = years.find((y) => y.id === yearId)?.name ?? "—";

  return (
    <AdminLayout title="הגדרות תשלום" backPath="/admin">
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div>
            <h2 className="font-semibold text-foreground text-base">מחירון שיעורים (גלובלי)</h2>
            <p className="text-xs text-muted-foreground mt-0.5">מחיר שנתי ברירת מחדל לפי משך השיעור. ניתן לעקוף ברמת רישום.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>30 דקות (₪ שנתי)</Label>
              <Input type="number" min="0" value={price30} onChange={(e) => setPrice30(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div>
              <Label>45 דקות (₪ שנתי)</Label>
              <Input type="number" min="0" value={price45} onChange={(e) => setPrice45(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div>
              <Label>60 דקות (₪ שנתי)</Label>
              <Input type="number" min="0" value={price60} onChange={(e) => setPrice60(e.target.value)} className="h-12 rounded-xl" />
            </div>
          </div>
          <div className="max-w-[200px]">
            <Label>אחוז מע"מ</Label>
            <Input type="number" min="0" max="100" step="0.01" value={vat} onChange={(e) => setVat(e.target.value)} className="h-12 rounded-xl" />
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div>
            <h2 className="font-semibold text-foreground text-base">הנחות לשנה {yearName}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">אחוזי הנחה הנגזרים פר שנת לימודים.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>אח שני (%)</Label>
              <Input type="number" min="0" max="100" step="0.01" value={discSibling} onChange={(e) => setDiscSibling(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div>
              <Label>כלי שני (%)</Label>
              <Input type="number" min="0" max="100" step="0.01" value={discSecondInst} onChange={(e) => setDiscSecondInst(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div>
              <Label>תלמיד מגמה (%)</Label>
              <Input type="number" min="0" max="100" step="0.01" value={discMajor} onChange={(e) => setDiscMajor(e.target.value)} className="h-12 rounded-xl" />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button className="h-12 rounded-xl px-8" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "שומר..." : "שמור"}
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminPaymentSettings;
