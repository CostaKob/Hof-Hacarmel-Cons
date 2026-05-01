import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Music, ArrowLeft, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { CONDITION_COLORS, CONDITION_LABELS, InstrumentCondition } from "@/lib/instrumentInventory";

interface Props {
  studentType: "private" | "school_music";
  studentId: string;
}

const StudentInstrumentLoansSection = ({ studentType, studentId }: Props) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selectedInstrumentType, setSelectedInstrumentType] = useState<string>("all");
  const [selectedInventoryId, setSelectedInventoryId] = useState<string>("");
  const [loanDate, setLoanDate] = useState(new Date().toISOString().split("T")[0]);
  const [returningId, setReturningId] = useState<string | null>(null);
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split("T")[0]);

  const filterColumn = studentType === "private" ? "student_id" : "school_music_student_id";

  const { data: loans = [] } = useQuery({
    queryKey: ["student-instrument-loans", studentType, studentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instrument_loans")
        .select(`
          *,
          inventory_instruments(id, serial_number, brand, model, size, condition, instruments(name))
        `)
        .eq(filterColumn, studentId)
        .order("loan_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: instrumentTypes = [] } = useQuery({
    queryKey: ["admin-instruments-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: availableInstruments = [] } = useQuery({
    queryKey: ["available-inventory-instruments", selectedInstrumentType],
    queryFn: async () => {
      let q = supabase
        .from("inventory_instruments")
        .select("id, serial_number, brand, model, instruments(name)")
        .eq("condition", "available")
        .order("created_at", { ascending: false });
      if (selectedInstrumentType !== "all") q = q.eq("instrument_id", selectedInstrumentType);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
    enabled: open,
  });

  const loanMutation = useMutation({
    mutationFn: async () => {
      if (!selectedInventoryId) throw new Error("בחר כלי");
      // Insert loan
      const loanPayload: any = {
        inventory_instrument_id: selectedInventoryId,
        loan_date: loanDate,
      };
      loanPayload[filterColumn] = studentId;
      const { error: loanErr } = await supabase.from("instrument_loans").insert(loanPayload);
      if (loanErr) throw loanErr;
      // Mark instrument as loaned
      const { error: updErr } = await supabase
        .from("inventory_instruments")
        .update({ condition: "loaned" })
        .eq("id", selectedInventoryId);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-instrument-loans"] });
      qc.invalidateQueries({ queryKey: ["available-inventory-instruments"] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      setOpen(false);
      setSelectedInventoryId("");
      setSelectedInstrumentType("all");
      toast.success("הכלי הושאל לתלמיד");
    },
    onError: (e: any) => toast.error(e.message || "שגיאה בהשאלה"),
  });

  const returnMutation = useMutation({
    mutationFn: async ({ loanId, inventoryId }: { loanId: string; inventoryId: string }) => {
      const { error } = await supabase
        .from("instrument_loans")
        .update({ return_date: returnDate })
        .eq("id", loanId);
      if (error) throw error;
      // Set instrument back to available
      const { error: updErr } = await supabase
        .from("inventory_instruments")
        .update({ condition: "available" })
        .eq("id", inventoryId);
      if (updErr) throw updErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["student-instrument-loans"] });
      qc.invalidateQueries({ queryKey: ["admin-inventory-instruments"] });
      setReturningId(null);
      toast.success("ההחזרה נרשמה");
    },
    onError: () => toast.error("שגיאה בהחזרה"),
  });

  const activeLoans = loans.filter((l: any) => !l.return_date);
  const pastLoans = loans.filter((l: any) => l.return_date);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-foreground text-base flex items-center gap-2">
          <Music className="h-4 w-4" />
          כלי נגינה ({activeLoans.length} פעיל, {pastLoans.length} בעבר)
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-10 rounded-xl">
              <Plus className="h-4 w-4" /> השאל כלי
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto overscroll-contain">
            <DialogHeader>
              <DialogTitle>השאלת כלי נגינה</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm">סינון לפי סוג כלי</Label>
                <Select value={selectedInstrumentType} onValueChange={(v) => { setSelectedInstrumentType(v); setSelectedInventoryId(""); }}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל הסוגים</SelectItem>
                    {instrumentTypes.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">בחר כלי זמין ({availableInstruments.length})</Label>
                <Select value={selectedInventoryId} onValueChange={setSelectedInventoryId}>
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="בחר כלי..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableInstruments.length === 0 && (
                      <div className="p-3 text-sm text-muted-foreground text-center">אין כלים זמינים</div>
                    )}
                    {availableInstruments.map((it: any) => (
                      <SelectItem key={it.id} value={it.id}>
                        {it.instruments?.name} #{it.serial_number}
                        {(it.brand || it.model) && ` — ${[it.brand, it.model].filter(Boolean).join(" ")}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm">תאריך השאלה</Label>
                <Input type="date" value={loanDate} onChange={(e) => setLoanDate(e.target.value)} className="h-12 rounded-xl" />
              </div>

              <div className="flex flex-col gap-2 sticky bottom-0 bg-card pt-2">
                <Button
                  onClick={() => loanMutation.mutate()}
                  disabled={!selectedInventoryId || loanMutation.isPending}
                  className="h-12 rounded-xl w-full"
                >
                  {loanMutation.isPending ? "משייך..." : "אישור השאלה"}
                </Button>
                <Button variant="outline" onClick={() => setOpen(false)} className="h-12 rounded-xl w-full">
                  ביטול
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active loans */}
      {activeLoans.length > 0 && (
        <div className="space-y-2">
          {activeLoans.map((loan: any) => {
            const inv = loan.inventory_instruments;
            return (
              <div key={loan.id} className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/inventory-instruments/${inv?.id}/edit`)}
                    className="text-right flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-foreground">{inv?.instruments?.name}</span>
                      <span className="text-sm text-muted-foreground">#{inv?.serial_number}</span>
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </div>
                    {(inv?.brand || inv?.model) && (
                      <p className="text-xs text-muted-foreground">{[inv.brand, inv.model].filter(Boolean).join(" / ")}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      הושאל ב-{format(new Date(loan.loan_date), "dd/MM/yyyy")}
                    </p>
                  </button>
                  {returningId === loan.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={returnDate}
                        onChange={(e) => setReturnDate(e.target.value)}
                        className="h-9 rounded-lg w-36"
                      />
                      <Button
                        size="sm"
                        className="h-9 rounded-lg"
                        onClick={() => returnMutation.mutate({ loanId: loan.id, inventoryId: inv.id })}
                        disabled={returnMutation.isPending}
                      >
                        אישור
                      </Button>
                      <Button size="sm" variant="ghost" className="h-9 rounded-lg" onClick={() => setReturningId(null)}>
                        בטל
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="h-9 rounded-lg" onClick={() => setReturningId(loan.id)}>
                      <ArrowLeft className="h-4 w-4" /> החזר
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Past loans */}
      {pastLoans.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground font-medium">היסטוריה ({pastLoans.length})</summary>
          <div className="space-y-2 mt-2">
            {pastLoans.map((loan: any) => {
              const inv = loan.inventory_instruments;
              return (
                <div key={loan.id} className="flex items-center justify-between rounded-xl border border-border p-3 bg-background">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{inv?.instruments?.name}</span>
                      <span className="text-xs text-muted-foreground">#{inv?.serial_number}</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(loan.loan_date), "dd/MM/yyyy")} — {format(new Date(loan.return_date), "dd/MM/yyyy")}
                  </div>
                </div>
              );
            })}
          </div>
        </details>
      )}

      {loans.length === 0 && (
        <p className="text-sm text-muted-foreground">לא הושאלו כלים לתלמיד זה</p>
      )}
    </div>
  );
};

export default StudentInstrumentLoansSection;
