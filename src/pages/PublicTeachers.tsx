import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, User } from "lucide-react";

type PublicTeacher = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  instruments: string[];
};

const PublicTeachers = () => {
  const { data: teachers, isLoading } = useQuery({
    queryKey: ["public-teachers"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_teachers");
      if (error) throw error;
      return (data ?? []) as PublicTeacher[];
    },
  });

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold truncate">אולפן ומגמת המוסיקה</span>
            <span className="text-[11px] text-muted-foreground truncate">חוף הכרמל</span>
          </Link>
          <Link to="/">
            <Button size="sm" variant="ghost" className="h-10 rounded-xl gap-1.5">
              <ArrowRight className="h-4 w-4" />
              חזרה לדף הבית
            </Button>
          </Link>
        </div>
      </header>

      <main className="py-16 md:py-20">
        <div className="mx-auto max-w-6xl px-5">
          <div className="text-center space-y-2 mb-10">
            <h1 className="text-2xl md:text-3xl font-bold">צוות המורים</h1>
            <p className="text-muted-foreground">המורים והמורות המלמדים באולפן</p>
          </div>

          {isLoading ? (
            <p className="text-center text-sm text-muted-foreground">טוען רשימת מורים...</p>
          ) : teachers && teachers.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {teachers.map((t) => (
                <Card key={t.id} className="border-border">
                  <CardContent className="flex items-center gap-4 p-4 text-right">
                    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary overflow-hidden">
                      <User className="h-8 w-8" />
                      {t.gender === "male" && (
                        <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[10px] text-white leading-none border-2 border-background">
                          ♂
                        </span>
                      )}
                      {t.gender === "female" && (
                        <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-rose-400 text-[10px] text-white leading-none border-2 border-background">
                          ♀
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-foreground truncate">
                        {t.first_name} {t.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {t.instruments.join(", ")}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              רשימת המורים תתעדכן בקרוב.
            </p>
          )}
        </div>
      </main>
    </div>
  );
};

export default PublicTeachers;
