import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, GripVertical, Save, Eye, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";

interface InfoSection {
  id: string;
  title: string;
  content: string;
}

const generateId = () => Math.random().toString(36).slice(2, 10);

const AdminRegistrationSettings = () => {
  const queryClient = useQueryClient();
  const [formTitle, setFormTitle] = useState("");
  const [approvalText, setApprovalText] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [sections, setSections] = useState<InfoSection[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string>("");
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: years = [] } = useQuery({
    queryKey: ["academic-years-for-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, name, is_active")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Auto-select active year
  useEffect(() => {
    if (!selectedYearId && years.length) {
      const active = years.find((y) => y.is_active);
      if (active) setSelectedYearId(active.id);
      else setSelectedYearId(years[0].id);
    }
  }, [years, selectedYearId]);

  const { data: settings, isLoading } = useQuery({
    queryKey: ["registration-settings", selectedYearId],
    queryFn: async () => {
      if (!selectedYearId) return null;
      const { data, error } = await supabase
        .from("registration_form_settings" as any)
        .select("*")
        .eq("academic_year_id", selectedYearId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!selectedYearId,
  });

  // Populate form when settings load
  useEffect(() => {
    if (settings) {
      setFormTitle(settings.form_title || "");
      setApprovalText(settings.approval_text || "");
      setIsOpen(settings.is_open || false);
      setSections(
        Array.isArray(settings.info_sections)
          ? (settings.info_sections as InfoSection[]).map((s) => ({
              ...s,
              id: s.id || generateId(),
            }))
          : []
      );
      setSettingsId(settings.id);
    } else {
      setFormTitle("");
      setApprovalText("קראתי את המידע ואני מאשר/ת את תנאי ההרשמה והלימודים");
      setIsOpen(false);
      setSections([]);
      setSettingsId(null);
    }
    setHasChanges(false);
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        academic_year_id: selectedYearId,
        form_title: formTitle,
        approval_text: approvalText,
        is_open: isOpen,
        info_sections: sections.map(({ id, title, content }) => ({ id, title, content })),
      };

      if (settingsId) {
        const { error } = await supabase
          .from("registration_form_settings" as any)
          .update(payload)
          .eq("id", settingsId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("registration_form_settings" as any)
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("ההגדרות נשמרו בהצלחה");
      queryClient.invalidateQueries({ queryKey: ["registration-settings"] });
      setHasChanges(false);
    },
    onError: () => {
      toast.error("שגיאה בשמירת ההגדרות");
    },
  });

  const markChanged = () => setHasChanges(true);

  const addSection = () => {
    setSections([...sections, { id: generateId(), title: "", content: "" }]);
    markChanged();
  };

  const removeSection = (id: string) => {
    setSections(sections.filter((s) => s.id !== id));
    markChanged();
  };

  const updateSection = (id: string, field: "title" | "content", value: string) => {
    setSections(sections.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
    markChanged();
  };

  const moveSection = (index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sections.length) return;
    const updated = [...sections];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setSections(updated);
    markChanged();
  };

  const selectedYear = years.find((y) => y.id === selectedYearId);

  return (
    <AdminLayout title="הגדרות טופס הרשמה" backPath="/admin/registrations">
      <div className="space-y-6">
        {/* Year selector + toggle */}
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
              <div className="flex-1 space-y-1.5">
                <Label className="text-sm font-medium">שנת לימודים</Label>
                <Select dir="rtl" value={selectedYearId} onValueChange={(v) => setSelectedYearId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר שנה" />
                  </SelectTrigger>
                  <SelectContent>
                    {years.map((y) => (
                      <SelectItem key={y.id} value={y.id}>
                        {y.name} {y.is_active ? "(פעילה)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-3 pb-1">
                <Switch
                  checked={isOpen}
                  onCheckedChange={(v) => { setIsOpen(v); markChanged(); }}
                />
                <Label className="text-sm font-medium">
                  {isOpen ? "טופס הרשמה פעיל ✅" : "טופס הרשמה סגור ❌"}
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form title */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">כותרת הטופס</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={formTitle}
              onChange={(e) => { setFormTitle(e.target.value); markChanged(); }}
              placeholder="הזן כותרת לטופס ההרשמה..."
              className="min-h-[80px] text-base"
              dir="rtl"
            />
          </CardContent>
        </Card>

        {/* Info Sections */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">סעיפי מידע ותנאים</CardTitle>
            <Button variant="outline" size="sm" onClick={addSection}>
              <Plus className="h-4 w-4 ml-1" />
              הוסף סעיף
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {sections.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">
                אין סעיפים עדיין. לחצו &quot;הוסף סעיף&quot; כדי להתחיל.
              </p>
            )}
            {sections.map((section, index) => (
              <div key={section.id} className="border rounded-lg p-4 space-y-3 bg-muted/20">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">סעיף {index + 1}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={index === 0}
                      onClick={() => moveSection(index, "up")}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={index === sections.length - 1}
                      onClick={() => moveSection(index, "down")}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => removeSection(section.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">כותרת הסעיף</Label>
                  <Input
                    value={section.title}
                    onChange={(e) => updateSection(section.id, "title", e.target.value)}
                    placeholder="למשל: סדרי הלימוד"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm">תוכן</Label>
                  <Textarea
                    value={section.content}
                    onChange={(e) => updateSection(section.id, "content", e.target.value)}
                    placeholder="הזן את תוכן הסעיף. כל שורה חדשה תוצג כפסקה נפרדת. שורות שמתחילות ב • יוצגו כרשימה."
                    className="min-h-[120px] text-sm"
                    dir="rtl"
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Approval text */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">טקסט אישור</CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              value={approvalText}
              onChange={(e) => { setApprovalText(e.target.value); markChanged(); }}
              placeholder="קראתי את המידע ואני מאשר/ת..."
              dir="rtl"
            />
            <p className="text-xs text-muted-foreground mt-1">
              הטקסט שיופיע ליד הצ׳קבוקס שההורה חייב לאשר
            </p>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !hasChanges}
            className="flex-1 h-12 text-base"
          >
            <Save className="h-5 w-5 ml-2" />
            {saveMutation.isPending ? "שומר..." : "שמור הגדרות"}
          </Button>
          <Button
            variant="outline"
            className="h-12"
            onClick={() => window.open("/register", "_blank")}
          >
            <Eye className="h-5 w-5 ml-1" />
            תצוגה מקדימה
          </Button>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminRegistrationSettings;
