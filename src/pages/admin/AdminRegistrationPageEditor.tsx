import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Save, Eye } from "lucide-react";
import { toast } from "sonner";
import SectionsEditor from "@/components/admin/registration/SectionsEditor";
import FieldsEditor from "@/components/admin/registration/FieldsEditor";

const AdminRegistrationPageEditor = () => {
  const { pageId } = useParams<{ pageId: string }>();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [approvalText, setApprovalText] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const { data: page, isLoading } = useQuery({
    queryKey: ["registration-page", pageId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registration_pages")
        .select("*, academic_years(name)")
        .eq("id", pageId!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!pageId,
  });

  useEffect(() => {
    if (page) {
      setTitle(page.title || "");
      setIsOpen(page.is_open || false);
      setApprovalText(page.approval_text || "");
      setSuccessMessage(page.success_message || "");
    }
  }, [page]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("registration_pages")
        .update({ title, is_open: isOpen, approval_text: approvalText, success_message: successMessage })
        .eq("id", pageId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("הגדרות נשמרו");
      queryClient.invalidateQueries({ queryKey: ["registration-page", pageId] });
    },
    onError: () => toast.error("שגיאה בשמירה"),
  });

  if (isLoading) {
    return (
      <AdminLayout title="טוען..." backPath="/admin/registration-pages">
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      </AdminLayout>
    );
  }

  const yearName = (page as any)?.academic_years?.name || "";

  return (
    <AdminLayout title={`עריכת דף הרשמה — ${yearName}`} backPath="/admin/registration-pages">
      <Tabs defaultValue="settings" dir="rtl" className="space-y-4">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="settings">הגדרות</TabsTrigger>
          <TabsTrigger value="sections">סעיפי מידע</TabsTrigger>
          <TabsTrigger value="fields">שדות טופס</TabsTrigger>
        </TabsList>

        {/* Settings tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div className="flex items-center gap-3">
                <Switch checked={isOpen} onCheckedChange={setIsOpen} />
                <Label className="text-sm font-medium">
                  {isOpen ? "טופס הרשמה פעיל ✅" : "טופס הרשמה סגור ❌"}
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label>כותרת הטופס</Label>
                <Textarea
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="כותרת שתופיע בראש דף ההרשמה..."
                  className="min-h-[80px]"
                  dir="rtl"
                />
              </div>

              <div className="space-y-1.5">
                <Label>טקסט אישור (צ׳קבוקס)</Label>
                <Input
                  value={approvalText}
                  onChange={(e) => setApprovalText(e.target.value)}
                  dir="rtl"
                />
              </div>

              <div className="space-y-1.5">
                <Label>הודעת הצלחה (לאחר שליחה)</Label>
                <Textarea
                  value={successMessage}
                  onChange={(e) => setSuccessMessage(e.target.value)}
                  className="min-h-[60px]"
                  dir="rtl"
                />
              </div>

              <div className="flex gap-3">
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  <Save className="h-4 w-4 ml-2" />
                  {saveMutation.isPending ? "שומר..." : "שמור הגדרות"}
                </Button>
                <Button variant="outline" onClick={() => window.open("/register", "_blank")}>
                  <Eye className="h-4 w-4 ml-1" />
                  תצוגה מקדימה
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sections tab */}
        <TabsContent value="sections">
          <SectionsEditor pageId={pageId!} />
        </TabsContent>

        {/* Fields tab */}
        <TabsContent value="fields">
          <FieldsEditor pageId={pageId!} />
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
};

export default AdminRegistrationPageEditor;
