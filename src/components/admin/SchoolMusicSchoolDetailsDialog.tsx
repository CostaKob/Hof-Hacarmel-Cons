import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const OPERATING_DAYS = [0, 1, 2, 3, 4, 5];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  school: any;
  onSaved?: () => void;
}

const SchoolMusicSchoolDetailsDialog = ({ open, onOpenChange, school, onSaved }: Props) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>({
    principal_name: "",
    principal_phone: "",
    vice_principal_name: "",
    vice_principal_phone: "",
    notes: "",
    operating_days: [] as number[],
  });

  useEffect(() => {
    if (open && school) {
      const opDays = Array.isArray(school.operating_days) ? school.operating_days : [];
      const fallback = school.day_of_week != null ? [school.day_of_week] : [];
      setForm({
        principal_name: school.principal_name || "",
        principal_phone: school.principal_phone || "",
        vice_principal_name: school.vice_principal_name || "",
        vice_principal_phone: school.vice_principal_phone || "",
        notes: school.notes || "",
        operating_days: opDays.length > 0 ? opDays : fallback,
      });
    }
  }, [open, school]);

  const toggleDay = (day: number, checked: boolean) => {
    setForm((p: any) => {
      const current: number[] = p.operating_days || [];
      const next = checked ? [...current, day] : current.filter((d) => d !== day);
      return { ...p, operating_days: [...new Set(next)].sort((a, b) => a - b) };
    });
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const days = (form.operating_days || []).map(Number);
      const { error } = await supabase
        .from("school_music_schools")
        .update({
          principal_name: form.principal_name || null,
          principal_phone: form.principal_phone || null,
          vice_principal_name: form.vice_principal_name || null,
          vice_principal_phone: form.vice_principal_phone || null,
          notes: form.notes || null,
          operating_days: days,
          day_of_week: days.length > 0 ? days[0] : null,
        } as any)
        .eq("id", school.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("פרטי בית הספר עודכנו");
      queryClient.invalidateQueries({ queryKey: ["school-music-school", school?.id] });
      queryClient.invalidateQueries({ queryKey: ["teacher-school-music-school-info", school?.id] });
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.message || "שגיאה בשמירת הפרטים"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>עריכת פרטי בית הספר</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm">שם מנהל/ת</Label>
              <Input
                className="h-12 rounded-xl"
                value={form.principal_name}
                onChange={(e) => setForm((p: any) => ({ ...p, principal_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">טלפון מנהל/ת</Label>
              <Input
                dir="ltr"
                className="h-12 rounded-xl"
                value={form.principal_phone}
                onChange={(e) => setForm((p: any) => ({ ...p, principal_phone: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">שם סגן/ית</Label>
              <Input
                className="h-12 rounded-xl"
                value={form.vice_principal_name}
                onChange={(e) => setForm((p: any) => ({ ...p, vice_principal_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">טלפון סגן/ית</Label>
              <Input
                dir="ltr"
                className="h-12 rounded-xl"
                value={form.vice_principal_phone}
                onChange={(e) => setForm((p: any) => ({ ...p, vice_principal_phone: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">ימי פעילות</Label>
            <div className="flex flex-wrap gap-3">
              {OPERATING_DAYS.map((d) => (
                <label key={d} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={(form.operating_days || []).includes(d)}
                    onCheckedChange={(c) => toggleDay(d, !!c)}
                  />
                  {DAY_NAMES[d]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">הערות</Label>
            <Textarea
              className="rounded-xl"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((p: any) => ({ ...p, notes: e.target.value }))}
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button className="h-12 rounded-xl flex-1" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button variant="outline" className="h-12 rounded-xl" onClick={() => onOpenChange(false)}>
            ביטול
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SchoolMusicSchoolDetailsDialog;
