import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";

const AdminTeachers = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ["admin-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("*").order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = teachers.filter((t) => {
    const name = `${t.first_name} ${t.last_name}`.toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (activeFilter === "active" && !t.is_active) return false;
    if (activeFilter === "inactive" && t.is_active) return false;
    return true;
  });

  return (
    <AdminLayout title="מורים" backPath="/admin">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="חיפוש לפי שם..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
          </div>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="active">פעילים</SelectItem>
              <SelectItem value="inactive">לא פעילים</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => navigate("/admin/teachers/new")}>
          <Plus className="h-4 w-4" /> מורה חדש
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground">לא נמצאו מורים</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((t) => (
            <Card key={t.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-foreground">{t.first_name} {t.last_name}</p>
                    {t.city && <p className="text-sm text-muted-foreground">{t.city}</p>}
                  </div>
                  <Badge variant={t.is_active ? "default" : "secondary"}>
                    {t.is_active ? "פעיל" : "לא פעיל"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/admin/teachers/${t.id}`)}>
                    כרטיס מורה
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/teachers/${t.id}/edit`)}>
                    עריכה
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminTeachers;
