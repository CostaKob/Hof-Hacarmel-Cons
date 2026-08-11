import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Mail, AlertCircle, CheckCircle2, Ban, ChevronLeft, ChevronRight } from "lucide-react";

type Row = {
  id: string;
  message_id: string | null;
  template_name: string;
  recipient_email: string;
  status: string;
  error_message: string | null;
  metadata: any;
  created_at: string;
};

type Preset = "24h" | "7d" | "30d" | "custom";

const PAGE_SIZE = 50;

const STATUS_LABEL: Record<string, string> = {
  sent: "נשלח",
  pending: "בהמתנה",
  dlq: "נכשל",
  failed: "נכשל",
  bounced: "הוחזר",
  complained: "תלונה",
  suppressed: "חסום",
};

function StatusBadge({ status }: { status: string }) {
  const label = STATUS_LABEL[status] ?? status;
  const cls =
    status === "sent"
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : status === "dlq" || status === "failed" || status === "bounced"
      ? "bg-red-100 text-red-800 border-red-200"
      : status === "suppressed" || status === "complained"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : "bg-slate-100 text-slate-700 border-slate-200";
  return <Badge variant="outline" className={cls}>{label}</Badge>;
}

export default function AdminEmailDashboard() {
  const [preset, setPreset] = useState<Preset>("7d");
  const [customStart, setCustomStart] = useState(format(subDays(new Date(), 7), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [templateFilter, setTemplateFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<Row | null>(null);

  const { start, end } = useMemo(() => {
    const now = new Date();
    if (preset === "24h") return { start: subDays(now, 1), end: now };
    if (preset === "7d") return { start: subDays(now, 7), end: now };
    if (preset === "30d") return { start: subDays(now, 30), end: now };
    const s = customStart ? new Date(customStart) : subDays(now, 7);
    const e = customEnd ? new Date(customEnd) : now;
    const safeStart = isNaN(s.getTime()) ? subDays(now, 7) : startOfDay(s);
    const safeEnd = isNaN(e.getTime()) ? now : endOfDay(e);
    return { start: safeStart, end: safeEnd };
  }, [preset, customStart, customEnd]);

  const { data, isLoading } = useQuery({
    queryKey: ["email-send-log", start.toISOString(), end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_send_log")
        .select("id, message_id, template_name, recipient_email, status, error_message, metadata, created_at")
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString())
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  // Deduplicate by message_id, keep latest (data already sorted desc)
  const deduped = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    const out: Row[] = [];
    for (const r of data) {
      const key = r.message_id ?? `__nomid_${r.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
    return out;
  }, [data]);

  const templates = useMemo(() => {
    const s = new Set<string>();
    deduped.forEach((r) => r.template_name && s.add(r.template_name));
    return Array.from(s).sort();
  }, [deduped]);

  const filtered = useMemo(() => {
    return deduped.filter((r) => {
      if (templateFilter !== "all" && r.template_name !== templateFilter) return false;
      if (statusFilter !== "all") {
        if (statusFilter === "failed") {
          if (!["dlq", "failed", "bounced"].includes(r.status)) return false;
        } else if (r.status !== statusFilter) return false;
      }
      return true;
    });
  }, [deduped, templateFilter, statusFilter]);

  const stats = useMemo(() => {
    const base = deduped.filter((r) => {
      if (templateFilter !== "all" && r.template_name !== templateFilter) return false;
      return true;
    });
    const s = { total: base.length, sent: 0, failed: 0, suppressed: 0, pending: 0 };
    for (const r of base) {
      if (r.status === "sent") s.sent++;
      else if (["dlq", "failed", "bounced"].includes(r.status)) s.failed++;
      else if (["suppressed", "complained"].includes(r.status)) s.suppressed++;
      else if (r.status === "pending") s.pending++;
    }
    return s;
  }, [deduped, templateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const setPresetSafe = (p: Preset) => {
    setPreset(p);
    setPage(0);
  };

  return (
    <AdminLayout title="לוח בקרת מיילים" backPath="/admin">
      <PageTitle title="לוח בקרת מיילים" />
      <div className="space-y-6 pb-24">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2.5">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">לוח בקרת מיילים</h1>
            <p className="text-sm text-muted-foreground">מעקב אחר מיילים שנשלחו, כשלים וחסימות</p>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={preset === "24h" ? "default" : "outline"} onClick={() => setPresetSafe("24h")}>24 שעות</Button>
            <Button size="sm" variant={preset === "7d" ? "default" : "outline"} onClick={() => setPresetSafe("7d")}>7 ימים</Button>
            <Button size="sm" variant={preset === "30d" ? "default" : "outline"} onClick={() => setPresetSafe("30d")}>30 ימים</Button>
            <Button size="sm" variant={preset === "custom" ? "default" : "outline"} onClick={() => setPresetSafe("custom")}>טווח מותאם</Button>
          </div>
          {preset === "custom" && (
            <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[160px]">
                <Label>מתאריך</Label>
                <DateInput value={customStart} onChange={(v) => { setCustomStart(v); setPage(0); }} className="h-11" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <Label>עד תאריך</Label>
                <DateInput value={customEnd} onChange={(v) => { setCustomEnd(v); setPage(0); }} className="h-11" />
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>סוג מייל</Label>
              <Select value={templateFilter} onValueChange={(v) => { setTemplateFilter(v); setPage(0); }}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  {templates.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>סטטוס</Label>
              <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
                <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">הכל</SelectItem>
                  <SelectItem value="sent">נשלח</SelectItem>
                  <SelectItem value="failed">נכשל</SelectItem>
                  <SelectItem value="suppressed">חסום</SelectItem>
                  <SelectItem value="pending">בהמתנה</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            onClick={() => { setStatusFilter("all"); setPage(0); }}
            className={`text-right ${statusFilter === "all" ? "ring-2 ring-primary rounded-xl" : ""}`}
          >
            <Card className="p-4 hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2 text-muted-foreground text-xs"><Mail className="h-4 w-4" />סה״כ</div>
              <div className="text-2xl font-bold mt-1">{stats.total}</div>
            </Card>
          </button>
          <button
            type="button"
            onClick={() => { setStatusFilter("sent"); setPage(0); }}
            className={`text-right ${statusFilter === "sent" ? "ring-2 ring-emerald-500 rounded-xl" : ""}`}
          >
            <Card className="p-4 hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2 text-emerald-700 text-xs"><CheckCircle2 className="h-4 w-4" />נשלחו</div>
              <div className="text-2xl font-bold mt-1 text-emerald-700">{stats.sent}</div>
            </Card>
          </button>
          <button
            type="button"
            onClick={() => { setStatusFilter("failed"); setPage(0); }}
            className={`text-right ${statusFilter === "failed" ? "ring-2 ring-red-500 rounded-xl" : ""}`}
          >
            <Card className="p-4 hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2 text-red-700 text-xs"><AlertCircle className="h-4 w-4" />נכשלו</div>
              <div className="text-2xl font-bold mt-1 text-red-700">{stats.failed}</div>
            </Card>
          </button>
          <button
            type="button"
            onClick={() => { setStatusFilter("suppressed"); setPage(0); }}
            className={`text-right ${statusFilter === "suppressed" ? "ring-2 ring-amber-500 rounded-xl" : ""}`}
          >
            <Card className="p-4 hover:bg-accent/40 transition-colors cursor-pointer">
              <div className="flex items-center gap-2 text-amber-700 text-xs"><Ban className="h-4 w-4" />חסומים</div>
              <div className="text-2xl font-bold mt-1 text-amber-700">{stats.suppressed}</div>
            </Card>
          </button>
        </div>


        {/* Table */}
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-12 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">לא נמצאו מיילים בטווח זה</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">תאריך</TableHead>
                      <TableHead className="text-right">נמען</TableHead>
                      <TableHead className="text-right">סוג</TableHead>
                      <TableHead className="text-right">סטטוס</TableHead>
                      <TableHead className="text-right">שגיאה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => (
                      <TableRow key={r.id} className="cursor-pointer" onClick={() => setDetail(r)}>
                        <TableCell className="whitespace-nowrap text-sm">
                          {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm">{r.recipient_email}</TableCell>
                        <TableCell className="text-sm">{r.template_name}</TableCell>
                        <TableCell><StatusBadge status={r.status} /></TableCell>
                        <TableCell className="text-xs text-red-700 max-w-[260px] truncate">
                          {r.error_message ?? ""}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between p-3 border-t">
                  <div className="text-sm text-muted-foreground">
                    עמוד {page + 1} מתוך {totalPages}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>פרטי מייל</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div><span className="text-muted-foreground">נמען: </span>{detail.recipient_email}</div>
              {detail.metadata?.from && (
                <div><span className="text-muted-foreground">מאת: </span>{detail.metadata.from}</div>
              )}
              {detail.metadata?.subject && (
                <div><span className="text-muted-foreground">נושא: </span><span className="font-medium">{detail.metadata.subject}</span></div>
              )}
              <div><span className="text-muted-foreground">סוג: </span>{detail.template_name}</div>
              <div><span className="text-muted-foreground">סטטוס: </span><StatusBadge status={detail.status} /></div>
              <div><span className="text-muted-foreground">תאריך: </span>{format(new Date(detail.created_at), "dd/MM/yyyy HH:mm:ss")}</div>
              {detail.message_id && (
                <div className="break-all"><span className="text-muted-foreground">מזהה: </span><code className="text-xs">{detail.message_id}</code></div>
              )}
              {detail.error_message && (
                <div>
                  <div className="text-muted-foreground mb-1">הודעת שגיאה:</div>
                  <div className="rounded-md bg-red-50 border border-red-200 p-2 text-red-800 text-xs whitespace-pre-wrap">{detail.error_message}</div>
                </div>
              )}
              {detail.metadata?.html ? (
                <div>
                  <div className="text-muted-foreground mb-1">תוכן המייל:</div>
                  <iframe
                    title="email-preview"
                    srcDoc={detail.metadata.html}
                    className="w-full h-[500px] rounded-md border bg-white"
                    sandbox=""
                  />
                </div>
              ) : detail.metadata?.text ? (
                <div>
                  <div className="text-muted-foreground mb-1">תוכן המייל:</div>
                  <pre className="rounded-md bg-slate-50 border p-2 text-xs whitespace-pre-wrap">{detail.metadata.text}</pre>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">תוכן המייל לא נשמר עבור רשומה זו (מיילים ישנים לפני העדכון).</div>
              )}
              {detail.metadata && (
                <details>
                  <summary className="text-xs text-muted-foreground cursor-pointer">מידע גולמי</summary>
                  <pre className="mt-2 rounded-md bg-slate-50 border p-2 text-xs overflow-x-auto" dir="ltr">{JSON.stringify({ ...detail.metadata, html: detail.metadata.html ? '[…]' : undefined }, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
