import { useNavigate, useParams } from "react-router-dom";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useTeacherSchoolMusicSchools, useTeacherSchoolMusicClasses, useTeacherSchoolMusicStudents } from "@/hooks/useTeacherSchoolMusic";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, MessageCircle, Phone, School, User, Users, Music } from "lucide-react";
import { useMemo } from "react";

/* ─── helpers ─── */

const formatWhatsApp = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
};

const PhoneLink = ({ phone }: { phone?: string | null }) => {
  if (!phone) return null;
  return (
    <span className="inline-flex items-center gap-2" dir="ltr">
      <a href={`tel:${phone}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
        <Phone className="h-3 w-3" />
        {phone}
      </a>
      <a
        href={`https://wa.me/${formatWhatsApp(phone)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-green-600 hover:text-green-700"
      >
        <MessageCircle className="h-4 w-4" />
      </a>
    </span>
  );
};

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/* ─── Students grouped by teacher (coordinator view) ─── */

const ClassStudentsGroupedByTeacher = ({ classId, groups }: { classId: string; groups: any[] }) => {
  const { data: students = [], isLoading } = useTeacherSchoolMusicStudents(classId);

  // Build a map: group_id → teacher info
  const groupMap = useMemo(() => {
    const m: Record<string, { teacherName: string; instrumentName: string }> = {};
    for (const g of groups) {
      const tName = g.teachers ? `${g.teachers.first_name} ${g.teachers.last_name}` : "ללא מורה";
      m[g.id] = { teacherName: tName, instrumentName: g.instruments?.name ?? "" };
    }
    return m;
  }, [groups]);

  // Group students by their group's teacher
  const byTeacher = useMemo(() => {
    const map: Record<string, { teacherName: string; instrumentName: string; students: any[] }> = {};
    for (const st of students) {
      const gId = st.school_music_class_group_id;
      const info = gId && groupMap[gId] ? groupMap[gId] : { teacherName: "לא משויך", instrumentName: "" };
      const key = gId ?? "__unassigned";
      if (!map[key]) map[key] = { ...info, students: [] };
      map[key].students.push(st);
    }
    return Object.values(map);
  }, [students, groupMap]);

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">טוען תלמידים...</p>;
  if (students.length === 0) return <p className="text-xs text-muted-foreground py-2">אין תלמידים משויכים</p>;

  return (
    <div className="space-y-4">
      {byTeacher.map((group, idx) => (
        <div key={idx} className="space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-1">
            <User className="h-3.5 w-3.5 text-primary" />
            <span>{group.teacherName}</span>
            {group.instrumentName && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{group.instrumentName}</Badge>
            )}
            <span className="text-xs text-muted-foreground font-normal">({group.students.length})</span>
          </div>
          <div className="grid gap-1">
            {group.students.map((st: any) => (
              <div key={st.id} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                <span className="font-medium">{st.student_first_name} {st.student_last_name}</span>
                <PhoneLink phone={st.parent_phone} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ─── Students for regular teacher (only their own) ─── */

const ClassStudentsForTeacher = ({ classId, teacherId, groups }: { classId: string; teacherId: string; groups: any[] }) => {
  const { data: allStudents = [], isLoading } = useTeacherSchoolMusicStudents(classId);

  // Filter to only students in my groups
  const myGroupIds = useMemo(
    () => new Set(groups.filter(g => g.teacher_id === teacherId).map(g => g.id)),
    [groups, teacherId]
  );

  const myStudents = useMemo(
    () => allStudents.filter(st => st.school_music_class_group_id && myGroupIds.has(st.school_music_class_group_id)),
    [allStudents, myGroupIds]
  );

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">טוען תלמידים...</p>;
  if (myStudents.length === 0) return <p className="text-xs text-muted-foreground py-2">אין תלמידים משויכים</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Users className="h-3.5 w-3.5" />
        התלמידים שלי ({myStudents.length})
      </p>
      <div className="grid gap-1">
        {myStudents.map((st: any) => (
          <div key={st.id} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium">{st.student_first_name} {st.student_last_name}</span>
              {st.instruments?.name && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{st.instruments.name}</Badge>
              )}
            </div>
            <PhoneLink phone={st.parent_phone} />
          </div>
        ))}
      </div>
    </div>
  );
};

/* ─── Staff Section ─── */

const StaffSection = ({ schoolId }: { schoolId: string }) => {
  const { data: staff = [], isLoading } = useQuery({
    queryKey: ["school-music-staff-list", schoolId],
    enabled: !!schoolId,
    queryFn: async () => {
      // Get all class groups for this school
      const { data: classes } = await supabase
        .from("school_music_classes")
        .select("id")
        .eq("school_music_school_id", schoolId);
      if (!classes || classes.length === 0) return [];

      const classIds = classes.map(c => c.id);
      const { data: groups } = await supabase
        .from("school_music_class_groups")
        .select("teacher_id, instrument_id, instruments(name), teachers(first_name, last_name, phone)")
        .in("school_music_class_id", classIds);
      if (!groups) return [];

      // Deduplicate by teacher_id
      const seen = new Map<string, any>();
      for (const g of groups) {
        if (!seen.has(g.teacher_id)) {
          seen.set(g.teacher_id, {
            id: g.teacher_id,
            name: g.teachers ? `${g.teachers.first_name} ${g.teachers.last_name}` : "",
            phone: g.teachers?.phone,
            instrument: g.instruments?.name ?? "",
          });
        }
      }
      return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name, "he"));
    },
  });

  if (isLoading) return null;
  if (staff.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Music className="h-4 w-4" />
          צוות המורים ({staff.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {staff.map((t: any) => (
          <div key={t.id} className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">{t.name}</span>
              {t.instrument && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t.instrument}</Badge>
              )}
            </div>
            <PhoneLink phone={t.phone} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

/* ─── Main Page ─── */

const TeacherSchoolMusicSchoolCard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: teacher } = useTeacherProfile();
  const { data: schools = [] } = useTeacherSchoolMusicSchools(teacher?.id);

  const schoolMeta = useMemo(
    () => schools.find((s: any) => s.id === id),
    [schools, id]
  );
  const isCoordinatorOrConductor = useMemo(() => {
    if (!schoolMeta) return false;
    return schoolMeta.teacherRoles?.includes("רכז") || schoolMeta.teacherRoles?.includes("מנצח");
  }, [schoolMeta]);

  // Fetch school info
  const { data: school, isLoading: schoolLoading } = useQuery({
    queryKey: ["teacher-school-music-school-info", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_schools")
        .select("id, school_name, principal_name, principal_phone, vice_principal_name, vice_principal_phone, coordinator_teacher_id, conductor_teacher_id")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Fetch coordinator & conductor names
  const coordId = school?.coordinator_teacher_id;
  const condId = school?.conductor_teacher_id;
  const { data: staffTeachers } = useQuery({
    queryKey: ["school-music-staff-teachers", coordId, condId],
    enabled: !!(coordId || condId),
    queryFn: async () => {
      const ids = [coordId, condId].filter(Boolean) as string[];
      if (ids.length === 0) return [];
      const { data, error } = await supabase
        .from("teachers")
        .select("id, first_name, last_name, phone")
        .in("id", ids);
      if (error) throw error;
      return data ?? [];
    },
  });

  const coordinator = staffTeachers?.find((t) => t.id === coordId);
  const conductor = staffTeachers?.find((t) => t.id === condId);

  // Fetch classes
  const { data: classes = [], isLoading: classesLoading } = useTeacherSchoolMusicClasses(
    id,
    teacher?.id,
    isCoordinatorOrConductor
  );

  const isLoading = schoolLoading || classesLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary px-5 pb-6 pt-6 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground shrink-0"
            onClick={() => navigate("/teacher/school-music-schools")}
          >
            <ChevronLeft className="h-5 w-5 rotate-180" />
          </Button>
          <h1 className="text-lg font-bold truncate">{school?.school_name ?? "טוען..."}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-5">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : (
          <>
            {/* Role badges — with spacing from header */}
            {schoolMeta?.teacherRoles?.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-3">
                {schoolMeta.teacherRoles.map((role: string) => (
                  <Badge
                    key={role}
                    variant={role === "רכז" || role === "מנצח" ? "default" : "secondary"}
                    className="text-xs"
                  >
                    {role}
                  </Badge>
                ))}
              </div>
            )}

            {/* School Info Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <School className="h-4 w-4" />
                  פרטי בית הספר
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {school?.principal_name && (
                  <div className="flex items-center justify-between">
                    <span>
                      <span className="text-muted-foreground">מנהל/ת: </span>
                      {school.principal_name}
                    </span>
                    <PhoneLink phone={school.principal_phone} />
                  </div>
                )}
                {school?.vice_principal_name && (
                  <div className="flex items-center justify-between">
                    <span>
                      <span className="text-muted-foreground">סגן/ית: </span>
                      {school.vice_principal_name}
                    </span>
                    <PhoneLink phone={school.vice_principal_phone} />
                  </div>
                )}
                {coordinator && (
                  <div className="flex items-center justify-between">
                    <span>
                      <span className="text-muted-foreground">רכז/ת: </span>
                      {coordinator.first_name} {coordinator.last_name}
                    </span>
                    <PhoneLink phone={coordinator.phone} />
                  </div>
                )}
                {conductor && (
                  <div className="flex items-center justify-between">
                    <span>
                      <span className="text-muted-foreground">מנצח/ת: </span>
                      {conductor.first_name} {conductor.last_name}
                    </span>
                    <PhoneLink phone={conductor.phone} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Classes Accordion */}
            {classes.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">לא נמצאו כיתות</p>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {isCoordinatorOrConductor ? `כל הכיתות (${classes.length})` : `הכיתות שלי (${classes.length})`}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-2">
                  <Accordion type="multiple" className="space-y-1">
                    {classes.map((cls: any) => (
                      <AccordionItem key={cls.id} value={cls.id} className="border rounded-xl px-3">
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex flex-col items-start gap-1 text-right w-full">
                            <span className="font-semibold text-sm">{cls.class_name}</span>
                            <div className="flex flex-wrap gap-1">
                              {cls.day_of_week != null && (
                                <Badge variant="outline" className="text-[10px]">
                                  יום {DAY_NAMES[cls.day_of_week]}
                                </Badge>
                              )}
                              {cls.start_time && cls.end_time && (
                                <Badge variant="outline" className="text-[10px]" dir="ltr">
                                  {cls.start_time?.slice(0, 5)}–{cls.end_time?.slice(0, 5)}
                                </Badge>
                              )}
                              {!isCoordinatorOrConductor && cls.groups?.filter((g: any) => g.teacher_id === teacher?.id).map((g: any) => (
                                <Badge key={g.id} variant="secondary" className="text-[10px]">
                                  {g.instruments?.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4 space-y-3">
                          {/* Homeroom teacher */}
                          {cls.homeroom_teacher_name && (
                            <div className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                              <span>
                                <span className="text-muted-foreground">מחנכ/ת: </span>
                                {cls.homeroom_teacher_name}
                              </span>
                              <PhoneLink phone={cls.homeroom_teacher_phone} />
                            </div>
                          )}

                          {/* Students — conditional rendering */}
                          {isCoordinatorOrConductor ? (
                            <ClassStudentsGroupedByTeacher classId={cls.id} groups={cls.groups ?? []} />
                          ) : (
                            <ClassStudentsForTeacher classId={cls.id} teacherId={teacher?.id!} groups={cls.groups ?? []} />
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            )}

            {/* Staff Section — only for coordinator/conductor */}
            {isCoordinatorOrConductor && id && <StaffSection schoolId={id} />}
          </>
        )}
      </main>
    </div>
  );
};

export default TeacherSchoolMusicSchoolCard;
