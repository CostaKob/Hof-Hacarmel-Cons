import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

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
        <Button onClick={() => navigate("/admin/schools/new")}>
          <Plus className="h-4 w-4" /> בית ספר חדש
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground">טוען...</p>
      ) : schools.length === 0 ? (
        <p className="text-center text-muted-foreground">לא נמצאו בתי ספר</p>
      ) : (
        <div className="space-y-2">
          {schools.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-foreground">{s.name}</p>
                    {s.city && <p className="text-sm text-muted-foreground">{s.city}</p>}
                  </div>
                  <Badge variant={s.is_active ? "default" : "secondary"}>
                    {s.is_active ? "פעיל" : "לא פעיל"}
                  </Badge>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/schools/${s.id}/edit`)}>
                  עריכה
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminSchools;
