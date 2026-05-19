import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, CheckCircle2, ExternalLink, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAcademicYear } from "@/hooks/useAcademicYear";

const ALL = "__all__";

const STATUS_LABELS: Record<string, string> = {
  pending: "ממתין",
  paid: "שולם",
  refunded: "הוחזר",
  failed: "נכשל",
  cancelled: "בוטל",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  paid: "default",
  refunded: "outline",
  failed: "destructive",
  cancelled: "outline",
};

const AdminSchoolMusicPayments = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { selectedYearId } = useAcademicYear();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [schoolFilter, setSchoolFilter] = useState<string>(ALL);
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["school-music-payments", selectedYearId],
    queryFn: async () => {
      let q = supabase
        .from("school_music_payments" as any)
        .select(
          "*, school_music_students!school_music_payments_student_fk(student_first_name, student_last_name, parent_name, parent_phone, parent_email, class_name, instruments!school_music_students_instrument_id_fkey(name)), school_music_schools!school_music_payments_school_fk(school_name)"
        )
        .order("created_at", { ascending: false });
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const schoolOptions = useMemo(() => {
    const map = new Map<string, string>();
    payments.forEach((p) => {
      if (p.school_music_schools) map.set(p.school_music_school_id, p.school_music_schools.school_name);
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "he"));
  }, [payments]);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      if (statusFilter !== ALL && p.payment_status !== statusFilter) return false;
      if (schoolFilter !== ALL && p.school_music_school_id !== schoolFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const s = p.school_music_students;
        const full = `${s?.student_first_name || ""} ${s?.student_last_name || ""} ${s?.parent_name || ""} ${s?.parent_phone || ""} ${s?.parent_email || ""}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [payments, search, statusFilter, schoolFilter]);

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, method, ref }: { id: string; method: string; ref: string }) => {
      const { error } = await supabase
        .from("school_music_payments" as any)
        .update({
          payment_status: "paid",
          payment_method: method,
          transaction_reference: ref || null,
          paid_at: new Date().toISOString(),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-music-payments"] });
      toast.success("התשלום סומן כשולם");
      setMarkPaidId(null);
      setReference("");
    },
    onError: () => toast.error("שגיאה בעדכון התשלום"),
  });

  const refundMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("school_music_payments" as any)
        .update({ payment_status: "refunded" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["school-music-payments"] });
      toast.success("התשלום סומן כהוחזר");
    },
    onError: () => toast.error("שגיאה בעדכון התשלום"),
  });

  const totalPaid = filtered.filter((p) => p.payment_status === "paid").reduce((sum, p) => sum + Number(p.amount), 0);
  const totalRefunded = filtered.filter((p) => p.payment_status === "refunded").reduce((sum, p) => sum + Math.abs(Number(p.amount)), 0);
  const netTotal = totalPaid - totalRefunded;

  return (
    <AdminLayout title="תשלומים — בית ספר מנגן" backPath="/admin">
      <div className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">סה"כ שולם</p>
            <p className="text-2xl font-bold text-green-600">{totalPaid.toLocaleString()} ₪</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">סה"כ הוחזר</p>
            <p className="text-2xl font-bold text-red-600">{totalRefunded.toLocaleString()} ₪</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-xs text-muted-foreground">שורה תחתונה</p>
            <p className="text-2xl font-bold text-foreground">{netTotal.toLocaleString()} ₪</p>
          </div>
        </div>


        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש שם תלמיד, הורה, טלפון..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 h-11 rounded-xl"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-11 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל הסטטוסים</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger className="w-48 h-11 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל בתי הספר</SelectItem>
              {schoolOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">לא נמצאו תשלומים</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
              const s = p.school_music_students;
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => navigate(`/admin/school-music-students/${p.school_music_student_id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground">
                          {s?.student_first_name} {s?.student_last_name}
                        </p>
                        <Badge variant={STATUS_VARIANT[p.payment_status] || "secondary"}>
                          {STATUS_LABELS[p.payment_status] || p.payment_status}
                        </Badge>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground mt-1">
                        <span>{p.school_music_schools?.school_name}</span>
                        {s?.class_name && <span>כיתה {s.class_name}</span>}
                        {s?.instruments?.name && <span>{s.instruments.name}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground mt-1">
                        <span>הורה: {s?.parent_name}</span>
                        {s?.parent_phone && <span dir="ltr">{s.parent_phone}</span>}
                        <span>{new Date(p.created_at).toLocaleDateString("he-IL")}</span>
                        {p.paid_at && <span>שולם: {new Date(p.paid_at).toLocaleDateString("he-IL")}</span>}
                      </div>
                    </div>
                    <div className="text-left shrink-0">
                      <p className="text-xl font-bold text-foreground">{Number(p.amount).toLocaleString()} ₪</p>
                      {p.payment_method && <p className="text-xs text-muted-foreground">{p.payment_method}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {p.payment_status === "pending" && (
                      <Button size="sm" variant="default" className="h-8 gap-1" onClick={() => setMarkPaidId(p.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> סמן כשולם
                      </Button>
                    )}
                    {p.invoice_url ? (
                      <a href={p.invoice_url} target="_blank" rel="noreferrer">
                        <Button size="sm" variant="outline" className="h-8 gap-1">
                          <ExternalLink className="h-3.5 w-3.5" />
                          {p.icount_doc_number ? `מסמך ${p.icount_doc_number}` : "צפה במסמך"}
                        </Button>
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground self-center">לא הופק מסמך</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mark as paid dialog */}
      <Dialog open={!!markPaidId} onOpenChange={(o) => !o && setMarkPaidId(null)}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>סימון תשלום כשולם</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-sm">אמצעי תשלום</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">מזומן</SelectItem>
                  <SelectItem value="credit">כרטיס אשראי</SelectItem>
                  <SelectItem value="transfer">העברה בנקאית</SelectItem>
                  <SelectItem value="check">המחאה</SelectItem>
                  <SelectItem value="bit">ביט</SelectItem>
                  <SelectItem value="other">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">אסמכתא (אופציונלי)</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} className="h-11 rounded-xl" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkPaidId(null)}>ביטול</Button>
            <Button onClick={() => markPaidId && markPaidMutation.mutate({ id: markPaidId, method: paymentMethod, ref: reference })}>
              אישור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminSchoolMusicPayments;
