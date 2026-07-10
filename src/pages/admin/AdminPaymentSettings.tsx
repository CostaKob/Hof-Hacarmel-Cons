import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { DiscountAppliesTo } from "@/lib/discounts";

interface DraftDiscount {
  id?: string; // existing row id
  legacy_key?: string | null;
  label: string;
  percentage: string;
  applies_to: DiscountAppliesTo;
  sort_order: number;
  _delete?: boolean;
}

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

  const { data: discounts, isLoading: discountsLoading } = useQuery({
    queryKey: ["discount-types", yearId],
    enabled: !!yearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("discount_types" as any)
        .select("*")
        .eq("academic_year_id", yearId!)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  const [price30, setPrice30] = useState("");
  const [price45, setPrice45] = useState("");
  const [price60, setPrice60] = useState("");
  const [priceMusicProduction, setPriceMusicProduction] = useState("");
  const [priceRecitalTrack, setPriceRecitalTrack] = useState("");
  const [drafts, setDrafts] = useState<DraftDiscount[]>([]);

  useEffect(() => {
    if (settings) {
      const lp = settings.lesson_prices ?? {};
      setPrice30(String(lp["30"] ?? 0));
      setPrice45(String(lp["45"] ?? 0));
      setPrice60(String(lp["60"] ?? 0));
      setPriceMusicProduction(String(settings.music_production_price ?? 0));
      setPriceRecitalTrack(String(settings.recital_track_price ?? 0));
    }
  }, [settings]);

  useEffect(() => {
    if (discounts) {
      setDrafts(
        discounts.map((d: any) => ({
          id: d.id,
          legacy_key: d.legacy_key,
          label: d.label ?? "",
          percentage: String(d.percentage ?? 0),
          applies_to: (d.applies_to ?? "all") as DiscountAppliesTo,
          sort_order: d.sort_order ?? 0,
        }))
      );
    }
  }, [discounts]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error: e1 } = await supabase
        .from("payment_settings" as any)
        .update({
          lesson_prices: { "30": Number(price30) || 0, "45": Number(price45) || 0, "60": Number(price60) || 0 },
          vat_rate: 0,
          music_production_price: Number(priceMusicProduction) || 0,
          recital_track_price: Number(priceRecitalTrack) || 0,
        } as any)
        .eq("id", settings.id);
      if (e1) throw e1;

      if (yearId) {
        // Apply discount edits
        const toDelete = drafts.filter((d) => d._delete && d.id).map((d) => d.id!);
        if (toDelete.length > 0) {
          const { error } = await supabase.from("discount_types" as any).delete().in("id", toDelete);
          if (error) throw error;
        }

        const survivors = drafts.filter((d) => !d._delete);
        for (let i = 0; i < survivors.length; i++) {
          const d = survivors[i];
          const label = d.label.trim();
          if (!label) continue;
          const payload = {
            academic_year_id: yearId,
            label,
            percentage: Number(d.percentage) || 0,
            applies_to: d.applies_to,
            sort_order: i,
          };
          if (d.id) {
            const { error } = await supabase
              .from("discount_types" as any)
              .update(payload)
              .eq("id", d.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from("discount_types" as any).insert(payload);
            if (error) throw error;
          }
        }
      }
    },
    onSuccess: () => {
      toast.success("ההגדרות נשמרו");
      queryClient.invalidateQueries({ queryKey: ["payment-settings"] });
      queryClient.invalidateQueries({ queryKey: ["discount-types", yearId] });
    },
    onError: (e: any) => toast.error(e.message ?? "שגיאה בשמירה"),
  });

  if (isLoading || discountsLoading) {
    return (
      <AdminLayout title="הגדרות תשלום" backPath="/admin">
        <PageTitle title="הגדרות תשלום" />
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </AdminLayout>
    );
  }

  const yearName = years.find((y) => y.id === yearId)?.name ?? "—";

  return (
    <AdminLayout title="הגדרות תשלום" backPath="/admin">
      <PageTitle title={`הגדרות תשלום — שנת ${yearName}`} />
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
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            הארגון מוגדר כמלכ"ר (זרוע של המועצה האזורית), ולכן <strong>לא נגבה מע"מ</strong> ולא מופקות חשבוניות מס. כל המסמכים שמופקים ב-iCount הם <strong>קבלות</strong>.
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div>
            <h2 className="font-semibold text-foreground text-base">קורסים מיוחדים</h2>
            <p className="text-xs text-muted-foreground mt-0.5">מחיר שנתי לקורסי הפקה ומסלול רסיטל. ייווסף לחישוב בכרטיס תלמיד כאשר ההורה בחר בקורס בטופס ההרשמה.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>קורס הפקה מוסיקלית (₪ שנתי)</Label>
              <Input type="number" min="0" value={priceMusicProduction} onChange={(e) => setPriceMusicProduction(e.target.value)} className="h-12 rounded-xl" />
            </div>
            <div>
              <Label>מסלול לרסיטל (₪ שנתי)</Label>
              <Input type="number" min="0" value={priceRecitalTrack} onChange={(e) => setPriceRecitalTrack(e.target.value)} className="h-12 rounded-xl" />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-semibold text-foreground text-base">הנחות לשנה {yearName}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                ניתן להוסיף, לערוך ולמחוק הנחות. ההנחות שכאן יופיעו בכרטיסי התלמיד.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl h-9"
              onClick={() =>
                setDrafts([
                  ...drafts,
                  { label: "", percentage: "0", applies_to: "all", sort_order: drafts.length },
                ])
              }
            >
              <Plus className="h-3.5 w-3.5 ml-1" /> הוסף הנחה
            </Button>
          </div>

          {drafts.filter((d) => !d._delete).length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">אין הנחות מוגדרות. לחץ "הוסף הנחה" כדי להתחיל.</p>
          )}

          <div className="space-y-2">
            {drafts.map((d, i) =>
              d._delete ? null : (
                <div key={d.id ?? `new-${i}`} className="grid grid-cols-1 sm:grid-cols-[1fr_110px_200px_44px] gap-2 items-end">
                  <div>
                    <Label className="text-xs text-muted-foreground">שם ההנחה</Label>
                    <Input
                      value={d.label}
                      placeholder="לדוגמה: אח שני"
                      onChange={(e) => {
                        const arr = [...drafts]; arr[i] = { ...arr[i], label: e.target.value }; setDrafts(arr);
                      }}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">אחוז (%)</Label>
                    <Input
                      type="number" min="0" max="100" step="0.01"
                      value={d.percentage}
                      onChange={(e) => {
                        const arr = [...drafts]; arr[i] = { ...arr[i], percentage: e.target.value }; setDrafts(arr);
                      }}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">חל על</Label>
                    <Select
                      value={d.applies_to}
                      onValueChange={(v) => {
                        const arr = [...drafts]; arr[i] = { ...arr[i], applies_to: v as DiscountAppliesTo }; setDrafts(arr);
                      }}
                    >
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">כל הרישומים</SelectItem>
                        <SelectItem value="cheapest_enrollment">כלים נוספים</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 rounded-xl text-destructive"
                    onClick={() => {
                      const arr = [...drafts];
                      if (arr[i].id) arr[i] = { ...arr[i], _delete: true };
                      else arr.splice(i, 1);
                      setDrafts(arr);
                    }}
                    title="מחק"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              )
            )}
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
