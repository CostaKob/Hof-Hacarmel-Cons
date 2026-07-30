import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import { toast } from "sonner";
import { Pencil, UserCheck } from "lucide-react";

interface Props {
  studentId: string;
  name?: string | null;
  phone?: string | null;
  homeroomClass?: string | null;
}

const StudentHomeroomSection = ({ studentId, name, phone, homeroomClass }: Props) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: name ?? "",
    phone: phone ?? "",
    homeroomClass: homeroomClass ?? "",
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("set_student_homeroom" as any, {
        _student_id: studentId,
        _name: form.name,
        _phone: form.phone,
        _class: form.homeroomClass,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("פרטי המחנכת נשמרו");
      setEditing(false);
      queryClient.invalidateQueries({ queryKey: ["enrollment-details"] });
      queryClient.invalidateQueries({ queryKey: ["teacher-enrollments"] });
    },
    onError: (e: any) => toast.error(e?.message || "שגיאה בשמירת הפרטים"),
  });

  const hasData = !!(name || phone || homeroomClass);

  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold text-foreground flex items-center gap-2">
          <UserCheck className="h-4 w-4 text-primary" />
          מחנכת / כיתת אם
        </h2>
        {!editing && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-xl gap-1.5"
            onClick={() => {
              setForm({ name: name ?? "", phone: phone ?? "", homeroomClass: homeroomClass ?? "" });
              setEditing(true);
            }}
          >
            <Pencil className="h-3.5 w-3.5" /> {hasData ? "עריכה" : "הוספה"}
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-sm">שם המחנכת</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="h-12 rounded-xl"
              placeholder="שם המחנכת"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">טלפון המחנכת</Label>
            <Input
              type="tel"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className="h-12 rounded-xl"
              placeholder="050-0000000"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">כיתת אם</Label>
            <Input
              value={form.homeroomClass}
              onChange={(e) => setForm((f) => ({ ...f, homeroomClass: e.target.value }))}
              className="h-12 rounded-xl"
              placeholder="לדוגמה: ג'2"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              className="flex-1 h-12 rounded-xl"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "שומר..." : "שמירה"}
            </Button>
            <Button type="button" variant="outline" className="h-12 rounded-xl px-5" onClick={() => setEditing(false)}>
              ביטול
            </Button>
          </div>
        </div>
      ) : hasData ? (
        <div className="grid grid-cols-1 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">שם:</span>
            <span className="text-foreground">{name || "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">כיתת אם:</span>
            <span className="text-foreground">{homeroomClass || "—"}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">טלפון:</span>
            {phone ? <PhoneDisplay phone={phone} showIcon /> : <span className="text-foreground">—</span>}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">לא הוזנו פרטי מחנכת. ניתן להוסיף שם, טלפון וכיתת אם.</p>
      )}
    </div>
  );
};

export default StudentHomeroomSection;
