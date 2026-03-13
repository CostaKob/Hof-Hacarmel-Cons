import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronLeft } from "lucide-react";

const AdminSchools = () => {
  const navigate = useNavigate();

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ["admin-schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  return (
    <AdminLayout title="בתי ספר" backPath="/admin">
      <div className="mb-4 flex justify-end">
        <Button className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/schools/new")}>
          <Plus className="h-4 w-4" /> בית ספר חדש
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : schools.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו בתי ספר</p>
      ) : (
        <div className="space-y-2">
          {schools.map((s) => (
            <div
              key={s.id}
              onClick={() => navigate(`/admin/schools/${s.id}/edit`)}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
            >
              <div>
                <p className="font-semibold text-foreground">{s.name}</p>
                {s.city && <p className="text-sm text-muted-foreground mt-0.5">{s.city}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={s.is_active ? "default" : "secondary"} className="rounded-lg">
                  {s.is_active ? "פעיל" : "לא פעיל"}
                </Badge>
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminSchools;
