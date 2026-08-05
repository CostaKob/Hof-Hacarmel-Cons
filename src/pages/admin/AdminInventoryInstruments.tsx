import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ChevronLeft, Trash2, MapPin, Upload, FileDown, CheckCircle2, Circle, AlertTriangle, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import * as XLSX from "xlsx";
import InventoryImportDialog from "@/components/admin/InventoryImportDialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  CONDITION_LABELS,
  CONDITION_COLORS,
  InstrumentCondition,
  LOCATION_OPTIONS,
  REPAIR_STATE_OPTIONS,
  REPAIR_STATE_LABELS,
  REPAIR_STATE_COLORS,
  CHECK_RESULT_LABELS,
  CHECK_RESULT_COLORS,
  InstrumentRepairState,
  InstrumentCheckResult,
} from "@/lib/instrumentInventory";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { useListStatePreservation, usePersistedState, saveListScrollPosition } from "@/hooks/useListStatePreservation";
import PageTitle from "@/components/PageTitle";

const ROUTE_KEY = "/admin/inventory-instruments";

const AdminInventoryInstruments = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedYearId, years } = useAcademicYear();
  const yearName = years.find((y) => y.id === selectedYearId)?.name || "";
  useListStatePreservation(ROUTE_KEY);
  const [search, setSearch] = usePersistedState<string>(ROUTE_KEY, "search", "");
  const [filterInstrument, setFilterInstrument] = usePersistedState<string>(ROUTE_KEY, "filterInstrument", "all");
  const [filterCondition, setFilterCondition] = usePersistedState<string>(ROUTE_KEY, "filterCondition", "all");
  const [filterRepair, setFilterRepair] = usePersistedState<string>(ROUTE_KEY, "filterRepair", "all");
  const [filterLocation, setFilterLocation] = usePersistedState<string>(ROUTE_KEY, "filterLocation", "all");
  const [filterSchool, setFilterSchool] = usePersistedState<string>(ROUTE_KEY, "filterSchool", "all");
  const [filterVerified, setFilterVerified] = usePersistedState<string>(ROUTE_KEY, "filterVerified", "all");
  const [toDelete, setToDelete] = useState<{ id: string; serial: string } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [attentionFor, setAttentionFor] = useState<{ id: string; serial: string } | null>(null);
  const [attentionResult, setAttentionResult] = useState<InstrumentCheckResult>("needs_repair");
  const [attentionNotes, setAttentionNotes] = useState("");
  const [clearVerifyFor, setClearVerifyFor] = useState<{ id: string; serial: string } | null>(null);
  const attentionTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-inventory-instruments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_instruments")
        .select("*, instruments(name), instrument_storage_locations(name), instrument_loans(id, return_date, student_id, school_music_student_id, students(first_name, last_name), school_music_students(student_first_name, student_last_name, school_music_schools(school_name)))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data || [];

      // For private-student loans we need to look up their school via active enrollments
      const privateStudentIds = Array.from(
        new Set(
          rows.flatMap((it: any) =>
            (it.instrument_loans || [])
              .filter((l: any) => !l.return_date && l.student_id)
              .map((l: any) => l.student_id),
          ),
        ),
      );

      const studentSchoolMap = new Map<string, string>();
      if (privateStudentIds.length > 0) {
        const { data: enr } = await supabase
          .from("enrollments")
          .select("student_id, is_active, created_at, schools(name)")
          .in("student_id", privateStudentIds)
          .order("created_at", { ascending: false });
        (enr || []).forEach((e: any) => {
          if (!studentSchoolMap.has(e.student_id) && e.schools?.name) {
            studentSchoolMap.set(e.student_id, e.schools.name);
          }
        });
      }

      return rows.map((it: any) => {
        const activeLoan = (it.instrument_loans || []).find((l: any) => !l.return_date);
        let borrower = "";
        let borrowerSchool = "";
        if (activeLoan) {
          if (activeLoan.students) {
            borrower = `${activeLoan.students.first_name} ${activeLoan.students.last_name}`.trim();
            borrowerSchool = studentSchoolMap.get(activeLoan.student_id) || "";
          } else if (activeLoan.school_music_students) {
            borrower = `${activeLoan.school_music_students.student_first_name} ${activeLoan.school_music_students.student_last_name}`.trim();
            borrowerSchool = activeLoan.school_music_students.school_music_schools?.school_name || "";
          }
        }
        return { ...it, _borrower_name: borrower, _borrower_school: borrowerSchool };
      });
    },
  });

  // Physical checks for the selected academic year
  const { data: checks = [] } = useQuery({
    queryKey: ["instrument-checks-year", selectedYearId],
    enabled: !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instrument_checks")
        .select("*")
        .eq("academic_year_id", selectedYearId!)
        .order("checked_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const checkByInstrument = new Map<string, any>();
  checks.forEach((c: any) => {
    if (!checkByInstrument.has(c.inventory_instrument_id)) checkByInstrument.set(c.inventory_instrument_id, c);
  });

  const { data: instruments = [] } = useQuery({
    queryKey: ["admin-instruments-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name");
      if (error) throw error;
      return [...(data || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "", "he"));
    },
  });

  const { data: locations = [] } = useQuery({
    queryKey: ["admin-storage-locations-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instrument_storage_locations")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("inventory_instruments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      toast.success("הכלי נמחק");
      setToDelete(null);
    },
    onError: (err: any) => toast.error(err.message || "שגיאה במחיקה"),
  });

  const verifyMutation = useMutation({
    mutationFn: async ({
      ids,
      verified,
      result,
      notes,
    }: {
      ids: string[];
      verified: boolean;
      result?: InstrumentCheckResult;
      notes?: string | null;
    }) => {
      if (!selectedYearId) throw new Error("לא נבחרה שנת לימודים");
      const { data: userRes } = await supabase.auth.getUser();

      // one check record per instrument per academic year
      const { error: delErr } = await supabase
        .from("instrument_checks")
        .delete()
        .eq("academic_year_id", selectedYearId)
        .in("inventory_instrument_id", ids);
      if (delErr) throw delErr;

      if (!verified) return;

      const res = result ?? "ok";
      const { error: insErr } = await supabase.from("instrument_checks").insert(
        ids.map((instrumentId) => ({
          inventory_instrument_id: instrumentId,
          academic_year_id: selectedYearId,
          checked_by: userRes.user?.id ?? null,
          result: res,
          notes: notes ?? null,
        })),
      );
      if (insErr) throw insErr;

      // sync the instrument's own statuses with the check result
      if (res === "needs_repair" || res === "needs_completion") {
        const { error } = await supabase
          .from("inventory_instruments")
          .update({ repair_state: "needs_repair" })
          .in("id", ids)
          .neq("repair_state", "in_repair");
        if (error) throw error;
      } else if (res === "ok") {
        const { error } = await supabase
          .from("inventory_instruments")
          .update({ repair_state: "ok" })
          .in("id", ids)
          .eq("repair_state", "needs_repair");
        if (error) throw error;
      } else if (res === "missing") {
        const { error } = await supabase
          .from("inventory_instruments")
          .update({ condition: "missing" })
          .in("id", ids);
        if (error) throw error;
      }
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["instrument-checks-year"] });
      queryClient.invalidateQueries({ queryKey: ["instrument-checks"] });
      queryClient.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      queryClient.invalidateQueries({ queryKey: ["admin-inventory-instrument"] });
      toast.success(vars.verified ? `סומנו ${vars.ids.length} כלים כנבדקו` : `הוסר סימון מ-${vars.ids.length} כלים`);
      setSelectedIds(new Set());
    },
    onError: (err: any) => toast.error(err.message || "שגיאה בסימון"),
  });

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = items.filter((it: any) => {
    const check = checkByInstrument.get(it.id);
    if (filterInstrument !== "all" && it.instrument_id !== filterInstrument) return false;
    if (filterCondition !== "all" && it.condition !== filterCondition) return false;
    if (filterRepair !== "all" && (it.repair_state || "ok") !== filterRepair) return false;
    if (filterLocation !== "all") {
      if (filterLocation === "none" && it.storage_location_id) return false;
      if (filterLocation !== "none" && it.storage_location_id !== filterLocation) return false;
    }
    if (filterSchool !== "all") {
      if (filterSchool === "none" && it._borrower_school) return false;
      if (filterSchool !== "none" && it._borrower_school !== filterSchool) return false;
    }
    if (filterVerified === "verified" && !check) return false;
    if (filterVerified === "not_verified" && check) return false;
    if (search) {
      const s = search.toLowerCase();
      const matches =
        it.serial_number?.toLowerCase().includes(s) ||
        it.instruments?.name?.toLowerCase().includes(s) ||
        it.brand?.toLowerCase().includes(s) ||
        it.model?.toLowerCase().includes(s) ||
        it._borrower_name?.toLowerCase().includes(s) ||
        it._borrower_school?.toLowerCase().includes(s);
      if (!matches) return false;
    }
    return true;
  });

  const borrowerSchools = Array.from(
    new Set(items.map((it: any) => it._borrower_school).filter(Boolean)),
  ).sort() as string[];

  const stats = items.reduce(
    (acc: Record<string, number>, it: any) => {
      acc[it.condition] = (acc[it.condition] || 0) + 1;
      const rs = it.repair_state || "ok";
      if (rs !== "ok") acc[rs] = (acc[rs] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const checkedCount = items.filter((it: any) => checkByInstrument.has(it.id)).length;

  return (
    <AdminLayout title="מאגר כלי נגינה" backPath="/admin">
      <PageTitle title="מלאי כלים" />
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3">
        {LOCATION_OPTIONS.map((opt) => (
          <div key={opt.value} className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">{opt.label}</p>
            <p className="text-2xl font-bold text-foreground">{stats[opt.value] || 0}</p>
          </div>
        ))}
        <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-center">
          <p className="text-xs text-muted-foreground">דרוש תיקון / השלמה</p>
          <p className="text-2xl font-bold text-destructive">{stats.needs_repair || 0}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
          <p className="text-xs text-muted-foreground">בתיקון</p>
          <p className="text-2xl font-bold text-amber-700">{stats.in_repair || 0}</p>
        </div>
      </div>

      {/* Annual check progress */}
      <div className="mb-4 rounded-xl border border-border bg-card p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-foreground">בדיקה שנתית {yearName}</span>
          <span className="text-muted-foreground">
            נבדקו {checkedCount} מתוך {items.length}
          </span>
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${items.length ? (checkedCount / items.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי מספר סידורי, שם כלי, יצרן..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9 h-12 rounded-xl"
            />
          </div>
          <Button className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/inventory-instruments/new")}>
            <Plus className="h-4 w-4" /> כלי חדש
          </Button>
          <Button
            variant="outline"
            className="h-12 rounded-xl text-base"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="h-4 w-4" /> ייבוא מאקסל
          </Button>
          <Button
            variant="outline"
            className="h-12 rounded-xl text-base"
            onClick={() => {
              const rows = filtered.map((it: any) => {
                const check = checkByInstrument.get(it.id);
                return {
                  "סוג כלי": it.instruments?.name || "",
                  "מספר סידורי": it.serial_number || "",
                  "יצרן": it.brand || "",
                  "דגם": it.model || "",
                  "גודל": it.size || "",
                  "מיקום": CONDITION_LABELS[it.condition as InstrumentCondition] || "",
                  "תקינות": REPAIR_STATE_LABELS[(it.repair_state || "ok") as InstrumentRepairState],
                  "מיקום אחסון": it.instrument_storage_locations?.name || "",
                  "מושאל ל": it._borrower_name || "",
                  "נבדק בשנה": check ? format(new Date(check.checked_at), "dd/MM/yyyy") : "",
                  "תוצאת בדיקה": check ? CHECK_RESULT_LABELS[check.result as InstrumentCheckResult] : "",
                  "הערות בדיקה": check?.notes || "",
                  "תאריך רכישה": it.purchase_date || "",
                  "הערות": it.notes || "",
                };
              });
              const ws = XLSX.utils.json_to_sheet(rows);
              const wb = XLSX.utils.book_new();
              XLSX.utils.book_append_sheet(wb, ws, "מאגר כלים");
              XLSX.writeFile(wb, `instrument-inventory-${new Date().toISOString().slice(0, 10)}.xlsx`);
            }}
          >
            <FileDown className="h-4 w-4" /> ייצוא לאקסל
          </Button>
          <Button
            variant="outline"
            className="h-12 rounded-xl text-base"
            onClick={() => navigate("/admin/instrument-storage-locations")}
          >
            <MapPin className="h-4 w-4" /> מיקומי אחסון
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
          <Select value={filterInstrument} onValueChange={setFilterInstrument}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="סוג כלי" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסוגים</SelectItem>
              {instruments.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterCondition} onValueChange={setFilterCondition}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="מיקום הכלי" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל סטטוסי המיקום</SelectItem>
              {LOCATION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterRepair} onValueChange={setFilterRepair}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="תקינות" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל מצבי התקינות</SelectItem>
              {REPAIR_STATE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterLocation} onValueChange={setFilterLocation}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="מיקום אחסון" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל המיקומים</SelectItem>
              <SelectItem value="none">ללא מיקום</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterSchool} onValueChange={setFilterSchool}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="בית ספר של המושאל" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל בתי הספר</SelectItem>
              <SelectItem value="none">לא מושאל / ללא בי״ס</SelectItem>
              {borrowerSchools.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterVerified} onValueChange={setFilterVerified}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="בדיקה" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל סטטוסי הבדיקה</SelectItem>
              <SelectItem value="not_verified">טרם נבדק השנה</SelectItem>
              <SelectItem value="verified">נבדק השנה</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {selectedIds.size > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <span className="text-sm font-medium text-foreground">נבחרו {selectedIds.size} כלים</span>
            <div className="flex gap-2">
              <Button variant="outline" className="h-10 rounded-xl" onClick={() => setSelectedIds(new Set())}>
                נקה בחירה
              </Button>
              <Button
                className="h-10 rounded-xl"
                disabled={verifyMutation.isPending}
                onClick={() => verifyMutation.mutate({ ids: Array.from(selectedIds), verified: true, result: "ok", notes: null })}
              >
                <CheckCircle2 className="h-4 w-4" /> סמן כנבדק
              </Button>
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו כלים</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-2">{filtered.length} כלים</p>
          <div className="space-y-2">
            {filtered.map((it: any) => {
              const isChecked = selectedIds.has(it.id);
              const check = checkByInstrument.get(it.id);
              const verifiedAt = check ? new Date(check.checked_at) : null;
              const repairState = (it.repair_state || "ok") as InstrumentRepairState;
              return (
                <div
                  key={it.id}
                  onClick={() => {
                    saveListScrollPosition(ROUTE_KEY);
                    navigate(`/admin/inventory-instruments/${it.id}/edit`);
                  }}
                  className={`flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99] ${
                    isChecked ? "border-primary ring-1 ring-primary/30" : "border-border"
                  }`}
                >
                  <div
                    className="flex items-center shrink-0 pl-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleSelected(it.id)}
                      aria-label="בחר כלי"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <span className="font-semibold text-foreground">{it.instruments?.name}</span>
                      <span className="text-sm text-muted-foreground">#{it.serial_number}</span>
                      {it.size && <Badge variant="outline" className="text-[10px]">גודל {it.size}</Badge>}
                      <Badge variant="outline" className={CONDITION_COLORS[it.condition as InstrumentCondition]}>
                        {CONDITION_LABELS[it.condition as InstrumentCondition]}
                      </Badge>
                      {repairState !== "ok" && (
                        <Badge variant="outline" className={`${REPAIR_STATE_COLORS[repairState]} gap-1`}>
                          <AlertTriangle className="h-3 w-3" /> {REPAIR_STATE_LABELS[repairState]}
                        </Badge>
                      )}
                      {verifiedAt ? (
                        <>
                          <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 text-[10px] gap-1">
                            <CheckCircle2 className="h-3 w-3" /> נבדק {format(verifiedAt, "dd/MM/yy")}
                          </Badge>
                          <Badge variant="outline" className={`${CHECK_RESULT_COLORS[check.result as InstrumentCheckResult]} text-[10px]`}>
                            {CHECK_RESULT_LABELS[check.result as InstrumentCheckResult]}
                          </Badge>
                        </>
                      ) : (
                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 text-[10px] gap-1">
                          <Circle className="h-3 w-3" /> טרם נבדק השנה
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                      {(it.brand || it.model) && <span>{[it.brand, it.model].filter(Boolean).join(" / ")}</span>}
                      {it.instrument_storage_locations?.name && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {it.instrument_storage_locations.name}
                        </span>
                      )}
                      {it.condition === "loaned" && it._borrower_name && (
                        <span className="text-blue-700 font-medium">
                          מושאל ל: {it._borrower_name}
                          {it._borrower_school ? ` · ${it._borrower_school}` : ""}
                        </span>
                      )}
                      {check?.notes && <span className="w-full text-amber-800">📝 {check.notes}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-green-700 hover:bg-green-100"
                      title="נבדק - תקין"
                      onClick={(e) => {
                        e.stopPropagation();
                        verifyMutation.mutate({ ids: [it.id], verified: true, result: "ok", notes: null });
                      }}
                      disabled={verifyMutation.isPending}
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-amber-700 hover:bg-amber-100"
                      title="נבדק - דרוש תיקון / השלמה"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAttentionResult((check?.result as InstrumentCheckResult) === "needs_completion" ? "needs_completion" : "needs_repair");
                        setAttentionNotes(check?.notes || "");
                        setAttentionFor({ id: it.id, serial: it.serial_number });
                      }}
                      disabled={verifyMutation.isPending}
                    >
                      <AlertTriangle className="h-4 w-4" />
                    </Button>
                    {verifiedAt && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:bg-muted"
                        title="בטל סימון"
                        onClick={(e) => {
                          e.stopPropagation();
                          setClearVerifyFor({ id: it.id, serial: it.serial_number });
                        }}
                        disabled={verifyMutation.isPending}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setToDelete({ id: it.id, serial: it.serial_number });
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת כלי</AlertDialogTitle>
            <AlertDialogDescription>
              למחוק את הכלי #{toDelete?.serial}? הפעולה תמחק גם את היסטוריית ההשאלות שלו ואינה הפיכה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (toDelete) deleteMutation.mutate(toDelete.id);
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "מוחק..." : "מחק"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!attentionFor} onOpenChange={(open) => { if (!open) { setAttentionFor(null); setAttentionNotes(""); } }}>
        <DialogContent
          className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto overscroll-contain rounded-2xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            requestAnimationFrame(() => {
              attentionTextareaRef.current?.focus({ preventScroll: true });
            });
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg break-words">
              תוצאת בדיקה — #{attentionFor?.serial}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">תוצאה</Label>
              <Select value={attentionResult} onValueChange={(v) => setAttentionResult(v as InstrumentCheckResult)}>
                <SelectTrigger className="h-11 rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="needs_repair">דרוש תיקון</SelectItem>
                  <SelectItem value="needs_completion">דרוש השלמה</SelectItem>
                  <SelectItem value="missing">לא נמצא</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">מה חסר או מה צריך לתקן?</Label>
              <Textarea
                ref={attentionTextareaRef}
                value={attentionNotes}
                onChange={(e) => setAttentionNotes(e.target.value)}
                placeholder="תיאור הליקוי / השלמות נדרשות..."
                className="rounded-xl min-h-24 text-base"
              />
            </div>
          </div>
          <DialogFooter className="flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" className="rounded-xl h-11 w-full sm:w-auto" onClick={() => { setAttentionFor(null); setAttentionNotes(""); }}>
              ביטול
            </Button>
            <Button
              className="rounded-xl h-11 w-full sm:w-auto bg-amber-600 hover:bg-amber-700 text-white"
              disabled={verifyMutation.isPending}
              onClick={() => {
                if (!attentionFor) return;
                verifyMutation.mutate(
                  { ids: [attentionFor.id], verified: true, result: attentionResult, notes: attentionNotes.trim() || null },
                  { onSuccess: () => { setAttentionFor(null); setAttentionNotes(""); } },
                );
              }}
            >
              שמור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!clearVerifyFor} onOpenChange={(open) => !open && setClearVerifyFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ביטול סימון בדיקה</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך לבטל את סימון הבדיקה של הכלי #{clearVerifyFor?.serial} לשנה זו? הסטטוס יחזור ל"טרם נבדק" וההערות יימחקו.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (clearVerifyFor) {
                  verifyMutation.mutate(
                    { ids: [clearVerifyFor.id], verified: false },
                    { onSuccess: () => setClearVerifyFor(null) },
                  );
                }
              }}
              disabled={verifyMutation.isPending}
            >
              כן, בטל סימון
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InventoryImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </AdminLayout>
  );
};

export default AdminInventoryInstruments;
