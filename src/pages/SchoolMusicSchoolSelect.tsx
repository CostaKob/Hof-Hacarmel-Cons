import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { School, ArrowLeft, Loader2 } from "lucide-react";
import AppLogo from "@/components/AppLogo";

const SchoolMusicSchoolSelect = () => {
  const [searchParams] = useSearchParams();
  const urlYearParam = searchParams.get("year");
  const urlYearId = searchParams.get("yearId");

  const { data: resolvedYear, isLoading: yearLoading } = useQuery({
    queryKey: ["sm-select-year", urlYearParam, urlYearId],
    queryFn: async () => {
      if (urlYearParam) {
        const { data } = await supabase
          .from("academic_years")
          .select("id, name")
          .eq("name", urlYearParam)
          .maybeSingle();
        if (data) return data;
      }
      if (urlYearId) {
        const { data } = await supabase
          .from("academic_years")
          .select("id, name")
          .eq("id", urlYearId)
          .maybeSingle();
        if (data) return data;
      }
      const { data: openYear } = await supabase
        .from("academic_years")
        .select("id, name")
        .eq("registration_open", true)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (openYear) return openYear;
      const { data } = await supabase
        .from("academic_years")
        .select("id, name")
        .eq("is_active", true)
        .maybeSingle();
      return data;
    },
  });

  const { data: schools = [], isLoading: schoolsLoading } = useQuery({
    queryKey: ["sm-select-schools", resolvedYear?.id],
    enabled: !!resolvedYear?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("list_public_school_music_schools" as any, { _year_id: resolvedYear!.id });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const yearQuery = useMemo(() => {
    if (urlYearParam) return `year=${encodeURIComponent(urlYearParam)}`;
    if (resolvedYear?.id) return `yearId=${resolvedYear.id}`;
    return "";
  }, [urlYearParam, resolvedYear?.id]);

  const buildHref = (s: any) => {
    const params = new URLSearchParams();
    if (urlYearParam) params.set("year", urlYearParam);
    else if (resolvedYear?.id) params.set("yearId", resolvedYear.id);
    if (s.slug) params.set("school", s.slug);
    else params.set("school_id", s.id);
    return `/school-music-register?${params.toString()}`;
  };

  const loading = yearLoading || schoolsLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto max-w-4xl px-5 py-4 flex items-center justify-between">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            חזרה לדף הבית
          </Link>
          <AppLogo />
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-5 py-10 space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">רישום לבתי ספר מנגנים</h1>
          <p className="text-muted-foreground">
            בחרו את בית הספר של ילדכם כדי להמשיך לטופס ההרשמה
            {resolvedYear?.name ? ` · שנה ${resolvedYear.name}` : ""}
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin ml-2" />
            טוען בתי ספר…
          </div>
        ) : schools.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              אין כרגע בתי ספר פתוחים להרשמה.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {schools.map((s: any) => (
              <Link key={s.id} to={buildHref(s)} className="group">
                <Card className="h-full hover:shadow-lg transition-shadow border border-border">
                  <CardContent className="p-6 text-right space-y-2">
                    <School className="h-8 w-8 text-primary mb-1" />
                    <h3 className="text-lg font-bold">{s.school_name}</h3>
                    <Button variant="link" className="p-0 h-auto text-primary">
                      להרשמה ←
                    </Button>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default SchoolMusicSchoolSelect;
