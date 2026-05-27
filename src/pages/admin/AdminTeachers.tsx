import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import { useListStatePreservation, usePersistedState } from "@/hooks/useListStatePreservation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, ChevronLeft, FileSpreadsheet, KeyRound } from "lucide-react";
import TeacherImportDialog from "@/components/admin/TeacherImportDialog";
import { sortByPerson } from "@/lib/sortHebrew";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const AdminTeachers = () => {
  const navigate = useNavigate();
  useListStatePreservation("/admin/teachers");
  const [search, setSearch] = usePersistedState<string>("/admin/teachers", "search", "");
  const [activeFilter, setActiveFilter] = usePersistedState<string>("/admin/teachers", "active", "active");
  const [typeFilter, setTypeFilter] = usePersistedState<string>("/admin/teachers", "type", "all");
  const [importOpen, setImportOpen] = useState(false);
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleResetAllPasswords = async () => {
    setResetting(true);
    const { data, error } = await supabase.functions.invoke("reset-all-teacher-passwords");
    setResetting(false);
    setResetAllOpen(false);
    if (error) {
      toast.error(`שגיאה: ${error.message}`);
      return;
    }
    const updated = (data as any)?.updated ?? 0;
    const failed = (data as any)?.failed ?? [];
    if (failed.length > 0) {
      toast.warning(`עודכנו ${updated} סיסמאות, ${failed.length} נכשלו`);
    } else {
      toast.success(`עודכנו ${updated} סיסמאות ל-123456`);
    }
  };

  const { data: teachers = [], isLoading } = useQuery({
    queryKey: ["admin-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("teachers").select("*, teacher_instruments(instrument:instruments(name))");
      if (error) throw error;
      return sortByPerson(data as any);
    },
  });


  const filtered = teachers.filter((t) => {
    if (search) {
      const q = search.toLowerCase();
      const searchStr = `${t.first_name ?? ""} ${t.last_name ?? ""} ${t.national_id ?? ""} ${t.phone ?? ""} ${t.email ?? ""} ${t.city ?? ""} ${t.address ?? ""}`.toLowerCase();
      if (!searchStr.includes(q)) return false;
    }
    if (activeFilter === "active" && !t.is_active) return false;
    if (activeFilter === "inactive" && t.is_active) return false;
    if (typeFilter === "freelance" && !t.is_freelance) return false;
    if (typeFilter === "employee" && (t.is_freelance || (t as any).is_office)) return false;
    if (typeFilter === "office" && !(t as any).is_office) return false;
    return true;
  });

  return (
    <AdminLayout title="מורים" backPath="/admin">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="חיפוש: שם, ת.ז, טלפון, אימייל, עיר..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9 h-12 rounded-xl" />
          </div>
          <Select value={activeFilter} onValueChange={setActiveFilter}>
            <SelectTrigger className="w-32 h-11 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="active">פעילים</SelectItem>
              <SelectItem value="inactive">לא פעילים</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32 h-11 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="employee">שכירים</SelectItem>
              <SelectItem value="freelance">עצמאיים</SelectItem>
              <SelectItem value="office">משרד</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="h-12 rounded-xl text-base" onClick={() => setResetAllOpen(true)}>
            <KeyRound className="h-4 w-4" /> אפס סיסמאות לכולם
          </Button>
          <Button variant="outline" className="h-12 rounded-xl text-base" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" /> ייבוא מאקסל
          </Button>
          <Button className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/teachers/new")}>
            <Plus className="h-4 w-4" /> מורה חדש
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו מורים</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-2">{filtered.length} מורים</p>
          <div className="space-y-2">
            {filtered.map((t, index) => (
              <div
                key={t.id}
                onClick={() => navigate(`/admin/teachers/${t.id}`)}
                className={`flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99] ${!t.is_active ? "opacity-50" : ""}`}
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">{index + 1}</span>
                  <div>
                    <p className="font-semibold text-foreground">{t.last_name} {t.first_name}</p>
                    <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground mt-0.5">
                      {t.phone && <PhoneDisplay phone={t.phone} stopPropagation textClassName="text-sm text-muted-foreground" />}
                      {t.city && <><span>·</span><span>{t.city}</span></>}
                    </div>
                    {(() => {
                      const names = (((t as any).teacher_instruments ?? []) as any[])
                        .map((ti) => ti?.instrument?.name)
                        .filter(Boolean);
                      if (names.length === 0) return null;
                      return (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {names.map((n: string) => (
                            <span
                              key={n}
                              className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-xs font-medium"
                            >
                              🎵 {n}
                            </span>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {t.is_freelance && <Badge variant="outline" className="rounded-lg">עצמאי</Badge>}
                  {(t as any).is_office && <Badge variant="outline" className="rounded-lg border-amber-500 text-amber-700">משרד</Badge>}
                  <Badge variant={t.is_active ? "default" : "secondary"} className="rounded-lg">
                    {t.is_active ? "פעיל" : "לא פעיל"}
                  </Badge>
                  <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <TeacherImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </AdminLayout>
  );
};

export default AdminTeachers;
