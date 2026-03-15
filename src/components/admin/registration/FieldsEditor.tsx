import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, Pencil, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { KNOWN_FIELD_KEYS, FIELD_TYPES, DATA_SOURCES } from "@/lib/registrationFieldKeys";

interface FieldDef {
  id: string;
  field_key: string;
  label: string;
  field_type: string;
  is_required: boolean;
  options: { value: string; label: string }[];
  sort_order: number;
  is_active: boolean;
  help_text: string;
  section_title: string;
  placeholder: string;
  data_source: string;
}

const emptyField = (): FieldDef => ({
  id: crypto.randomUUID(),
  field_key: "",
  label: "",
  field_type: "text",
  is_required: false,
  options: [],
  sort_order: 0,
  is_active: true,
  help_text: "",
  section_title: "",
  placeholder: "",
  data_source: "",
});

const FieldsEditor = ({ pageId }: { pageId: string }) => {
  const queryClient = useQueryClient();
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [editField, setEditField] = useState<FieldDef | null>(null);
  const [optionInput, setOptionInput] = useState("");

  const { data: dbFields = [], isLoading } = useQuery({
    queryKey: ["registration-page-fields", pageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registration_page_fields")
        .select("*")
        .eq("page_id", pageId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    setFields(
      dbFields.map((f: any) => ({
        id: f.id,
        field_key: f.field_key,
        label: f.label,
        field_type: f.field_type,
        is_required: f.is_required,
        options: Array.isArray(f.options) ? f.options : [],
        sort_order: f.sort_order,
        is_active: f.is_active,
        help_text: f.help_text || "",
        section_title: f.section_title || "",
        placeholder: f.placeholder || "",
        data_source: f.data_source || "",
      }))
    );
    setHasChanges(false);
  }, [dbFields]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await supabase.from("registration_page_fields").delete().eq("page_id", pageId);
      if (fields.length > 0) {
        const { error } = await supabase
          .from("registration_page_fields")
          .insert(
            fields.map((f, i) => ({
              page_id: pageId,
              field_key: f.field_key,
              label: f.label,
              field_type: f.field_type,
              is_required: f.is_required,
              options: f.options,
              sort_order: i,
              is_active: f.is_active,
              help_text: f.help_text,
              section_title: f.section_title,
              placeholder: f.placeholder,
              data_source: f.data_source,
            }))
          );
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("שדות נשמרו");
      queryClient.invalidateQueries({ queryKey: ["registration-page-fields", pageId] });
      setHasChanges(false);
    },
    onError: () => toast.error("שגיאה בשמירה"),
  });

  const addField = () => {
    const f = emptyField();
    f.sort_order = fields.length;
    setEditField(f);
  };

  const removeField = (id: string) => {
    setFields(fields.filter((f) => f.id !== id));
    setHasChanges(true);
  };

  const moveField = (index: number, dir: "up" | "down") => {
    const newIndex = dir === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= fields.length) return;
    const updated = [...fields];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setFields(updated);
    setHasChanges(true);
  };

  const toggleActive = (id: string) => {
    setFields(fields.map((f) => (f.id === id ? { ...f, is_active: !f.is_active } : f)));
    setHasChanges(true);
  };

  const saveFieldFromDialog = () => {
    if (!editField?.field_key || !editField?.label) {
      toast.error("יש למלא מפתח שדה ותווית");
      return;
    }
    const existing = fields.findIndex((f) => f.id === editField.id);
    if (existing >= 0) {
      const updated = [...fields];
      updated[existing] = editField;
      setFields(updated);
    } else {
      setFields([...fields, editField]);
    }
    setEditField(null);
    setHasChanges(true);
  };

  const addOption = () => {
    if (!optionInput.trim() || !editField) return;
    const val = optionInput.trim();
    setEditField({
      ...editField,
      options: [...editField.options, { value: val, label: val }],
    });
    setOptionInput("");
  };

  const removeOption = (idx: number) => {
    if (!editField) return;
    setEditField({
      ...editField,
      options: editField.options.filter((_, i) => i !== idx),
    });
  };

  if (isLoading) return <p className="text-center text-muted-foreground py-6">טוען...</p>;

  const needsOptions = editField && ["select", "multiselect", "radio"].includes(editField.field_type) && !editField.data_source;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">שדות הטופס</CardTitle>
          <Button variant="outline" size="sm" onClick={addField}>
            <Plus className="h-4 w-4 ml-1" />
            הוסף שדה
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              אין שדות. לחצו &quot;הוסף שדה&quot; כדי להתחיל.
            </p>
          )}
          {fields.map((field, index) => {
            const typeDef = FIELD_TYPES.find((t) => t.value === field.field_type);
            return (
              <div key={field.id}>
                {field.section_title && (
                  <p className="text-xs font-bold text-primary mt-3 mb-1 border-b pb-1">{field.section_title}</p>
                )}
                <div className={`flex items-center gap-2 rounded-lg border p-3 transition-opacity ${!field.is_active ? "opacity-40" : ""}`}>
                  <span className="text-xs text-muted-foreground w-5 shrink-0">{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{field.label || "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {field.field_key} · {typeDef?.label || field.field_type}
                      {field.is_required && " · חובה"}
                      {field.data_source && ` · ${DATA_SOURCES.find((d) => d.value === field.data_source)?.label}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleActive(field.id)}>
                      {field.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditField({ ...field }); setOptionInput(""); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === 0} onClick={() => moveField(index, "up")}>
                      <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" disabled={index === fields.length - 1} onClick={() => moveField(index, "down")}>
                      <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => removeField(field.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {fields.length > 0 && (
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !hasChanges} className="w-full mt-4">
              <Save className="h-4 w-4 ml-2" />
              {saveMutation.isPending ? "שומר..." : "שמור שדות"}
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Field editor dialog */}
      <Dialog open={!!editField} onOpenChange={(o) => !o && setEditField(null)}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{fields.find((f) => f.id === editField?.id) ? "עריכת שדה" : "הוספת שדה"}</DialogTitle>
          </DialogHeader>
          {editField && (
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>מפתח שדה (field_key)</Label>
                <Select dir="rtl" value={editField.field_key} onValueChange={(v) => {
                  const known = KNOWN_FIELD_KEYS.find((k) => k.key === v);
                  setEditField({ ...editField, field_key: v, label: editField.label || known?.label || "" });
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר מפתח..." />
                  </SelectTrigger>
                  <SelectContent>
                    {KNOWN_FIELD_KEYS.map((k) => (
                      <SelectItem key={k.key} value={k.key}>{k.label} ({k.key})</SelectItem>
                    ))}
                    <SelectItem value="__custom">מפתח מותאם אישית...</SelectItem>
                  </SelectContent>
                </Select>
                {editField.field_key === "__custom" && (
                  <Input
                    placeholder="custom_field_name"
                    dir="ltr"
                    className="mt-1"
                    onChange={(e) => setEditField({ ...editField, field_key: e.target.value })}
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label>תווית (Label)</Label>
                <Input value={editField.label} onChange={(e) => setEditField({ ...editField, label: e.target.value })} dir="rtl" />
              </div>

              <div className="space-y-1.5">
                <Label>סוג שדה</Label>
                <Select dir="rtl" value={editField.field_type} onValueChange={(v) => setEditField({ ...editField, field_type: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>כותרת קטע (מקבץ שדות)</Label>
                <Input value={editField.section_title} onChange={(e) => setEditField({ ...editField, section_title: e.target.value })} placeholder='למשל: "פרטי התלמיד/ה"' dir="rtl" />
                <p className="text-xs text-muted-foreground">כותרת חדשה תתחיל מקבץ שדות חדש בטופס</p>
              </div>

              <div className="space-y-1.5">
                <Label>Placeholder</Label>
                <Input value={editField.placeholder} onChange={(e) => setEditField({ ...editField, placeholder: e.target.value })} dir="rtl" />
              </div>

              <div className="space-y-1.5">
                <Label>טקסט עזרה</Label>
                <Input value={editField.help_text} onChange={(e) => setEditField({ ...editField, help_text: e.target.value })} dir="rtl" />
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={editField.is_required} onCheckedChange={(v) => setEditField({ ...editField, is_required: v })} />
                <Label>שדה חובה</Label>
              </div>

              <div className="flex items-center gap-3">
                <Switch checked={editField.is_active} onCheckedChange={(v) => setEditField({ ...editField, is_active: v })} />
                <Label>שדה פעיל</Label>
              </div>

              {/* Data source for select/multiselect */}
              {["select", "multiselect", "radio"].includes(editField.field_type) && (
                <div className="space-y-1.5">
                  <Label>מקור נתונים</Label>
                  <Select dir="rtl" value={editField.data_source} onValueChange={(v) => setEditField({ ...editField, data_source: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATA_SOURCES.map((d) => (
                        <SelectItem key={d.value} value={d.value || "__none"}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Manual options */}
              {needsOptions && (
                <div className="space-y-2">
                  <Label>אפשרויות</Label>
                  <div className="flex gap-2">
                    <Input value={optionInput} onChange={(e) => setOptionInput(e.target.value)} placeholder="הוסף אפשרות" dir="rtl"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addOption}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {editField.options.map((opt, i) => (
                      <Badge key={i} variant="secondary" className="cursor-pointer" onClick={() => removeOption(i)}>
                        {opt.label} ✕
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditField(null)}>ביטול</Button>
            <Button onClick={saveFieldFromDialog}>שמור שדה</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default FieldsEditor;
