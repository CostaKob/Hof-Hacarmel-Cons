import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { BriefcaseBusiness, Loader2, Mail, Printer } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import PageTitle from "@/components/PageTitle";
import PhoneDisplay from "@/components/PhoneDisplay";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type TeacherContact = {
  teacher_id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  is_freelance: boolean;
};

const PublicTeacherContacts = () => {
  const [searchParams] = useSearchParams();
  const { data: teachers = [], isLoading, error } = useQuery({
    queryKey: ["public-teacher-contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("public_teacher_contacts")
        .select("teacher_id, first_name, last_name, phone, email, is_freelance")
        .order("last_name")
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as TeacherContact[];
    },
  });

  useEffect(() => {
    if (isLoading || error || searchParams.get("print") !== "1") return;
    const timer = window.setTimeout(() => window.print(), 250);
    return () => window.clearTimeout(timer);
  }, [error, isLoading, searchParams]);

  return (
    <div className="min-h-screen bg-background teacher-contact-page" dir="rtl">
      <PageTitle title="דף קשר מורים" />
      <main className="mx-auto max-w-4xl px-4 py-6 teacher-contact-sheet">
        <div className="mb-4 flex justify-end teacher-contact-actions">
          <Button className="h-12 rounded-xl" onClick={() => window.print()}>
            <Printer className="h-4 w-4" /> הדפסה / שמירה כ־PDF
          </Button>
        </div>

        <header className="mb-5 flex flex-col items-center gap-2 text-center teacher-contact-header">
          <AppLogo size="lg" />
          <p className="text-sm text-muted-foreground">אולפן ומגמת המוסיקה חוף הכרמל</p>
          <h1 className="text-2xl font-semibold text-foreground">דף קשר מורים</h1>
          {!isLoading && !error && (
            <p className="text-sm text-muted-foreground">{teachers.length} מורים ומורות פעילים</p>
          )}
        </header>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <p className="py-12 text-center text-muted-foreground">לא ניתן לטעון את רשימת המורים</p>
        ) : teachers.length === 0 ? (
          <p className="py-12 text-center text-muted-foreground">אין מורים פעילים להצגה</p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-2 teacher-contact-list">
            {teachers.map((teacher, index) => (
              <li
                key={teacher.teacher_id}
                className="rounded-xl border border-border bg-card p-4 shadow-sm teacher-contact-person"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{index + 1}.</span>
                      {teacher.first_name} {teacher.last_name}
                    </p>
                    <div className="mt-2 flex flex-col items-start gap-1.5 text-sm text-muted-foreground">
                      {teacher.phone ? (
                        <PhoneDisplay phone={teacher.phone} showIcon textClassName="text-sm" />
                      ) : (
                        <span>ללא טלפון</span>
                      )}
                      {teacher.email ? (
                        <a
                          href={`mailto:${teacher.email}`}
                          dir="ltr"
                          className="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0" />
                          <span className="break-all">{teacher.email}</span>
                        </a>
                      ) : (
                        <span>ללא מייל</span>
                      )}
                    </div>
                  </div>
                  <Badge variant={teacher.is_freelance ? "outline" : "secondary"} className="shrink-0 rounded-lg">
                    <BriefcaseBusiness className="ml-1 h-3 w-3" />
                    {teacher.is_freelance ? "עצמאי" : "שכיר"}
                  </Badge>
                </div>
              </li>
            ))}
          </ol>
        )}
      </main>
    </div>
  );
};

export default PublicTeacherContacts;