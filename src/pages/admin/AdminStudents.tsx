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

const AdminStudents = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<string>("all");

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["admin-students"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("*")
        .order("last_name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = students.filter((s) => {
    const name = `${s.first_name} ${s.last_name}`.toLowerCase();
    if (search && !name.includes(search.toLowerCase())) return false;
    if (activeFilter === "active" && !s.is_active) return false;
    if (activeFilter === "inactive" && s.is_active) return false;
    return true;
  });

  return (
    <AdminLayout title="תלמידים" backPath="/admin">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="חיפוש לפי שם..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pr-9"
            />
          </div>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="active">פעילים</SelectItem>
              <SelectItem value="inactive">לא פעילים</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => navigate("/admin/students/new")}>
          <Plus className="h-4 w-4" />
          תלמיד חדש
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground">לא נמצאו תלמידים</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((s) => (
            <Card key={s.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <div>
                    <p className="font-medium text-foreground">{s.first_name} {s.last_name}</p>
                    {s.city && <p className="text-sm text-muted-foreground">{s.city}</p>}
                  </div>
                  <Badge variant={s.is_active ? "default" : "secondary"}>
                    {s.is_active ? "פעיל" : "לא פעיל"}
                  </Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate(`/admin/students/${s.id}`)}>
                    כרטיס תלמיד
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/students/${s.id}/edit`)}>
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

export default AdminStudents;
