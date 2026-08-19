import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm, Controller } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  CONDITION_LABELS,
  CONDITION_COLORS,
  InstrumentCondition,
  INSTRUMENT_SIZES,
  LOCATION_OPTIONS,
  REPAIR_STATE_OPTIONS,
  REPAIR_STATE_LABELS,
  REPAIR_STATE_COLORS,
  InstrumentRepairState,
  CHECK_RESULT_LABELS,
  CHECK_RESULT_COLORS,
  InstrumentCheckResult,
} from "@/lib/instrumentInventory";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { User, ExternalLink, Pencil, Check, X, CheckCircle2, Circle, Trash2 } from "lucide-react";
import InstrumentRepairsSection from "@/components/admin/InstrumentRepairsSection";
import PageTitle from "@/components/PageTitle";

interface FormData {
  instrument_id: string;
  serial_number: string;
  brand: string;
  model: string;
  size: string | null;
  condition: InstrumentCondition;
  repair_state: InstrumentRepairState;
  storage_location_id: string | null;
  purchase_date: string;
  notes: string;
}


const AdminInventoryInstrumentForm = () => {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [editingLoanId, setEditingLoanId] = useState<string | null>(null);
  const [editLoanDate, setEditLoanDate] = useState("");
  const [editReturnDate, setEditReturnDate] = useState("");
  const [verifyNotes, setVerifyNotes] = useState("");
  const [checkResult, setCheckResult] = useState<InstrumentCheckResult>("ok");
  const [showAddLoan, setShowAddLoan] = useState(false);
  const [loanSearch, setLoanSearch] = useState("");
  const [selectedLoanStudent, setSelectedLoanStudent] = useState<
    { id: string; name: string; kind: "private" | "school_music" } | null
  >(null);
  const [newLoanDate, setNewLoanDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [newReturnDate, setNewReturnDate] = useState("");
  const { selectedYearId, years } = useAcademicYear();
  const yearName = years.find((y) => y.id === selectedYearId)?.name || "";
  const initializedItemIdRef = useRef<string | null>(null);


  const updateLoanMutation = useMutation({
    mutationFn: async ({ loanId, loan_date, return_date }: { loanId: string; loan_date: string; return_date: string | null }) => {
      const { error } = await supabase
        .from("instrument_loans")
        .update({ loan_date, return_date })
        .eq("id", loanId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instrument-loans", id] });
      qc.invalidateQueries({ queryKey: ["student-instrument-loans"] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      setEditingLoanId(null);
      toast.success("התאריכים עודכנו");
    },
    onError: (e: any) => toast.error(e.message || "שגיאה בעדכון"),
  });

  const { data: loanStudentResults = [] } = useQuery({
    queryKey: ["loan-student-search", loanSearch],
    enabled: loanSearch.trim().length >= 2 && showAddLoan,
    queryFn: async () => {
      const term = `%${loanSearch.trim()}%`;
      const [priv, sm] = await Promise.all([
        supabase
          .from("students")
          .select("id, first_name, last_name, national_id")
          .or(`first_name.ilike.${term},last_name.ilike.${term},national_id.ilike.${term}`)
          .limit(10),
        supabase
          .from("school_music_students")
          .select("id, student_first_name, student_last_name, student_national_id")
          .or(
            `student_first_name.ilike.${term},student_last_name.ilike.${term},student_national_id.ilike.${term}`,
          )
          .limit(10),
      ]);
      const list: { id: string; name: string; kind: "private" | "school_music" }[] = [];
      (priv.data || []).forEach((s: any) =>
        list.push({ id: s.id, name: `${s.first_name || ""} ${s.last_name || ""}`.trim(), kind: "private" }),
      );
      (sm.data || []).forEach((s: any) =>
        list.push({
          id: s.id,
          name: `${s.student_first_name || ""} ${s.student_last_name || ""}`.trim(),
          kind: "school_music",
        }),
      );
      return list;
    },
  });

  const addLoanMutation = useMutation({
    mutationFn: async () => {
      if (!selectedLoanStudent) throw new Error("יש לבחור תלמיד");
      const { error } = await supabase.from("instrument_loans").insert({
        inventory_instrument_id: id!,
        student_id: selectedLoanStudent.kind === "private" ? selectedLoanStudent.id : null,
        school_music_student_id: selectedLoanStudent.kind === "school_music" ? selectedLoanStudent.id : null,
        loan_date: newLoanDate,
        return_date: newReturnDate || null,
      });
      if (error) throw error;
      if (!newReturnDate) {
        const { error: updErr } = await supabase
          .from("inventory_instruments")
          .update({ condition: "loaned" })
          .eq("id", id!);
        if (updErr) throw updErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instrument-loans", id] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instrument", id] });
      qc.invalidateQueries({ queryKey: ["student-instrument-loans"] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      setShowAddLoan(false);
      setSelectedLoanStudent(null);
      setLoanSearch("");
      setNewLoanDate(format(new Date(), "yyyy-MM-dd"));
      setNewReturnDate("");
      toast.success("ההשאלה נוספה");
    },
    onError: (e: any) => toast.error(e.message || "שגיאה בהוספה"),
  });


  const { register, handleSubmit, control, reset, watch, setValue, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      condition: "available",
      repair_state: "ok",
      storage_location_id: null,
    },

  });

  const { data: item } = useQuery({
    queryKey: ["admin-inventory-instrument", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_instruments").select("*").eq("id", id!).single();
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
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

  const { data: loans = [] } = useQuery({
    queryKey: ["instrument-loans", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instrument_loans")
        .select(`
          *,
          students(id, first_name, last_name, grade),
          school_music_students(
            id, student_first_name, student_last_name, class_name,
            school_music_schools(school_name),
            academic_years(name)
          )
        `)
        .eq("inventory_instrument_id", id!)
        .order("loan_date", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: isEdit,
  });

  // Context (branch school / academic year / grade) for private students in the loan list
  const privateStudentIds = Array.from(
    new Set((loans as any[]).map((l) => l.student_id).filter(Boolean)),
  ) as string[];

  const { data: privateContext = {} } = useQuery({
    queryKey: ["instrument-loan-private-context", privateStudentIds.sort().join(",")],
    enabled: privateStudentIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("student_id, grade, start_date, schools(name), academic_years(name)")
        .in("student_id", privateStudentIds)
        .order("start_date", { ascending: false });
      if (error) throw error;
      const map: Record<string, { school?: string; year?: string; grade?: string }> = {};
      (data as any[]).forEach((e) => {
        if (map[e.student_id]) return;
        map[e.student_id] = {
          school: e.schools?.name,
          year: e.academic_years?.name,
          grade: e.grade || undefined,
        };
      });
      return map;
    },
  });


  useEffect(() => {
    if (item && initializedItemIdRef.current !== item.id) {
      reset({
        instrument_id: item.instrument_id,
        serial_number: item.serial_number,
        brand: item.brand || "",
        model: item.model || "",
        size: item.size || null,
        condition: item.condition,
        repair_state: ((item as any).repair_state || "ok") as InstrumentRepairState,
        storage_location_id: item.storage_location_id,
        purchase_date: item.purchase_date || "",
        notes: item.notes || "",
      });

      initializedItemIdRef.current = item.id;
    }
  }, [item, reset]);

  // ── Quick repair-state actions (manual, always available) ──
  const quickRepairMutation = useMutation({
    mutationFn: async (next: InstrumentRepairState) => {
      if (!id) throw new Error("כלי לא נמצא");
      const today = format(new Date(), "yyyy-MM-dd");
      const { error } = await supabase
        .from("inventory_instruments")
        .update({ repair_state: next })
        .eq("id", id);
      if (error) throw error;

      // Returning to "ok" closes any open repair record with today's date
      if (next === "ok") {
        await supabase
          .from("instrument_repairs")
          .update({ return_date: today })
          .eq("inventory_instrument_id", id)
          .is("return_date", null);
      }
    },
    onSuccess: (_d, next) => {
      setValue("repair_state", next, { shouldDirty: false });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instrument", id] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      qc.invalidateQueries({ queryKey: ["instrument-repairs", id] });
      toast.success(
        next === "ok" ? "הכלי סומן כתקין והתיקון נסגר" : `עודכן ל"${REPAIR_STATE_LABELS[next]}"`
      );
    },
    onError: (e: any) => toast.error(e.message || "שגיאה"),
  });

  // ── Annual physical checks ──────────────────────────────
  const { data: checks = [] } = useQuery({
    queryKey: ["instrument-checks", id],
    enabled: isEdit,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instrument_checks")
        .select("*, academic_years(name)")
        .eq("inventory_instrument_id", id!)
        .order("checked_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const currentCheck = (checks as any[]).find((c) => c.academic_year_id === selectedYearId) || null;

  useEffect(() => {
    if (currentCheck) {
      setCheckResult(currentCheck.result as InstrumentCheckResult);
      setVerifyNotes(currentCheck.notes || "");
    }
  }, [currentCheck?.id]);

  const saveCheckMutation = useMutation({
    mutationFn: async () => {
      if (!selectedYearId) throw new Error("לא נבחרה שנת לימודים");

      const { data: userRes } = await supabase.auth.getUser();
      const { error } = await supabase.from("instrument_checks").insert({
        inventory_instrument_id: id!,
        academic_year_id: selectedYearId,
        checked_by: userRes.user?.id ?? null,
        result: checkResult,
        notes: verifyNotes.trim() || null,
      });
      if (error) throw error;

      let nextRepairState: InstrumentRepairState | null = null;
      if (checkResult === "unusable") {
        nextRepairState = "unusable";
      } else if (checkResult === "needs_repair" || checkResult === "needs_completion") {
        if ((item as any)?.repair_state !== "in_repair") nextRepairState = "needs_repair";
      } else if (checkResult === "ok") {
        if ((item as any)?.repair_state === "needs_repair" || (item as any)?.repair_state === "unusable") {
          nextRepairState = "ok";
        }
      }

      if (nextRepairState) {
        await supabase.from("inventory_instruments").update({ repair_state: nextRepairState }).eq("id", id!);
      }
      if (checkResult === "missing") {
        await supabase.from("inventory_instruments").update({ condition: "missing" }).eq("id", id!);
      }

      return nextRepairState;
    },
    onSuccess: (nextRepairState) => {
      if (nextRepairState) setValue("repair_state", nextRepairState, { shouldDirty: false });
      qc.invalidateQueries({ queryKey: ["instrument-checks", id] });
      qc.invalidateQueries({ queryKey: ["instrument-checks-year"] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instrument", id] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      setVerifyNotes("");
      toast.success("הבדיקה נוספה");
    },

    onError: (e: any) => toast.error(e.message || "שגיאה"),
  });

  const deleteCheckMutation = useMutation({
    mutationFn: async (checkId: string) => {
      const { error } = await supabase.from("instrument_checks").delete().eq("id", checkId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["instrument-checks", id] });
      qc.invalidateQueries({ queryKey: ["instrument-checks-year"] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      toast.success("הבדיקה נמחקה");
    },
    onError: (e: any) => toast.error(e.message || "שגיאה"),
  });


  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const payload = {
        instrument_id: data.instrument_id,
        serial_number: data.serial_number.trim(),
        brand: data.brand.trim() || null,
        model: data.model.trim() || null,
        size: data.size || null,
        condition: data.condition,
        repair_state: data.repair_state || "ok",
        storage_location_id: data.storage_location_id || null,
        purchase_date: data.purchase_date || null,
        notes: data.notes.trim() || null,
      };

      if (isEdit) {
        if (!id) throw new Error("כלי לא נמצא");
        const { data: savedItem, error } = await supabase
          .from("inventory_instruments")
          .update(payload)
          .eq("id", id)
          .select("id, condition")
          .single();
        if (error) throw error;
        if (savedItem.condition !== data.condition) throw new Error("מצב הכלי לא נשמר, יש לנסות שוב");

        // Moving away from "loaned" closes any open loan with today's date (editable later)
        if (item?.condition === "loaned" && data.condition !== "loaned") {
          const today = format(new Date(), "yyyy-MM-dd");
          const { error: loanErr } = await supabase
            .from("instrument_loans")
            .update({ return_date: today })
            .eq("inventory_instrument_id", id)
            .is("return_date", null);
          if (loanErr) throw loanErr;
        }
      } else {
        const { error } = await supabase.from("inventory_instruments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instrument", id] });
      qc.invalidateQueries({ queryKey: ["instrument-loans", id] });
      qc.invalidateQueries({ queryKey: ["student-instrument-loans"] });
      toast.success(isEdit ? "הכלי עודכן" : "הכלי נוצר");
      navigate("/admin/inventory-instruments");
    },
    onError: (err: any) => {
      if (err.message?.includes("duplicate")) {
        toast.error("מספר סידורי כבר קיים עבור סוג כלי זה");
      } else {
        toast.error(err.message || "שגיאה");
      }
    },
  });

  return (
    <AdminLayout title={isEdit ? "עריכת כלי" : "כלי חדש"} backPath="/admin/inventory-instruments">
      <PageTitle title="טופס כלי מלאי" />
      <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="max-w-2xl space-y-5">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-foreground text-base">פרטי הכלי</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm">סוג כלי *</Label>
              <Controller
                name="instrument_id"
                control={control}
                rules={{ required: "שדה חובה" }}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="בחר סוג" />
                    </SelectTrigger>
                    <SelectContent>
                      {instruments.map((i) => (
                        <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.instrument_id && <p className="text-sm text-destructive">{errors.instrument_id.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">מספר סידורי *</Label>
              <Input {...register("serial_number", { required: "שדה חובה" })} className="h-12 rounded-xl" />
              {errors.serial_number && <p className="text-sm text-destructive">{errors.serial_number.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">יצרן</Label>
              <Input {...register("brand")} className="h-12 rounded-xl" />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">דגם</Label>
              <Input {...register("model")} className="h-12 rounded-xl" />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">גודל (לכלים מתאימים: כינור, צ'לו וכו')</Label>
              <Controller
                name="size"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="ללא גודל" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">ללא גודל</SelectItem>
                      {INSTRUMENT_SIZES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">זמינות הכלי *</Label>
              <Controller
                name="condition"
                control={control}
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LOCATION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">תקינות *</Label>
              <Controller
                name="repair_state"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || "ok"} onValueChange={field.onChange}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REPAIR_STATE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {isEdit && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {watch("repair_state") !== "ok" && (
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 rounded-xl bg-green-600 hover:bg-green-700 text-white"
                      disabled={quickRepairMutation.isPending}
                      onClick={() => quickRepairMutation.mutate("ok")}
                    >
                      <Check className="h-4 w-4" /> תוקן — סמן כתקין
                    </Button>
                  )}
                  {watch("repair_state") === "needs_repair" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-xl"
                      disabled={quickRepairMutation.isPending}
                      onClick={() => quickRepairMutation.mutate("in_repair")}
                    >
                      שלח לתיקון
                    </Button>
                  )}
                  {watch("repair_state") === "ok" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-xl"
                      disabled={quickRepairMutation.isPending}
                      onClick={() => quickRepairMutation.mutate("needs_repair")}
                    >
                      סמן כדרוש תיקון
                    </Button>
                  )}
                  {watch("repair_state") !== "unusable" && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-xl border-neutral-400 text-neutral-800"
                      disabled={quickRepairMutation.isPending}
                      onClick={() => quickRepairMutation.mutate("unusable")}
                    >
                      סמן כלא שמיש
                    </Button>
                  )}
                </div>

              )}
              <p className="text-[11px] text-muted-foreground">
                ניתן תמיד לשנות ידנית בבחירה למעלה ולשמור.
              </p>
            </div>



            <div className="space-y-1.5">
              <Label className="text-sm">מיקום אחסון</Label>
              <Controller
                name="storage_location_id"
                control={control}
                render={({ field }) => (
                  <Select value={field.value || "__none__"} onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}>
                    <SelectTrigger className="h-11 rounded-xl">
                      <SelectValue placeholder="ללא מיקום" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">ללא מיקום</SelectItem>
                      {locations.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">תאריך רכישה</Label>
              <Controller
                name="purchase_date"
                control={control}
                render={({ field }) => (
                  <DateInput value={field.value} onChange={(v) => field.onChange(v)} className="h-12 rounded-xl" />
                )}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-sm">הערות</Label>
              <Textarea {...register("notes")} className="rounded-xl min-h-20" />
            </div>
          </div>
        </div>

        {isEdit && item && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-foreground text-base">בדיקה שנתית</h2>
              <span className="text-xs text-muted-foreground">{yearName}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {currentCheck ? (
                <>
                  <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200 gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> נבדק
                  </Badge>
                  <Badge variant="outline" className={CHECK_RESULT_COLORS[currentCheck.result as InstrumentCheckResult]}>
                    {CHECK_RESULT_LABELS[currentCheck.result as InstrumentCheckResult]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(currentCheck.checked_at), "dd/MM/yyyy HH:mm")}
                  </span>
                </>
              ) : (
                <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200 gap-1">
                  <Circle className="h-3.5 w-3.5" /> טרם נבדק בשנה זו
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">תוצאת בדיקה</Label>
                <Select value={checkResult} onValueChange={(v) => setCheckResult(v as InstrumentCheckResult)}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ok">תקין</SelectItem>
                    <SelectItem value="needs_repair">דרוש תיקון</SelectItem>
                    <SelectItem value="needs_completion">דרוש השלמה</SelectItem>
                    <SelectItem value="unusable">לא שמיש</SelectItem>
                    <SelectItem value="missing">לא נמצא</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-sm">הערות בדיקה (אופציונלי)</Label>
                <Textarea
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder="תיאור הליקוי / השלמות נדרשות..."
                  className="rounded-xl min-h-16"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-10 rounded-xl"
                disabled={saveCheckMutation.isPending || !selectedYearId}
                onClick={() => saveCheckMutation.mutate()}
              >
                הוספת בדיקה
              </Button>
            </div>

            {checks.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-sm font-medium text-foreground">היסטוריית בדיקות ({checks.length})</p>
                {checks.map((c: any) => (
                  <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-border p-2.5 text-xs">
                    <span className="font-medium">{c.academic_years?.name || ""}</span>
                    <Badge variant="outline" className={`${CHECK_RESULT_COLORS[c.result as InstrumentCheckResult]} text-[10px]`}>
                      {CHECK_RESULT_LABELS[c.result as InstrumentCheckResult]}
                    </Badge>
                    <span className="text-muted-foreground">{format(new Date(c.checked_at), "dd/MM/yyyy HH:mm")}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 mr-auto text-destructive"
                      disabled={deleteCheckMutation.isPending}
                      onClick={() => {
                        if (confirm("למחוק את הבדיקה?")) deleteCheckMutation.mutate(c.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                    {c.notes && <span className="w-full text-muted-foreground">📝 {c.notes}</span>}
                  </div>
                ))}
              </div>
            )}

          </div>
        )}



        {isEdit && (
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold text-foreground text-base">היסטוריית השאלות ({loans.length})</h2>
              {!showAddLoan && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-xl"
                  onClick={() => setShowAddLoan(true)}
                >
                  הוספה ידנית
                </Button>
              )}
            </div>

            {showAddLoan && (
              <div className="rounded-xl border border-border p-4 bg-background space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-sm">חיפוש תלמיד (שם או ת"ז)</Label>
                  {selectedLoanStudent ? (
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {selectedLoanStudent.name} · {selectedLoanStudent.kind === "private" ? "פרטני" : "ביס מנגן"}
                      </Badge>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-lg"
                        onClick={() => setSelectedLoanStudent(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <Input
                        value={loanSearch}
                        onChange={(e) => setLoanSearch(e.target.value)}
                        placeholder="הקלד לפחות 2 תווים"
                        className="h-11 rounded-xl"
                      />
                      {loanSearch.trim().length >= 2 && (
                        <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y">
                          {loanStudentResults.length === 0 ? (
                            <p className="p-3 text-sm text-muted-foreground">לא נמצאו תלמידים</p>
                          ) : (
                            loanStudentResults.map((s) => (
                              <button
                                key={`${s.kind}-${s.id}`}
                                type="button"
                                className="w-full text-right p-2.5 text-sm hover:bg-muted flex items-center justify-between gap-2"
                                onClick={() => setSelectedLoanStudent(s)}
                              >
                                <span>{s.name || "ללא שם"}</span>
                                <Badge variant="outline" className="text-[10px]">
                                  {s.kind === "private" ? "פרטני" : "ביס מנגן"}
                                </Badge>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">תאריך השאלה *</Label>
                    <DateInput
                      value={newLoanDate}
                      onChange={(v) => setNewLoanDate(v)}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">תאריך החזרה</Label>
                    <DateInput
                      value={newReturnDate}
                      onChange={(v) => setNewReturnDate(v)}
                      className="h-11 rounded-xl"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    disabled={!selectedLoanStudent || !newLoanDate || addLoanMutation.isPending}
                    onClick={() => addLoanMutation.mutate()}
                  >
                    {addLoanMutation.isPending ? "שומר..." : "הוספה"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-xl"
                    onClick={() => {
                      setShowAddLoan(false);
                      setSelectedLoanStudent(null);
                      setLoanSearch("");
                    }}
                  >
                    ביטול
                  </Button>
                </div>
              </div>
            )}

            {loans.length === 0 ? (
              <p className="text-sm text-muted-foreground">לא הושאל לאף תלמיד</p>
            ) : (
              <div className="space-y-2">
                {loans.map((loan: any) => {
                  const isPrivate = !!loan.student_id;
                  const student = isPrivate ? loan.students : loan.school_music_students;
                  const name = isPrivate
                    ? `${student?.first_name || ""} ${student?.last_name || ""}`.trim()
                    : `${student?.student_first_name || ""} ${student?.student_last_name || ""}`.trim();
                  const studentLink = isPrivate
                    ? `/admin/students/${loan.student_id}`
                    : null;
                  const isActive = !loan.return_date;
                  return (
                    <div
                      key={loan.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3 bg-background"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <User className="h-4 w-4 text-muted-foreground shrink-0" />
                          {studentLink ? (
                            <button
                              type="button"
                              onClick={() => navigate(studentLink)}
                              className="text-sm font-medium text-primary hover:underline truncate flex items-center gap-1"
                            >
                              {name || "ללא שם"}
                              <ExternalLink className="h-3 w-3" />
                            </button>
                          ) : (
                            <span className="text-sm font-medium truncate">{name || "ללא שם"}</span>
                          )}
                          <Badge variant="outline" className="text-[10px]">
                            {isPrivate ? "פרטני" : "ביס מנגן"}
                          </Badge>
                          {isActive && (
                            <Badge variant="outline" className={CONDITION_COLORS.loaned}>פעיל</Badge>
                          )}
                        </div>
                        {details.length > 0 && (
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground pr-6">
                            {details.map((d, i) => (
                              <span key={i}>{d}</span>
                            ))}
                          </div>
                        )}
                      </div>

                      {editingLoanId === loan.id ? (
                        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                          <div className="flex items-center gap-1">
                            <Label className="text-[11px] text-muted-foreground">השאלה:</Label>
                            <DateInput
                              value={editLoanDate}
                              onChange={(v) => setEditLoanDate(v)}
                              className="h-9 rounded-lg w-36 text-xs"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <Label className="text-[11px] text-muted-foreground">החזרה:</Label>
                            <DateInput
                              value={editReturnDate}
                              onChange={(v) => setEditReturnDate(v)}
                              className="h-9 rounded-lg w-36 text-xs"
                            />
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 rounded-lg"
                            disabled={!editLoanDate || updateLoanMutation.isPending}
                            onClick={() =>
                              updateLoanMutation.mutate({
                                loanId: loan.id,
                                loan_date: editLoanDate,
                                return_date: editReturnDate || null,
                              })
                            }
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-9 rounded-lg"
                            onClick={() => setEditingLoanId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(loan.loan_date), "dd/MM/yyyy")}
                            {loan.return_date && ` — ${format(new Date(loan.return_date), "dd/MM/yyyy")}`}
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 rounded-lg"
                            onClick={() => {
                              setEditingLoanId(loan.id);
                              setEditLoanDate(loan.loan_date);
                              setEditReturnDate(loan.return_date || "");
                            }}
                            title="ערוך תאריכים"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">להשאלת כלי לתלמיד — בכרטיס התלמיד.</p>
          </div>
        )}

        {isEdit && id && <InstrumentRepairsSection inventoryInstrumentId={id} />}

        <div className="flex gap-3 sticky bottom-20 md:bottom-4 z-10">
          <Button type="submit" disabled={mutation.isPending} className="flex-1 h-14 text-base font-semibold rounded-2xl shadow-lg">
            {mutation.isPending ? "שומר..." : "שמירה"}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate("/admin/inventory-instruments")} className="h-14 rounded-2xl text-base px-6">
            ביטול
          </Button>
        </div>
      </form>
    </AdminLayout>
  );
};

export default AdminInventoryInstrumentForm;
