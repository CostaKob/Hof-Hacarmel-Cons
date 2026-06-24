import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowRight, User, Music } from "lucide-react";

type PublicTeacher = {
  id: string;
  first_name: string;
  last_name: string;
  gender: string | null;
  bio: string | null;
  photo_url: string | null;
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
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5 text-foreground">
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

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 -z-10 bg-gradient-to-bl from-primary/15 via-primary/5 to-transparent" />
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary mb-5">
            <Music className="h-3.5 w-3.5" />
            הצוות שלנו
          </div>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4">
            המורים והמורות של האולפן
          </h1>
          <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            מורים מקצועיים, מנגנים ויוצרים פעילים, עם ניסיון רב בהוראה אישית והכוונה מוסיקלית מכל הסגנונות.
          </p>
        </div>
      </section>

      <main className="py-12 md:py-16">
        <div className="mx-auto max-w-6xl px-5">
          {isLoading ? (
            <p className="text-center text-sm text-muted-foreground">טוען רשימת מורים...</p>
          ) : teachers && teachers.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {teachers.map((t) => (
                <article
                  key={t.id}
                  className="group relative flex flex-col rounded-3xl border border-border bg-card overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
                >
                  {/* Photo */}
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-gradient-to-br from-primary/15 via-primary/5 to-muted">
                    {t.photo_url ? (
                      <img
                        src={t.photo_url}
                        alt={`${t.first_name} ${t.last_name}`}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <div className="relative flex h-28 w-28 items-center justify-center rounded-full bg-background/60 backdrop-blur-sm">
                          <User className="h-14 w-14 text-primary/60" />
                          {t.gender === "male" && (
                            <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-sky-500 text-sm text-white border-2 border-background">♂</span>
                          )}
                          {t.gender === "female" && (
                            <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-rose-400 text-sm text-white border-2 border-background">♀</span>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Gradient overlay with name */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-5 text-right">
                      <h2 className="text-xl font-bold text-white drop-shadow-md">
                        {t.first_name} {t.last_name}
                      </h2>
                      {t.instruments.length > 0 && (
                        <p className="text-sm text-white/90 mt-1 drop-shadow">
                          {t.instruments.join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="flex flex-1 flex-col p-5 text-right">
                    {t.instruments.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {t.instruments.map((inst) => (
                          <span
                            key={inst}
                            className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium"
                          >
                            <Music className="h-3 w-3" />
                            {inst}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-line">
                      {t.bio?.trim() || "פרטים נוספים יתעדכנו בקרוב."}
                    </p>
                  </div>
                </article>
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
