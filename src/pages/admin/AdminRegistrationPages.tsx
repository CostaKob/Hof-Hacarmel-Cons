import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { DEFAULT_TITLE, DEFAULT_APPROVAL_TEXT, DEFAULT_SUCCESS_MESSAGE, DEFAULT_SECTIONS, DEFAULT_FIELDS } from "@/lib/registrationDefaults";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Copy, Edit, FileText, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const AdminRegistrationPages = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [duplicateSource, setDuplicateSource] = useState<any>(null);
  const [duplicateYearId, setDuplicateYearId] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any>(null);

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ["registration-pages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("registration_pages")
        .select("*, academic_years(name, is_active)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: years = [] } = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("id, name, is_active")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const usedYearIds = new Set(pages.map((p: any) => p.academic_year_id).filter(Boolean));
  const availableYears = years.filter((y) => !usedYearIds.has(y.id));

  const createMutation = useMutation({
    mutationFn: async (yearId: string) => {
      const yearObj = years.find((y) => y.id === yearId);
      const titleWithYear = yearObj ? `${DEFAULT_TITLE} ${yearObj.name}` : DEFAULT_TITLE;

      // Create the page
      const { data, error } = await supabase
        .from("registration_pages")
        .insert({
          academic_year_id: yearId,
          title: titleWithYear,
          is_open: false,
          approval_text: DEFAULT_APPROVAL_TEXT,
          success_message: DEFAULT_SUCCESS_MESSAGE,
        })
        .select("id")
        .single();
      if (error) throw error;

      // Seed default sections
      if (DEFAULT_SECTIONS.length > 0) {
        const { error: secErr } = await supabase
          .from("registration_page_sections")
          .insert(DEFAULT_SECTIONS.map((s, i) => ({
            page_id: data.id,
            title: s.title,
            content: s.content,
            sort_order: i,
          })));
        if (secErr) throw secErr;
      }

      // Seed default fields
      if (DEFAULT_FIELDS.length > 0) {
        const { error: fldErr } = await supabase
          .from("registration_page_fields")
          .insert(DEFAULT_FIELDS.map((f, i) => ({
            page_id: data.id,
            field_key: f.field_key,
            label: f.label,
            field_type: f.field_type,
            is_required: f.is_required,
            options: f.options,
            sort_order: i,
            is_active: true,
            help_text: f.help_text,
            section_title: f.section_title,
            placeholder: f.placeholder,
            data_source: f.data_source,
          })));
        if (fldErr) throw fldErr;
      }

      return data;
    },
    onSuccess: (data) => {
      toast.success("דף הרשמה חדש נוצר עם כל התוכן והשדות");
      queryClient.invalidateQueries({ queryKey: ["registration-pages"] });
      navigate(`/admin/registration-pages/${data.id}`);
    },
    onError: () => toast.error("שגיאה ביצירת דף הרשמה"),
  });

  const duplicateMutation = useMutation({
    mutationFn: async ({ sourceId, targetYearId }: { sourceId: string; targetYearId: string }) => {
      // Load source page
      const { data: source, error: e1 } = await supabase
        .from("registration_pages")
        .select("*")
        .eq("id", sourceId)
        .single();
      if (e1) throw e1;

      // Create new page
      const { data: newPage, error: e2 } = await supabase
        .from("registration_pages")
        .insert({
          academic_year_id: targetYearId,
          title: source.title,
          is_open: false,
          approval_text: source.approval_text,
          success_message: source.success_message,
        })
        .select("id")
        .single();
      if (e2) throw e2;

      // Copy sections
      const { data: sections } = await supabase
        .from("registration_page_sections")
        .select("*")
        .eq("page_id", sourceId)
        .order("sort_order");
      if (sections?.length) {
        const { error: e3 } = await supabase
          .from("registration_page_sections")
          .insert(sections.map((s: any) => ({
            page_id: newPage.id,
            title: s.title,
            content: s.content,
            sort_order: s.sort_order,
          })));
        if (e3) throw e3;
      }

      // Copy fields
      const { data: fields } = await supabase
        .from("registration_page_fields")
        .select("*")
        .eq("page_id", sourceId)
        .order("sort_order");
      if (fields?.length) {
        const { error: e4 } = await supabase
          .from("registration_page_fields")
          .insert(fields.map((f: any) => ({
            page_id: newPage.id,
            field_key: f.field_key,
            label: f.label,
            field_type: f.field_type,
            is_required: f.is_required,
            options: f.options,
            sort_order: f.sort_order,
            is_active: f.is_active,
            help_text: f.help_text,
            section_title: f.section_title,
            placeholder: f.placeholder,
            data_source: f.data_source,
          })));
        if (e4) throw e4;
      }

      return newPage;
    },
    onSuccess: (data) => {
      toast.success("דף הרשמה שוכפל בהצלחה");
      queryClient.invalidateQueries({ queryKey: ["registration-pages"] });
      setDuplicateSource(null);
      navigate(`/admin/registration-pages/${data.id}`);
    },
    onError: () => toast.error("שגיאה בשכפול דף הרשמה"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (pageId: string) => {
      // Sections and fields are deleted via CASCADE
      const { error } = await supabase.from("registration_pages").delete().eq("id", pageId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("דף הרשמה נמחק");
      queryClient.invalidateQueries({ queryKey: ["registration-pages"] });
      setDeleteTarget(null);
    },
    onError: () => toast.error("שגיאה במחיקה"),
  });

  return (
    <AdminLayout title="דפי הרשמה" backPath="/admin">
      <div className="space-y-4">
        {/* Create new */}
        <div className="flex flex-wrap gap-2">
          {availableYears.length > 0 ? (
            <div className="flex gap-2 items-center">
              <Select dir="rtl" onValueChange={(v) => createMutation.mutate(v)}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="צור דף הרשמה לשנה..." />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name} {y.is_active ? "(פעילה)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Plus className="h-4 w-4 text-muted-foreground" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">כל השנים כבר מקושרות לדף הרשמה</p>
          )}
        </div>

        {/* Pages list */}
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : pages.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין דפי הרשמה עדיין</p>
        ) : (
          <div className="space-y-2">
            {pages.map((page: any) => {
              const year = page.academic_years;
              return (
                <Card key={page.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="py-4 flex items-center gap-3">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {page.title || year?.name || "ללא כותרת"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {year?.name || "ללא שנה"} {year?.is_active ? "· שנה פעילה" : ""}
                      </p>
                    </div>
                    <Badge variant={page.is_open ? "default" : "secondary"}>
                      {page.is_open ? "פתוח" : "סגור"}
                    </Badge>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => navigate(`/admin/registration-pages/${page.id}`)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => { setDuplicateSource(page); setDuplicateYearId(""); }}>
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(page)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Duplicate dialog */}
      <Dialog open={!!duplicateSource} onOpenChange={(o) => !o && setDuplicateSource(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>שכפול דף הרשמה</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              שכפול דף ההרשמה "{duplicateSource?.title || duplicateSource?.academic_years?.name}" לשנה חדשה.
              כל הסעיפים והשדות יועתקו.
            </p>
            <div className="space-y-1.5">
              <Label>שנת יעד</Label>
              <Select dir="rtl" value={duplicateYearId} onValueChange={setDuplicateYearId}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר שנה" />
                </SelectTrigger>
                <SelectContent>
                  {availableYears.map((y) => (
                    <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDuplicateSource(null)}>ביטול</Button>
            <Button
              disabled={!duplicateYearId || duplicateMutation.isPending}
              onClick={() => duplicateMutation.mutate({ sourceId: duplicateSource.id, targetYearId: duplicateYearId })}
            >
              {duplicateMutation.isPending ? "משכפל..." : "שכפל"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>מחיקת דף הרשמה</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm text-muted-foreground">
              האם למחוק את דף ההרשמה "{deleteTarget?.title || deleteTarget?.academic_years?.name}"?
              כל הסעיפים והשדות ימחקו לצמיתות. הרשמות קיימות שנשלחו לא ימחקו.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>ביטול</Button>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending ? "מוחק..." : "מחק"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminRegistrationPages;
