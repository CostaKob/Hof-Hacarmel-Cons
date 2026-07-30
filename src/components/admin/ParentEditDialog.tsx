import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Save, X, Users, AlertTriangle } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parentId: string | null;
}

const ParentEditDialog = ({ open, onOpenChange, parentId }: Props) => {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    full_name: "",
    national_id: "",
    phone: "",
    email: "",
  });

  const { data: parent } = useQuery({
    queryKey: ["parent-record", parentId],
    enabled: open && !!parentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("parents")
        .select("*")
        .eq("id", parentId!)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: children = [] } = useQuery({
    queryKey: ["parent-children", parentId],
    enabled: open && !!parentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, last_name")
        .or(`parent_1_id.eq.${parentId},parent_2_id.eq.${parentId}`);
      if (error) throw error;
      return (data as any[]) ?? [];
    },
  });

  useEffect(() => {
    if (parent) {
      setForm({
        full_name: parent.full_name ?? "",
        national_id: parent.national_id ?? "",
        phone: parent.phone ?? "",
        email: parent.email ?? "",
      });
    }
  }, [parent]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("parents")
        .update({
          full_name: form.full_name.trim() || null,
          national_id: form.national_id.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
        } as any)
        .eq("id", parentId!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["parent-record", parentId] });
      queryClient.invalidateQueries({ queryKey: ["admin-student"] });
      queryClient.invalidateQueries({ queryKey: ["admin-students"] });
      queryClient.invalidateQueries({ queryKey: ["families-list"] });
      queryClient.invalidateQueries({ queryKey: ["family-details"] });
      toast.success("פרטי ההורה עודכנו — השינוי חל על כל הילדים המקושרים");
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast.error(e?.message?.includes("duplicate") ? "ת.ז. הורה כבר קיימת במערכת" : "שגיאה בעדכון פרטי ההורה"),
  });

  const field = (label: string, key: keyof typeof form, type = "text", dir?: string) => (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        type={type}
        dir={dir}
        className="h-12 rounded-xl"
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto overscroll-contain text-right" dir="rtl">
        <DialogHeader className="text-right">
          <DialogTitle>עריכת פרטי הורה</DialogTitle>
          <DialogDescription>
            ההורה הוא יישות עצמאית — עדכון כאן משנה את הפרטים אצל כל הילדים המקושרים.
          </DialogDescription>
        </DialogHeader>

        {children.length > 1 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              שינוי זה ישפיע על {children.length} ילדים:{" "}
              {children.map((c: any) => `${c.first_name} ${c.last_name}`).join(", ")}
            </span>
          </div>
        )}
        {children.length === 1 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            ילד מקושר: {children[0].first_name} {children[0].last_name}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          {field("שם ההורה", "full_name")}
          {field("ת.ז. הורה", "national_id")}
          {field("טלפון", "phone", "tel", "ltr")}
          {field('דוא"ל', "email", "email", "ltr")}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 mt-2">
          <Button variant="outline" className="h-11 rounded-xl gap-1.5" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" /> ביטול
          </Button>
          <Button
            className="h-11 rounded-xl gap-1.5"
            disabled={mutation.isPending || !form.national_id.trim()}
            onClick={() => mutation.mutate()}
          >
            <Save className="h-4 w-4" /> שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ParentEditDialog;
