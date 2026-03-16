import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, ChevronLeft, CheckCircle2, XCircle } from "lucide-react";

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const getTimeRange = (school: any) => {
  const day = school.day_of_week != null ? `יום ${DAY_NAMES[school.day_of_week]}` : null;
  const schedules: { start_time: string; end_time: string }[] = school.class_schedules || [];
  if (schedules.length === 0) return day;
  const starts = schedules.map(s => s.start_time).filter(Boolean);
  const ends = schedules.map(s => s.end_time).filter(Boolean);
  if (starts.length === 0 || ends.length === 0) return day;
  const first = starts.sort()[0];
  const last = ends.sort().reverse()[0];
  const timeStr = `${first}–${last}`;
  return day ? `${day}, ${timeStr}` : timeStr;
};

const AdminSchoolMusicSchools = () => {
  const navigate = useNavigate();

  const { data: schools = [], isLoading } = useQuery({
    queryKey: ["school-music-schools"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_schools")
        .select("*, academic_years(name)")
        .order("school_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: groupCounts = {} } = useQuery({
    queryKey: ["school-music-groups-count"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_groups")
        .select("school_music_school_id");
      if (error) throw error;
      const counts: Record<string, number> = {};
      data.forEach((g: any) => {
        counts[g.school_music_school_id] = (counts[g.school_music_school_id] || 0) + 1;
      });
      return counts;
    },
  });

  return (
    <AdminLayout title="בתי ספר מנגנים" backPath="/admin">
      <div className="mb-4 flex justify-end">
        <Button className="h-12 rounded-xl text-base" onClick={() => navigate("/admin/school-music-schools/new")}>
          <Plus className="h-4 w-4" /> צור בית ספר חדש
        </Button>
      </div>

      {isLoading ? (
        <p className="text-center text-muted-foreground py-8">טוען...</p>
      ) : schools.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו בתי ספר מנגנים</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-2">{schools.length} בתי ספר</p>
          <div className="space-y-2">
            {schools.map((s: any, index: number) => (
              <div
                key={s.id}
                onClick={() => navigate(`/admin/school-music-schools/${s.id}`)}
                className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-xs text-muted-foreground w-6 shrink-0 text-center">{index + 1}</span>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{s.school_name}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground mt-0.5">
                      <span>{(s as any).academic_years?.name || "—"}</span>
                      <span>{groupCounts[s.id] || 0} קבוצות</span>
                      {getTimeRange(s) && <span>{getTimeRange(s)}</span>}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        רכז: {s.coordinator_teacher_id ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/50" />}
                      </span>
                      <span className="flex items-center gap-1">
                        מנצח: {s.conductor_teacher_id ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-muted-foreground/50" />}
                      </span>
                    </div>
                  </div>
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
        </>
      )}
    </AdminLayout>
  );
};

export default AdminSchoolMusicSchools;
