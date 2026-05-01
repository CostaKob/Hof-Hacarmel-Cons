import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ChevronLeft, Trash2, MapPin } from "lucide-react";
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
import { CONDITION_LABELS, CONDITION_COLORS, CONDITION_OPTIONS, InstrumentCondition } from "@/lib/instrumentInventory";

const AdminInventoryInstruments = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterInstrument, setFilterInstrument] = useState<string>("all");
  const [filterCondition, setFilterCondition] = useState<string>("all");
  const [filterLocation, setFilterLocation] = useState<string>("all");
  const [toDelete, setToDelete] = useState<{ id: string; serial: string } | null>(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["admin-inventory-instruments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_instruments")
        .select("*, instruments(name), instrument_storage_locations(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: instruments = [] } = useQuery({
    queryKey: ["admin-instruments-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("id, name").order("name");
      if (error) throw error;
      return data;
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

  const filtered = items.filter((it: any) => {
    if (filterInstrument !== "all" && it.instrument_id !== filterInstrument) return false;
    if (filterCondition !== "all" && it.condition !== filterCondition) return false;
    if (filterLocation !== "all") {
      if (filterLocation === "none" && it.storage_location_id) return false;
      if (filterLocation !== "none" && it.storage_location_id !== filterLocation) return false;
    }
    if (search) {
      const s = search.toLowerCase();
      const matches =
        it.serial_number?.toLowerCase().includes(s) ||
        it.instruments?.name?.toLowerCase().includes(s) ||
        it.brand?.toLowerCase().includes(s) ||
        it.model?.toLowerCase().includes(s);
      if (!matches) return false;
    }
    return true;
  });

  const stats = items.reduce(
    (acc: Record<string, number>, it: any) => {
      acc[it.condition] = (acc[it.condition] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return (
    <AdminLayout title="מאגר כלי נגינה" backPath="/admin">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {CONDITION_OPTIONS.map((opt) => (
          <div key={opt.value} className="rounded-xl border border-border bg-card p-3 text-center">
            <p className="text-xs text-muted-foreground">{opt.label}</p>
            <p className="text-2xl font-bold text-foreground">{stats[opt.value] || 0}</p>
          </div>
        ))}
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
            onClick={() => navigate("/admin/instrument-storage-locations")}
          >
            <MapPin className="h-4 w-4" /> מיקומי אחסון
          </Button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
              <SelectValue placeholder="מצב" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל המצבים</SelectItem>
              {CONDITION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterLocation} onValueChange={setFilterLocation}>
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="מיקום" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל המיקומים</SelectItem>
              <SelectItem value="none">ללא מיקום</SelectItem>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו כלים</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-2">{filtered.length} כלים</p>
          <div className="space-y-2">
            {filtered.map((it: any) => (
              <div
                key={it.id}
                onClick={() => navigate(`/admin/inventory-instruments/${it.id}/edit`)}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-semibold text-foreground">{it.instruments?.name}</span>
                    <span className="text-sm text-muted-foreground">#{it.serial_number}</span>
                    {it.size && <Badge variant="outline" className="text-[10px]">גודל {it.size}</Badge>}
                    <Badge variant="outline" className={CONDITION_COLORS[it.condition as InstrumentCondition]}>
                      {CONDITION_LABELS[it.condition as InstrumentCondition]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                    {(it.brand || it.model) && <span>{[it.brand, it.model].filter(Boolean).join(" / ")}</span>}
                    {it.instrument_storage_locations?.name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {it.instrument_storage_locations.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
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
            ))}
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
    </AdminLayout>
  );
};

export default AdminInventoryInstruments;
