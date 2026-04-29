import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Users, CalendarDays, Archive, Eye, BookOpen, Star, ArrowUpCircle, Trash2, Link2, Copy } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";

const AdminAcademicYears = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
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

  const { data: stats = {} } = useQuery({
    queryKey: ["academic-years-stats"],
    queryFn: async () => {
      const [{ data: enrollments }, { data: reports }] = await Promise.all([
        supabase.from("enrollments").select("academic_year_id, student_id"),
        supabase.from("reports").select("academic_year_id, id"),
      ]);

      const result: Record<string, { students: number; enrollments: number; reports: number }> = {};

      const studentSets: Record<string, Set<string>> = {};
      const enrollmentCounts: Record<string, number> = {};
      (enrollments ?? []).forEach((e: any) => {
        const yid = e.academic_year_id;
        if (!yid) return;
        if (!studentSets[yid]) studentSets[yid] = new Set();
        studentSets[yid].add(e.student_id);
        enrollmentCounts[yid] = (enrollmentCounts[yid] ?? 0) + 1;
      });

      Object.keys(studentSets).forEach((yid) => {
        if (!result[yid]) result[yid] = { students: 0, enrollments: 0, reports: 0 };
        result[yid].students = studentSets[yid].size;
        result[yid].enrollments = enrollmentCounts[yid] ?? 0;
      });

      (reports ?? []).forEach((r: any) => {
        const yid = r.academic_year_id;
        if (!yid) return;
        if (!result[yid]) result[yid] = { students: 0, enrollments: 0, reports: 0 };
        result[yid].reports++;
      });

      years.forEach((y: any) => {
        if (!result[y.id]) result[y.id] = { students: 0, enrollments: 0, reports: 0 };
      });

      return result;
    },
    enabled: years.length > 0,
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
      queryClient.invalidateQueries({ queryKey: ["academic-years-stats"] });
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
      // The DB trigger handles deactivating all others
      const { error } = await supabase.from("academic_years").update({ is_active: true }).eq("id", yearId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success("שנה פעילה עודכנה");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (yearId: string) => {
      const { error } = await supabase.from("academic_years").delete().eq("id", yearId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      queryClient.invalidateQueries({ queryKey: ["academic-years-stats"] });
      toast.success("שנת לימודים נמחקה");
    },
    onError: (err: any) => {
      if (err?.message?.includes("foreign key") || err?.message?.includes("violates")) {
        toast.error("לא ניתן למחוק שנה שיש בה נתונים (רישומים, דיווחים וכו׳)");
      } else {
        toast.error("שגיאה במחיקת שנת לימודים");
      }
    },
  });

  const toggleRegistrationMutation = useMutation({
    mutationFn: async ({ yearId, open }: { yearId: string; open: boolean }) => {
      const { error } = await supabase.from("academic_years").update({ registration_open: open }).eq("id", yearId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["academic-years"] });
      toast.success(vars.open ? "הרישום נפתח" : "הרישום נסגר");
    },
  });

  const handleAutoFill = () => {
    const now = new Date();
    const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    setName(`${year}-${year + 1}`);
    setStartDate(`${year}-09-01`);
    setEndDate(`${year + 1}-08-31`);
  };

  const activeYears = years.filter((y: any) => y.is_active);
  const archivedYears = years.filter((y: any) => !y.is_active);

  const YearCard = ({ y, isArchive = false }: { y: any; isArchive?: boolean }) => {
    const s = stats[y.id] ?? { students: 0, enrollments: 0, reports: 0 };
    const hasData = s.students > 0 || s.enrollments > 0 || s.reports > 0;
    return (
      <div className={`rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3 ${isArchive ? "opacity-70" : ""}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`font-semibold text-foreground ${isArchive ? "" : "text-lg"}`}>{y.name}</p>
            <p className="text-sm text-muted-foreground">{y.start_date} — {y.end_date}</p>
          </div>
          <div className="flex items-center gap-2">
            {!y.is_active && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="rounded-lg text-destructive hover:text-destructive hover:bg-destructive/10">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>מחיקת שנת לימודים</AlertDialogTitle>
                    <AlertDialogDescription>
                      {hasData
                        ? `לשנה "${y.name}" יש ${s.students} תלמידים, ${s.enrollments} רישומים ו-${s.reports} דיווחים. המחיקה תיכשל אם קיימים נתונים מקושרים.`
                        : `האם למחוק את שנת הלימודים "${y.name}"?`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>ביטול</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => deleteMutation.mutate(y.id)}
                    >
                      מחק
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {y.is_active ? (
              <Badge className="rounded-lg">פעילה</Badge>
            ) : (
              <Button variant="outline" size="sm" className="rounded-lg" onClick={() => activateMutation.mutate(y.id)}>
                <Star className="h-3.5 w-3.5 ml-1" />
                הפעל
              </Button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <Users className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className={`font-bold text-foreground ${isArchive ? "text-lg" : "text-xl"}`}>{s.students}</p>
            <p className="text-xs text-muted-foreground">תלמידים</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <BookOpen className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className={`font-bold text-foreground ${isArchive ? "text-lg" : "text-xl"}`}>{s.enrollments}</p>
            <p className="text-xs text-muted-foreground">רישומים</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3 text-center">
            <CalendarDays className="h-4 w-4 mx-auto text-primary mb-1" />
            <p className={`font-bold text-foreground ${isArchive ? "text-lg" : "text-xl"}`}>{s.reports}</p>
            <p className="text-xs text-muted-foreground">דיווחים</p>
          </div>
        </div>

        {/* Registration toggle */}
        <div className="flex items-center justify-between rounded-xl bg-muted/50 p-3">
          <Label className="text-sm font-medium cursor-pointer" htmlFor={`reg-toggle-${y.id}`}>
            פתח/סגור רישום
          </Label>
          <Switch
            id={`reg-toggle-${y.id}`}
            checked={!!y.registration_open}
            onCheckedChange={(checked) => toggleRegistrationMutation.mutate({ yearId: y.id, open: checked })}
          />
        </div>

        {/* Registration Links */}
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-xs h-8 gap-1"
            onClick={() => {
              const url = `${window.location.origin}/school-music-register?year=${encodeURIComponent(y.name)}`;
              navigator.clipboard.writeText(url);
              toast.success("קישור בית ספר מנגן הועתק");
            }}
          >
            <Copy className="h-3 w-3" />
            קישור בי״ס מנגן
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="rounded-lg text-xs h-8 gap-1"
            onClick={() => {
              const url = `${window.location.origin}/register?year=${encodeURIComponent(y.name)}`;
              navigator.clipboard.writeText(url);
              toast.success("קישור שיעורים פרטיים הועתק");
            }}
          >
            <Copy className="h-3 w-3" />
            קישור שיעורים פרטיים
          </Button>
        </div>
      </div>
    );
  };

  return (
    <AdminLayout title="ניהול שנות לימוד" backPath="/admin">
      <div className="space-y-4 max-w-2xl">
        <div className="flex gap-2">
          <Button className="h-12 rounded-xl text-base" onClick={() => { setShowForm(!showForm); if (!showForm) handleAutoFill(); }}>
            <Plus className="h-4 w-4" /> שנה חדשה
          </Button>
          <Button variant="outline" className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/year-promotion")}>
            <ArrowUpCircle className="h-4 w-4" /> מעבר שנה
          </Button>
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
                <DateInput value={startDate} onChange={setStartDate} placeholder="תאריך התחלה" />
              </div>
              <div className="space-y-1.5">
                <Label>תאריך סיום</Label>
                <DateInput value={endDate} onChange={setEndDate} placeholder="תאריך סיום" />
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
          <>
            <div className="space-y-3">
              {activeYears.map((y: any) => (
                <YearCard key={y.id} y={y} />
              ))}
            </div>

            {archivedYears.length > 0 && (
              <div className="space-y-3">
                <Button
                  variant="ghost"
                  className="w-full h-11 rounded-xl text-sm text-muted-foreground"
                  onClick={() => setShowArchive(!showArchive)}
                >
                  <Archive className="h-4 w-4 ml-1" />
                  {showArchive ? "הסתר ארכיון" : `הצג ארכיון (${archivedYears.length})`}
                  {showArchive && <Eye className="h-4 w-4 mr-1" />}
                </Button>

                {showArchive && archivedYears.map((y: any) => (
                  <YearCard key={y.id} y={y} isArchive />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminAcademicYears;
