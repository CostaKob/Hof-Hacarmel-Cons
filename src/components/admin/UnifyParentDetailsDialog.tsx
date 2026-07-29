import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { FamilyChildRecord } from "@/hooks/useFamilies";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentNationalId: string;
  children: FamilyChildRecord[];
}

const UnifyParentDetailsDialog = ({
  open,
  onOpenChange,
  parentNationalId,
  children: familyChildren,
}: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // Fetch the parents row (source of truth)
  const { data: parentRow } = useQuery({
    queryKey: ["parent-by-nid", parentNationalId],
    enabled: open && !!parentNationalId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("parents")
        .select("*")
        .eq("national_id", parentNationalId)
        .maybeSingle();
      if (error) throw error;
      return data as {
        id: string;
        national_id: string;
        full_name: string | null;
        phone: string | null;
        email: string | null;
      } | null;
    },
  });

  const [nationalId, setNationalId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (open && parentRow) {
      setNationalId(parentRow.national_id);
      setName(parentRow.full_name || "");
      setPhone(parentRow.phone || "");
      setEmail(parentRow.email || "");
    } else if (open) {
      setNationalId(parentNationalId);
      setName("");
      setPhone("");
      setEmail("");
    }
  }, [open, parentRow, parentNationalId]);

  const idChanged = nationalId.trim() !== parentNationalId;

  const handleSave = async () => {
    const trimmedId = nationalId.trim();
    if (!/^\d{9}$/.test(trimmedId)) {
      toast({
        title: "ת.ז. לא תקינה",
        description: "יש להזין 9 ספרות.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      if (!parentRow) {
        // Should not happen post-migration, but handle gracefully by upserting.
        const { error } = await (supabase as any)
          .from("parents")
          .upsert(
            { national_id: trimmedId, full_name: name, phone, email },
            { onConflict: "national_id" },
          );
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("parents")
          .update({
            national_id: trimmedId,
            full_name: name,
            phone,
            email,
          })
          .eq("id", parentRow.id);
        if (error) throw error;
      }

      toast({ title: "פרטי ההורה עודכנו בכל הילדים" });
      await qc.invalidateQueries({ queryKey: ["families-list"] });
      await qc.invalidateQueries({ queryKey: ["family-details"] });
      await qc.invalidateQueries({ queryKey: ["parent-by-nid"] });
      onOpenChange(false);
      if (idChanged) {
        navigate(`/admin/families/${encodeURIComponent(trimmedId)}`, { replace: true });
      }
    } catch (e: any) {
      toast({
        title: "שגיאה בעדכון",
        description: e.message ?? String(e),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>עריכת פרטי הורה</DialogTitle>
          <DialogDescription>
            השינויים נשמרים ברשומת ההורה המרכזית ומתעדכנים אוטומטית בכל הילדים המקושרים
            ({familyChildren.length}).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>ת.ז. הורה</Label>
            <Input
              value={nationalId}
              onChange={(e) => setNationalId(e.target.value.replace(/\D/g, "").slice(0, 9))}
              dir="ltr"
              inputMode="numeric"
              maxLength={9}
              className="h-11 rounded-xl font-mono"
            />
            {idChanged && (
              <p className="text-xs text-amber-600 mt-1">
                שינוי ת.ז. יעביר אותך לכרטיס המשפחה החדש.
              </p>
            )}
          </div>
          <div>
            <Label>שם ההורה</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-11 rounded-xl"
            />
          </div>
          <div>
            <Label>טלפון</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              className="h-11 rounded-xl"
            />
          </div>
          <div>
            <Label>אימייל</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="h-11 rounded-xl"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ביטול
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "מעדכן..." : "שמור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UnifyParentDetailsDialog;
