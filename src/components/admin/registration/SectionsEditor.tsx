import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, ArrowUp, ArrowDown, Save, GripVertical } from "lucide-react";
import { toast } from "sonner";

interface Section {
  id: string;
  title: string;
  content: string;
  sort_order: number;
  isNew?: boolean;
}

const SectionsEditor = ({ pageId }: { pageId: string }) => {
  const queryClient = useQueryClient();
  const [sections, setSections] = useState<Section[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const { data: dbSections = [], isLoading } = useQuery({
    queryKey: ["registration-page-sections", pageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registration_page_sections")
        .select("*")
        .eq("page_id", pageId)
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    setSections(dbSections.map((s) => ({ id: s.id, title: s.title, content: s.content, sort_order: s.sort_order })));
    setHasChanges(false);
  }, [dbSections]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      // Delete all existing
      await supabase.from("registration_page_sections").delete().eq("page_id", pageId);
      // Insert all
      if (sections.length > 0) {
        const { error } = await supabase
          .from("registration_page_sections")
          .insert(sections.map((s, i) => ({
            page_id: pageId,
            title: s.title,
            content: s.content,
            sort_order: i,
          })));
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("סעיפים נשמרו");
      queryClient.invalidateQueries({ queryKey: ["registration-page-sections", pageId] });
      setHasChanges(false);
    },
    onError: () => toast.error("שגיאה בשמירה"),
  });

  const addSection = () => {
    setSections([...sections, { id: crypto.randomUUID(), title: "", content: "", sort_order: sections.length, isNew: true }]);
    setHasChanges(true);
  };

  const removeSection = (id: string) => {
    setSections(sections.filter((s) => s.id !== id));
    setHasChanges(true);
  };

  const updateSection = (id: string, field: "title" | "content", value: string) => {
    setSections(sections.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
    setHasChanges(true);
  };

  const moveSection = (index: number, dir: "up" | "down") => {
    const newIndex = dir === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sections.length) return;
    const updated = [...sections];
    [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
    setSections(updated);
    setHasChanges(true);
  };

  if (isLoading) return <p className="text-center text-muted-foreground py-6">טוען...</p>;

  return (
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
            אין סעיפים. לחצו &quot;הוסף סעיף&quot; כדי להתחיל.
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
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === 0} onClick={() => moveSection(index, "up")}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled={index === sections.length - 1} onClick={() => moveSection(index, "down")}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => removeSection(section.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">כותרת</Label>
              <Input value={section.title} onChange={(e) => updateSection(section.id, "title", e.target.value)} placeholder="כותרת הסעיף" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">תוכן</Label>
              <Textarea
                value={section.content}
                onChange={(e) => updateSection(section.id, "content", e.target.value)}
                placeholder="תוכן הסעיף. שורות שמתחילות ב • יוצגו כרשימה."
                className="min-h-[120px] text-sm"
                dir="rtl"
              />
            </div>
          </div>
        ))}

        {sections.length > 0 && (
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !hasChanges} className="w-full">
            <Save className="h-4 w-4 ml-2" />
            {saveMutation.isPending ? "שומר..." : "שמור סעיפים"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default SectionsEditor;
