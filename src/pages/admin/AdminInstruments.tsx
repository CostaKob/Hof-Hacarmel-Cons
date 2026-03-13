import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, ChevronLeft } from "lucide-react";

const AdminInstruments = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: instruments = [], isLoading } = useQuery({
    queryKey: ["admin-instruments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instruments").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = instruments.filter((i) =>
    !search || i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout title="כלי נגינה" backPath="/admin">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="חיפוש..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9 h-12 rounded-xl"
          />
        </div>
        <Button className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/instruments/new")}>
          <Plus className="h-4 w-4" /> כלי נגינה חדש
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו כלי נגינה</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((i) => (
            <div
              key={i.id}
              onClick={() => navigate(`/admin/instruments/${i.id}/edit`)}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
            >
              <span className="font-semibold text-foreground">{i.name}</span>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminInstruments;
