import { useEffect, useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { FamilyChildRecord } from "@/hooks/useFamilies";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  parentNationalId: string;
  children: FamilyChildRecord[];
}

const uniq = (arr: (string | null | undefined)[]) =>
  Array.from(new Set(arr.map((v) => (v || "").trim()).filter(Boolean)));

const UnifyParentDetailsDialog = ({
  open,
  onOpenChange,
  parentNationalId,
  children,
}: Props) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);

  // For each child, figure out which parent slot (1 or 2) matches this national id.
  const slots = useMemo(
    () =>
      children.map((c) => {
        const slot: 1 | 2 | null =
          (c.parent_national_id || "").trim() === parentNationalId
            ? 1
            : (c.parent_national_id_2 || "").trim() === parentNationalId
            ? 2
            : null;
        return { child: c, slot };
      }),
    [children, parentNationalId],
  );

  const nameOptions = useMemo(
    () => uniq(slots.map((s) => (s.slot === 2 ? s.child.parent_name_2 : s.child.parent_name))),
    [slots],
  );
  const phoneOptions = useMemo(
    () => uniq(slots.map((s) => (s.slot === 2 ? s.child.parent_phone_2 : s.child.parent_phone))),
    [slots],
  );
  const emailOptions = useMemo(
    () => uniq(slots.map((s) => (s.slot === 2 ? s.child.parent_email_2 : s.child.parent_email))),
    [slots],
  );

  const [nationalId, setNationalId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (open) {
      setNationalId(parentNationalId);
      setName(nameOptions[0] || "");
      setPhone(phoneOptions[0] || "");
      setEmail(emailOptions[0] || "");
    }
  }, [open, parentNationalId, nameOptions, phoneOptions, emailOptions]);

  const idChanged = nationalId.trim() !== parentNationalId;

  const handleSave = async () => {
    const trimmedId = nationalId.trim();
    if (idChanged && !/^\d{9}$/.test(trimmedId)) {
      toast({
        title: "ת.ז. לא תקינה",
        description: "יש להזין 9 ספרות.",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      for (const { child, slot } of slots) {
        if (!slot) continue;
        const patch =
          slot === 1
            ? {
                parent_national_id: trimmedId,
                parent_name: name,
                parent_phone: phone,
                parent_email: email,
              }
            : {
                parent_national_id_2: trimmedId,
                parent_name_2: name,
                parent_phone_2: phone,
                parent_email_2: email,
              };
        const { error } = await supabase.from("students").update(patch).eq("id", child.id);
        if (error) throw error;
      }
      toast({ title: "פרטי ההורה עודכנו בהצלחה" });
      await qc.invalidateQueries({ queryKey: ["families-list"] });
      await qc.invalidateQueries({ queryKey: ["family-details"] });
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

  const Chips = ({
    values,
    onPick,
  }: {
    values: string[];
    onPick: (v: string) => void;
  }) =>
    values.length > 1 ? (
      <div className="flex flex-wrap gap-1 mt-1">
        {values.map((v) => (
          <Badge
            key={v}
            variant="outline"
            className="cursor-pointer hover:bg-muted"
            onClick={() => onPick(v)}
          >
            {v}
          </Badge>
        ))}
      </div>
    ) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle>עריכת פרטי הורה</DialogTitle>
          <DialogDescription>
            השינויים יעודכנו אוטומטית בכל רשומות הילדים במשפחה.
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
                שינוי ת.ז. יעדכן את כל רשומות הילדים ויעביר אותך לכרטיס המשפחה החדש.
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
            <Chips values={nameOptions} onPick={setName} />
          </div>
          <div>
            <Label>טלפון</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              className="h-11 rounded-xl"
            />
            <Chips values={phoneOptions} onPick={setPhone} />
          </div>
          <div>
            <Label>אימייל</Label>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="h-11 rounded-xl"
            />
            <Chips values={emailOptions} onPick={setEmail} />
          </div>

          <div className="text-xs text-muted-foreground">
            יעודכנו {slots.filter((s) => s.slot).length} רשומות תלמידים.
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            ביטול
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "מעדכן..." : "שמור ועדכן"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default UnifyParentDetailsDialog;
