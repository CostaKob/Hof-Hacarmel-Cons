import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";

interface Props {
  teacherId: string;
}

const TeacherInstrumentsSection = ({ teacherId }: Props) => {
  const queryClient = useQueryClient();
  const [selectedInstrument, setSelectedInstrument] = useState("");

  const { data: teacherInstruments = [] } = useQuery({
    queryKey: ["admin-teacher-instruments", teacherId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teacher_instruments")
        .select("*, instruments(name)")
        .eq("teacher_id", teacherId);
      if (error) throw error;
      return data;
    },
  });

  const { data: allInstruments = [] } = useQuery({
    queryKey: ["admin-instruments-select"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const linkedIds = new Set(teacherInstruments.map((ti: any) => ti.instrument_id));
  const availableInstruments = allInstruments.filter((i) => !linkedIds.has(i.id));

  const addMutation = useMutation({
    mutationFn: async (instrumentId: string) => {
      const { error } = await supabase.from("teacher_instruments").insert({
        teacher_id: teacherId,
        instrument_id: instrumentId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-teacher-instruments", teacherId] });
      setSelectedInstrument("");
      toast.success("כלי הנגינה נוסף בהצלחה");
    },
    onError: () => toast.error("שגיאה בהוספת כלי נגינה"),
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("teacher_instruments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-teacher-instruments", teacherId] });
      toast.success("כלי הנגינה הוסר בהצלחה");
    },
    onError: () => toast.error("שגיאה בהסרת כלי נגינה"),
  });

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
      <h2 className="font-semibold text-foreground text-base">כלי נגינה ({teacherInstruments.length})</h2>
      {teacherInstruments.length === 0 ? (
        <p className="text-sm text-muted-foreground">לא שויכו כלי נגינה</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {teacherInstruments.map((ti: any) => (
            <Badge key={ti.id} variant="secondary" className="gap-1 pl-1 rounded-lg py-1.5 px-3 text-sm">
              {ti.instruments?.name}
              <button
                type="button"
                onClick={() => removeMutation.mutate(ti.id)}
                disabled={removeMutation.isPending}
                className="mr-1 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {availableInstruments.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select value={selectedInstrument} onValueChange={setSelectedInstrument}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="בחר כלי נגינה להוספה" />
              </SelectTrigger>
              <SelectContent>
                {availableInstruments.map((i) => (
                  <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="h-12 rounded-xl"
            disabled={!selectedInstrument || addMutation.isPending}
            onClick={() => selectedInstrument && addMutation.mutate(selectedInstrument)}
          >
            <Plus className="h-4 w-4" /> הוסף
          </Button>
        </div>
      )}
    </div>
  );
};

export default TeacherInstrumentsSection;
