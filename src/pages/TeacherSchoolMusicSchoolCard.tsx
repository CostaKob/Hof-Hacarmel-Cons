import { useNavigate, useParams } from "react-router-dom";
import { useTeacherProfile } from "@/hooks/useTeacherData";
import { useTeacherSchoolMusicClasses, useTeacherSchoolMusicStudents } from "@/hooks/useTeacherSchoolMusic";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, MessageCircle, Phone, School, User, Users } from "lucide-react";

const formatWhatsApp = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
};

const PhoneLink = ({ phone, label }: { phone?: string | null; label?: string }) => {
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

/** Inner component to fetch and display students for a class */
const ClassStudents = ({ classId }: { classId: string }) => {
  const { data: students = [], isLoading } = useTeacherSchoolMusicStudents(classId);

  if (isLoading) return <p className="text-xs text-muted-foreground py-2">טוען תלמידים...</p>;
  if (students.length === 0) return <p className="text-xs text-muted-foreground py-2">אין תלמידים משויכים</p>;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        <Users className="h-3.5 w-3.5" />
        תלמידים ({students.length})
      </p>
      <div className="grid gap-1.5">
        {students.map((st: any) => (
          <div
            key={st.id}
            className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2 text-sm"
          >
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="font-medium">
                {st.student_first_name} {st.student_last_name}
              </span>
              {st.instruments?.name && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {st.instruments.name}
                </Badge>
              )}
            </div>
            <PhoneLink phone={st.parent_phone} />
          </div>
        ))}
      </div>
    </div>
  );
};

const DAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

const TeacherSchoolMusicSchoolCard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: teacher } = useTeacherProfile();

  // Fetch school info
  const { data: school, isLoading: schoolLoading } = useQuery({
    queryKey: ["teacher-school-music-school-info", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_schools")
        .select("id, school_name, principal_name, principal_phone, vice_principal_name, vice_principal_phone")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch classes with groups
  const { data: classes = [], isLoading: classesLoading } = useTeacherSchoolMusicClasses(id, teacher?.id);

  const isLoading = schoolLoading || classesLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-5 pb-5 pt-6 text-primary-foreground">
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

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-4">
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : (
          <>
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
              </CardContent>
            </Card>

            {/* Classes Accordion */}
            {classes.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">לא נמצאו כיתות</p>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">הכיתות שלי ({classes.length})</CardTitle>
                </CardHeader>
                <CardContent className="pb-2">
                  <Accordion type="multiple" className="space-y-1">
                    {classes.map((cls: any) => (
                      <AccordionItem key={cls.id} value={cls.id} className="border rounded-xl px-3">
                        <AccordionTrigger className="py-3 hover:no-underline">
                          <div className="flex flex-col items-start gap-1 text-right">
                            <span className="font-semibold text-sm">{cls.class_name}</span>
                            <div className="flex flex-wrap gap-1">
                              {cls.groups?.map((g: any) => (
                                <Badge key={g.id} variant="secondary" className="text-[10px]">
                                  {g.instruments?.name}
                                </Badge>
                              ))}
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
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="pb-4 space-y-3">
                          {/* Homeroom teacher */}
                          {cls.homeroom_teacher_name && (
                            <div className="flex items-center justify-between rounded-lg border p-2.5 text-sm">
                              <span>
                                <span className="text-muted-foreground">מחנכת: </span>
                                {cls.homeroom_teacher_name}
                              </span>
                              <PhoneLink phone={cls.homeroom_teacher_phone} />
                            </div>
                          )}
                          {/* Students */}
                          <ClassStudents classId={cls.id} />
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default TeacherSchoolMusicSchoolCard;
