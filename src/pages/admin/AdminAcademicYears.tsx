import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, ArrowLeftRight } from "lucide-react";

const AdminAcademicYears = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const { data: years = [], isLoading } = useQuery({
    queryKey: ["academic-years"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("academic_years")
        .select("*")
        .order("start_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("academic_years").insert({
        name,
        start_date: startDate,
        end_date: endDate,
        is_active: years.length === 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success("שנת לימודים נוצרה בהצלחה");
      setShowForm(false);
      setName("");
      setStartDate("");
      setEndDate("");
    },
    onError: () => toast.error("שגיאה ביצירת שנת לימודים"),
  });

  const activateMutation = useMutation({
    mutationFn: async (yearId: string) => {
      // Deactivate all
      await supabase.from("academic_years").update({ is_active: false }).neq("id", "");
      // Activate selected
      const { error } = await supabase.from("academic_years").update({ is_active: true }).eq("id", yearId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success("שנה פעילה עודכנה");
    },
  });

  const handleAutoFill = () => {
    const now = new Date();
    const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    setName(`${year}-${year + 1}`);
    setStartDate(`${year}-09-01`);
    setEndDate(`${year + 1}-08-31`);
  };

  return (
    <AdminLayout title="שנות לימודים" backPath="/admin">
      <div className="space-y-4 max-w-2xl">
        <div className="flex gap-2">
          <Button className="h-12 rounded-xl text-base" onClick={() => { setShowForm(!showForm); if (!showForm) handleAutoFill(); }}>
            <Plus className="h-4 w-4" /> שנה חדשה
          </Button>
          {years.length > 0 && (
            <Button variant="outline" className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/year-transition")}>
              <ArrowLeftRight className="h-4 w-4" /> מעבר שנה
            </Button>
          )}
        </div>

        {showForm && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <h2 className="font-semibold text-foreground text-base">שנת לימודים חדשה</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>שם</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-12 rounded-xl" placeholder="2025-2026" />
              </div>
              <div className="space-y-1.5">
                <Label>תאריך התחלה</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-12 rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label>תאריך סיום</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="h-12 rounded-xl" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => createMutation.mutate()} disabled={!name || !startDate || !endDate || createMutation.isPending} className="h-12 rounded-xl">
                {createMutation.isPending ? "יוצר..." : "צור שנה"}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)} className="h-12 rounded-xl">ביטול</Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : years.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין שנות לימודים. צור את השנה הראשונה.</p>
        ) : (
          <div className="space-y-2">
            {years.map((y: any) => (
              <div key={y.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm">
                <div>
                  <p className="font-semibold text-foreground">{y.name}</p>
                  <p className="text-sm text-muted-foreground">{y.start_date} — {y.end_date}</p>
                </div>
                <div className="flex items-center gap-2">
                  {y.is_active ? (
                    <Badge className="rounded-lg">פעילה</Badge>
                  ) : (
                    <Button variant="outline" size="sm" className="rounded-lg" onClick={() => activateMutation.mutate(y.id)}>
                      הפעל
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminAcademicYears;
