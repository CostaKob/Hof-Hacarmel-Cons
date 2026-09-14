import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLogo from "@/components/AppLogo";
import PageTitle from "@/components/PageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import PhoneDisplay from "@/components/PhoneDisplay";
import { Loader2, Music2, GraduationCap } from "lucide-react";

type StaffRow = {
  name: string;
  phone: string | null;
  email: string | null;
  roles: string[];
};

type BranchContacts = {
  branch_name: string;
  school_music: StaffRow[];
  private: StaffRow[];
};

const StaffList = ({ rows }: { rows: StaffRow[] }) => {
  if (rows.length === 0)
    return <p className="px-4 py-3 text-sm text-muted-foreground">אין מורים משובצים</p>;
  return (
    <ul className="divide-y">
      {rows.map((r, i) => (
        <li key={i} className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-[15px]">{r.name}</span>
            {r.roles.map((role) => (
              <Badge key={role} variant="outline" className="rounded-lg text-xs font-normal">
                {role}
              </Badge>
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            {r.phone ? <PhoneDisplay phone={r.phone} textClassName="text-sm" /> : <span>ללא טלפון</span>}
            {r.email && (
              <a href={`mailto:${r.email}`} dir="ltr" className="text-primary hover:underline break-all">
                {r.email}
              </a>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
};

const PublicBranchContacts = () => {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-branch-contacts", slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_branch_contacts" as never, {
        _slug: slug,
      } as never);
      if (error) throw error;
      return data as unknown as BranchContacts | null;
    },
  });

  const pageTitle = data?.branch_name ? `דף קשר — ${data.branch_name}` : "דף קשר שלוחה";

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <PageTitle title={pageTitle} />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <header className="flex flex-col items-center gap-2 text-center">
          <AppLogo size="lg" />
          <p className="text-sm text-muted-foreground">אולפן ומגמת המוסיקה חוף הכרמל</p>
          <h1 className="text-xl font-semibold">{pageTitle}</h1>
        </header>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error || !data ? (
          <p className="text-center text-muted-foreground py-12">העמוד לא נמצא</p>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Music2 className="h-4 w-4 text-primary" />
                  בית ספר מנגן
                  <span className="text-muted-foreground font-normal">({data.school_music.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <StaffList rows={data.school_music} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-primary" />
                  למידה פרטנית
                  <span className="text-muted-foreground font-normal">({data.private.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <StaffList rows={data.private} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default PublicBranchContacts;
