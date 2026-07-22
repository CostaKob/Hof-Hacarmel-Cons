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
import { Progress } from "@/components/ui/progress";
import { Search, CheckCircle2, ExternalLink, Download, Undo2, Link2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import PageTitle from "@/components/PageTitle";

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

type StatusFilter = "all" | "paid" | "pending" | "refunded" | "active_links";

const AdminSchoolMusicPayments = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { selectedYearId } = useAcademicYear();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [schoolFilter, setSchoolFilter] = useState<string>(ALL);
  const [instrumentFilter, setInstrumentFilter] = useState<string>(ALL);
  const [classFilter, setClassFilter] = useState<string>(ALL);
  const [staffFilter, setStaffFilter] = useState<string>(ALL);
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");

  const { data: payments = [], isLoading } = useQuery({
    queryKey: ["school-music-payments", selectedYearId],
    queryFn: async () => {
      let q = supabase
        .from("school_music_payments" as any)
        .select(
          "*, school_music_students!school_music_payments_student_fk(id, student_first_name, student_last_name, parent_name, parent_phone, parent_email, class_name, instruments!school_music_students_instrument_id_fkey(id, name)), school_music_schools!school_music_payments_school_fk(id, school_name, coordinator:teachers!school_music_schools_coordinator_teacher_id_fkey(id, first_name, last_name), conductor:teachers!school_music_schools_conductor_teacher_id_fkey(id, first_name, last_name))"
        )
        .order("created_at", { ascending: false });
      if (selectedYearId) q = q.eq("academic_year_id", selectedYearId);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
  });

  const schoolOptions = useMemo(() => {
    const m = new Map<string, string>();
    payments.forEach((p) => { if (p.school_music_schools) m.set(p.school_music_school_id, p.school_music_schools.school_name); });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "he"));
  }, [payments]);

  const instrumentOptions = useMemo(() => {
    const m = new Map<string, string>();
    payments.forEach((p) => { const i = p.school_music_students?.instruments; if (i?.id) m.set(i.id, i.name); });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "he"));
  }, [payments]);

  const classOptions = useMemo(() => {
    const s = new Set<string>();
    payments.forEach((p) => { const c = p.school_music_students?.class_name; if (c) s.add(c); });
    return Array.from(s).sort((a, b) => a.localeCompare(b, "he"));
  }, [payments]);

  const staffOptions = useMemo(() => {
    const m = new Map<string, string>();
    payments.forEach((p) => {
      const sch = p.school_music_schools;
      if (!sch) return;
      if (sch.coordinator) m.set(sch.coordinator.id, `${sch.coordinator.first_name} ${sch.coordinator.last_name}`);
      if (sch.conductor) m.set(sch.conductor.id, `${sch.conductor.first_name} ${sch.conductor.last_name}`);
    });
    return Array.from(m.entries()).sort((a, b) => a[1].localeCompare(b[1], "he"));
  }, [payments]);

  const filtered = useMemo(() => {
    return payments.filter((p) => {
      const st = p.payment_status;
      if (statusFilter === "active_links") {
        if (!(st === "pending" && p.invoice_url)) return false;
      } else if (statusFilter === "refunded") {
        if (st !== "refunded") return false;
      } else if (statusFilter !== "all" && st !== statusFilter) return false;
      if (schoolFilter !== ALL && p.school_music_school_id !== schoolFilter) return false;
      if (instrumentFilter !== ALL && p.school_music_students?.instruments?.id !== instrumentFilter) return false;
      if (classFilter !== ALL && p.school_music_students?.class_name !== classFilter) return false;
      if (staffFilter !== ALL) {
        const sch = p.school_music_schools;
        const cid = sch?.coordinator?.id;
        const kid = sch?.conductor?.id;
        if (cid !== staffFilter && kid !== staffFilter) return false;
      }
      if (search) {
        const q = search.toLowerCase();
        const s = p.school_music_students;
        const full = `${s?.student_first_name || ""} ${s?.student_last_name || ""} ${s?.parent_name || ""} ${s?.parent_phone || ""} ${s?.parent_email || ""}`.toLowerCase();
        if (!full.includes(q)) return false;
      }
      return true;
    });
  }, [payments, search, statusFilter, schoolFilter, instrumentFilter, classFilter, staffFilter]);

  const totals = useMemo(() => {
    let potential = 0, paid = 0, refunds = 0, activeLinks = 0;
    let paidStudents = 0, pendingStudents = 0, refundedStudents = 0;
    const perSchool = new Map<string, { name: string; potential: number; paid: number; refunds: number; count: number }>();
    for (const p of filtered) {
      const amt = Number(p.amount || 0);
      const st = p.payment_status;
      potential += Math.abs(amt);
      if (st === "paid") { paid += amt; paidStudents += 1; }
      else if (st === "refunded") { refunds += Math.abs(amt); refundedStudents += 1; }
      else if (st === "pending") { pendingStudents += 1; if (p.invoice_url) activeLinks += 1; }

      const sid = p.school_music_school_id;
      const name = p.school_music_schools?.school_name || "—";
      const cur = perSchool.get(sid) || { name, potential: 0, paid: 0, refunds: 0, count: 0 };
      cur.potential += Math.abs(amt);
      if (st === "paid") cur.paid += amt;
      if (st === "refunded") cur.refunds += Math.abs(amt);
      cur.count += 1;
      perSchool.set(sid, cur);
    }
    const net = paid - refunds;
    const balance = Math.max(0, potential - net);
    const collectionPct = potential > 0 ? Math.round((net / potential) * 100) : 0;
    const schoolBreakdown = Array.from(perSchool.values()).sort((a, b) => b.potential - a.potential);
    return { potential, paid, refunds, net, balance, collectionPct, activeLinks, paidStudents, pendingStudents, refundedStudents, schoolBreakdown };
  }, [filtered]);

  const markPaidMutation = useMutation({
    mutationFn: async ({ id, method, ref }: { id: string; method: string; ref: string }) => {
      const { error } = await supabase
        .from("school_music_payments" as any)
        .update({ payment_status: "paid", payment_method: method, transaction_reference: ref || null, paid_at: new Date().toISOString() })
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

  const exportCsv = () => {
    const headers = ["תלמיד", "הורה", "טלפון", "בית ספר", "כיתה", "כלי", "סכום", "סטטוס", "אמצעי תשלום", "תאריך יצירה", "תאריך תשלום", "מסמך iCount"];
    const esc = (v: any) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const p of filtered) {
      const s = p.school_music_students;
      lines.push([
        `${s?.student_first_name || ""} ${s?.student_last_name || ""}`.trim(),
        s?.parent_name || "",
        s?.parent_phone || "",
        p.school_music_schools?.school_name || "",
        s?.class_name || "",
        s?.instruments?.name || "",
        Number(p.amount || 0),
        STATUS_LABELS[p.payment_status] || p.payment_status,
        p.payment_method || "",
        p.created_at ? new Date(p.created_at).toLocaleDateString("he-IL") : "",
        p.paid_at ? new Date(p.paid_at).toLocaleDateString("he-IL") : "",
        p.icount_doc_number || "",
      ].map(esc).join(","));
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `school-music-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout title="תשלומים — בית ספר מנגן" backPath="/admin">
      <PageTitle title="תשלומי ביס מנגן" />
      <div className="space-y-4">
        {/* Header + student count */}
        <div className="flex flex-wrap items-baseline gap-3 justify-between">
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span><span className="font-semibold text-foreground">{filtered.length}</span> תלמידים</span>
            {totals.activeLinks > 0 && (
              <span><span className="font-semibold text-foreground">{totals.activeLinks}</span> לינקים פעילים</span>
            )}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">פוטנציאל</p>
            <p className="text-2xl font-bold text-foreground">{totals.potential.toLocaleString()} ₪</p>
            <p className="text-[10px] text-muted-foreground mt-1">סה"כ חיובים לשנה</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">שולם</p>
            <p className="text-2xl font-bold text-green-600">{totals.paid.toLocaleString()} ₪</p>
            {totals.paidStudents > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">{totals.paidStudents} תלמידים</p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">הוחזר</p>
            <p className="text-2xl font-bold text-red-600">{totals.refunds.toLocaleString()} ₪</p>
            {totals.refundedStudents > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">{totals.refundedStudents} תלמידים</p>
            )}
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">נטו שולם</p>
            <p className="text-2xl font-bold text-foreground">{totals.net.toLocaleString()} ₪</p>
            <p className="text-[10px] text-muted-foreground mt-1">שולם − הוחזר</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">יתרה לגבייה</p>
            <p className="text-2xl font-bold text-amber-600">{totals.balance.toLocaleString()} ₪</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 col-span-2">
            <div className="flex items-baseline justify-between">
              <p className="text-xs text-muted-foreground">אחוז גבייה</p>
              <p className="text-2xl font-bold text-foreground">{totals.collectionPct}%</p>
            </div>
            <Progress value={totals.collectionPct} className="h-2 mt-2" />
            <p className="text-[10px] text-muted-foreground mt-1">נטו / פוטנציאל</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">לינקים פעילים</p>
            <p className="text-2xl font-bold text-foreground">{totals.activeLinks}</p>
            <p className="text-[10px] text-muted-foreground mt-1">ממתינים לתשלום</p>
          </div>
        </div>

        {/* Status breakdown */}
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-2">פילוח סטטוסים</p>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><span className="font-semibold text-green-600">{totals.paidStudents}</span> שולם</span>
            <span><span className="font-semibold text-amber-600">{totals.pendingStudents}</span> ממתין</span>
            <span><span className="font-semibold text-red-600">{totals.refundedStudents}</span> הוחזר</span>
          </div>
        </div>

        {/* Per-school breakdown */}
        {totals.schoolBreakdown.length > 1 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground mb-3">פילוח לפי בית ספר</p>
            <div className="space-y-2">
              {totals.schoolBreakdown.map((s, i) => {
                const net = s.paid - s.refunds;
                const pct = s.potential > 0 ? Math.round((net / s.potential) * 100) : 0;
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{s.name} <span className="text-xs text-muted-foreground">({s.count})</span></span>
                      <span className="text-muted-foreground">
                        <span className="text-green-600 font-semibold">{net.toLocaleString()}</span>
                        {" / "}
                        {s.potential.toLocaleString()} ₪
                        {" · "}{pct}%
                      </span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="חיפוש שם תלמיד, הורה, טלפון..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 h-11 rounded-xl"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="w-full sm:w-40 h-11 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              <SelectItem value="pending">ממתין</SelectItem>
              <SelectItem value="paid">שולם</SelectItem>
              <SelectItem value="refunded">עם החזרים</SelectItem>
              <SelectItem value="active_links">עם לינק פעיל</SelectItem>
            </SelectContent>
          </Select>
          <Select value={schoolFilter} onValueChange={setSchoolFilter}>
            <SelectTrigger className="w-full sm:w-48 h-11 rounded-xl"><SelectValue placeholder="בית ספר" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל בתי הספר</SelectItem>
              {schoolOptions.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={instrumentFilter} onValueChange={setInstrumentFilter}>
            <SelectTrigger className="w-full sm:w-40 h-11 rounded-xl"><SelectValue placeholder="כלי" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל הכלים</SelectItem>
              {instrumentOptions.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={classFilter} onValueChange={setClassFilter}>
            <SelectTrigger className="w-full sm:w-32 h-11 rounded-xl"><SelectValue placeholder="כיתה" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל הכיתות</SelectItem>
              {classOptions.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={staffFilter} onValueChange={setStaffFilter}>
            <SelectTrigger className="w-full sm:w-44 h-11 rounded-xl"><SelectValue placeholder="רכז/מנצח" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>כל הרכזים/מנצחים</SelectItem>
              {staffOptions.map(([id, name]) => (<SelectItem key={id} value={id}>{name}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={statusFilter === "refunded" ? "default" : "outline"}
            size="sm"
            className="h-9 rounded-xl gap-1"
            onClick={() => setStatusFilter(statusFilter === "refunded" ? "all" : "refunded")}
          >
            <Undo2 className="h-3.5 w-3.5" />
            {statusFilter === "refunded" ? "בטל סינון החזרים" : "החזרים בלבד"}
          </Button>
          <Button
            variant={statusFilter === "active_links" ? "default" : "outline"}
            size="sm"
            className="h-9 rounded-xl gap-1"
            onClick={() => setStatusFilter(statusFilter === "active_links" ? "all" : "active_links")}
          >
            <Link2 className="h-3.5 w-3.5" />
            {statusFilter === "active_links" ? "בטל סינון לינקים" : "לינקים פעילים בלבד"}
          </Button>
          <Button variant="outline" size="sm" className="h-9 rounded-xl gap-1" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            ייצוא לאקסל
          </Button>
        </div>

        {/* List */}
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">לא נמצאו תשלומים</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((p, idx) => {
              const s = p.school_music_students;
              const hasLink = p.payment_status === "pending" && !!p.invoice_url;
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer hover:bg-accent/50 transition-colors"
                  onClick={() => navigate(`/admin/school-music-students/${p.school_music_student_id}`)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">#{idx + 1}</span>
                        <p className="font-semibold text-foreground">
                          {s?.student_first_name} {s?.student_last_name}
                        </p>
                        <Badge variant={STATUS_VARIANT[p.payment_status] || "secondary"}>
                          {STATUS_LABELS[p.payment_status] || p.payment_status}
                        </Badge>
                        {hasLink && (
                          <Badge variant="outline" className="gap-1 text-xs">
                            <Link2 className="h-3 w-3" /> לינק פעיל
                          </Badge>
                        )}
                        {p.payment_status === "refunded" && (
                          <Badge variant="destructive" className="text-xs">הוחזר</Badge>
                        )}
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
                  <div className="flex gap-2 mt-3 flex-wrap" onClick={(e) => e.stopPropagation()}>
                    {p.payment_status === "pending" && (
                      <Button size="sm" variant="default" className="h-8 gap-1" onClick={() => setMarkPaidId(p.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5" /> סמן כשולם
                      </Button>
                    )}
                    {p.invoice_url ? (
                      <a href={p.invoice_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                        <Button size="sm" variant="outline" className="h-8 gap-1">
                          <ExternalLink className="h-3.5 w-3.5" />
                          {p.icount_doc_number ? `מסמך ${p.icount_doc_number}` : hasLink ? "פתח לינק" : "צפה במסמך"}
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
