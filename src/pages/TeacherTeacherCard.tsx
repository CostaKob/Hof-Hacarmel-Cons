import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import PageTitle from "@/components/PageTitle";
import { isInactiveStudentStatus } from "@/lib/constants";
import {
  ArrowRight,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Music,
  School,
  GraduationCap,
  Users,
} from "lucide-react";

const TeacherTeacherCard = () => {
  const { schoolId, teacherId } = useParams<{ schoolId: string; teacherId: string }>();
  const navigate = useNavigate();
  const { selectedYearId } = useAcademicYear();

  const { data: teacher, isLoading: teacherLoading } = useQuery({
    queryKey: ["branch-teacher-detail", teacherId],
    enabled: !!teacherId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("*")
        .eq("id", teacherId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: enrollments = [], isLoading: enrollmentsLoading } = useQuery({
    queryKey: ["branch-teacher-enrollments", teacherId, schoolId, selectedYearId],
    enabled: !!teacherId && !!schoolId && !!selectedYearId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select(`*, students (*), instruments (name), schools (name)`)
        .eq("teacher_id", teacherId!)
        .eq("school_id", schoolId!)
        .eq("academic_year_id", selectedYearId!)
        .eq("is_active", true)
        .returns<any[]>();
      if (error) throw error;
      return (data ?? []).filter((e) => !isInactiveStudentStatus(e.students?.student_status));
    },
  });

  const loading = teacherLoading || enrollmentsLoading;

  if (loading) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center bg-background">
        <PageTitle title="כרטיס מורה" />
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!teacher) {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background">
        <PageTitle title="כרטיס מורה" />
        <p className="text-muted-foreground">מורה לא נמצא</p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          חזרה
        </Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <PageTitle title={`כרטיס מורה — ${teacher.first_name} ${teacher.last_name}`} />
      <header className="bg-primary px-5 pb-8 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => navigate(-1)}
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <h1 className="text-lg font-bold truncate">
              {teacher.first_name} {teacher.last_name}
            </h1>
            <p className="text-sm opacity-80">כרטיס מורה</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 -mt-4 pb-24 space-y-4">
        {/* Personal details */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            פרטים אישיים
          </h2>
          <div className="space-y-3 text-sm">
            <InfoRow icon={User} label="שם מלא" value={`${teacher.first_name} ${teacher.last_name}`} />
            <InfoRow icon={User} label="תעודת זהות" value={teacher.national_id} />
            <InfoRow icon={Calendar} label="תאריך לידה" value={teacher.birth_date} />
            {teacher.phone && (
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">טלפון:</span>
                <PhoneDisplay phone={teacher.phone} showIcon textClassName="text-foreground" />
              </div>
            )}
            {teacher.email && (
              <a href={`mailto:${teacher.email}`} className="flex items-center gap-2 text-primary">
                <Mail className="h-4 w-4 shrink-0" />
                <span className="text-muted-foreground">אימייל:</span>
                <span className="truncate">{teacher.email}</span>
              </a>
            )}
            <InfoRow icon={MapPin} label="כתובת" value={teacher.address} />
            <InfoRow icon={MapPin} label="ישוב מגורים" value={teacher.city} />
            <div className="flex flex-wrap gap-2 pt-1">
              <Badge variant={teacher.is_active ? "default" : "secondary"} className="rounded-lg">
                {teacher.is_active ? "פעיל" : "לא פעיל"}
              </Badge>
              {(teacher as any).is_freelance && (
                <Badge variant="outline" className="rounded-lg">עצמאי</Badge>
              )}
              {(teacher as any).is_office && (
                <Badge variant="outline" className="rounded-lg">משרד</Badge>
              )}
            </div>
            {(teacher as any).bio && (
              <p className="text-muted-foreground text-sm leading-relaxed pt-1">{(teacher as any).bio}</p>
            )}
          </div>
        </div>

        {/* Branch students */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            תלמידים בשלוחה ({enrollments.length})
          </h2>
          {enrollmentsLoading ? (
            <p className="text-center text-muted-foreground py-4">טוען...</p>
          ) : enrollments.length === 0 ? (
            <p className="text-center text-muted-foreground py-4">אין תלמידים פעילים בשלוחה זו</p>
          ) : (
            <div className="space-y-2">
              {enrollments.map((e: any) => {
                const s = e.students;
                return (
                  <Card
                    key={e.id}
                    onClick={() => navigate(`/teacher/students/${e.id}`)}
                    className="cursor-pointer transition-all hover:shadow-md active:scale-[0.99]"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">
                            {s?.first_name} {s?.last_name}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground mt-1">
                            <span className="flex items-center gap-1">
                              <Music className="h-3.5 w-3.5" />
                              {e.instruments?.name}
                            </span>
                            <span>·</span>
                            <span>{e.lesson_duration_minutes} דק׳</span>
                            {(s?.grade || e.grade) && (
                              <>
                                <span>·</span>
                                <span className="flex items-center gap-1">
                                  <GraduationCap className="h-3.5 w-3.5" />
                                  כיתה {s?.grade ?? e.grade}
                                </span>
                              </>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {s?.parent_name && <span>{s.parent_name}</span>}
                            {s?.parent_phone && (
                              <>
                                <span className="mx-1">·</span>
                                <PhoneDisplay phone={s.parent_phone} textClassName="text-sm text-muted-foreground" />
                              </>
                            )}
                          </div>
                        </div>
                        <School className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: React.ElementType;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground">{value || "—"}</span>
    </div>
  );
}

export default TeacherTeacherCard;
