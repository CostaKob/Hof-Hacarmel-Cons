import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import logoUrl from "@/assets/logo.png";
import heroImage from "@/assets/hero-orchestra.jpg";
import {
  
  School,
  Music2,
  Users,
  LogIn,
  Phone,
  Mail,
  MessageCircle,
  GraduationCap,
  Music,
  Guitar,
  Mic2,
  Award,
  Heart,
} from "lucide-react";

const JOURNEY = [
  {
    icon: Music,
    stage: "שלב 1",
    title: "גני חובה — \"ויוה בגנים\"",
    description:
      "תוכנית הדגל של האולפן בגני הילדים. חשיפה מוזיקלית חווייתית המניחה את היסודות לקצב, שמיעה ואהבת המוסיקה.",
  },
  {
    icon: Guitar,
    stage: "שלב 2",
    title: "בתי ספר מנגנים",
    description:
      "לימודי כלי נגינה כחלק מובנה מיום הלימודים בבתי הספר היסודיים. הזדמנות לכל ילד וילדה לגלות את הכלי האישי שלהם.",
  },
  {
    icon: Mic2,
    stage: "שלב 3",
    title: "חטיבת הנעורים — מסלול מצוינות",
    description:
      "התמקצעות מעמיקה בלימוד הפרטני, שירה במקהלה ונגינה בהרכבים מוזיקליים מגוונים.",
  },
  {
    icon: Award,
    stage: "שלב 4",
    title: "תיכון — בגרות במוסיקה",
    description:
      "הכנה מקיפה לבחינות הבגרות במוסיקה (רסיטל ותיאוריה), תוך הגעה לרמה מקצועית גבוהה וגיבוש זהות מוזיקלית.",
  },
];

const NAV = [
  { id: "about", label: "אודות" },
  { id: "journey", label: "המסע המוזיקלי" },
  
  { id: "policies", label: "תעריפים ונהלים" },
  { id: "contact", label: "צור קשר" },
];


type PricingData = {
  lesson_prices: Record<string, number>;
  vat_rate: number;
  music_production_price: number | null;
  recital_track_price: number | null;
  discounts: Array<{ label: string; percentage: number }>;
};

const formatPrice = (value: number) => new Intl.NumberFormat("he-IL").format(Math.round(value));

const Landing = () => {
  const { data: pricing } = useQuery({
    queryKey: ["public-pricing"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_pricing");
      if (error) throw error;
      return data as unknown as PricingData;
    },
  });

  const lp = pricing?.lesson_prices ?? {};
  const price45 = Number(lp["45"]) || 0;
  const price60 = Number(lp["60"]) || 0;
  const price30 = Number(lp["30"]) || 0;

  return (
    <div dir="rtl" className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3">
          <a href="#top" className="flex items-center gap-2 min-w-0">
            <img src={logoUrl} alt="לוגו אולפן ומגמת המוסיקה חוף הכרמל" className="h-12 w-12 object-contain shrink-0" />
            <div className="leading-tight min-w-0">
              <p className="text-sm font-bold truncate">אולפן ומגמת המוסיקה</p>
              <p className="text-[11px] text-muted-foreground truncate">חוף הכרמל</p>
            </div>
          </a>

          <nav className="hidden md:flex items-center gap-1">
            {NAV.map((n) => (
              <a
                key={n.id}
                href={`#${n.id}`}
                className="px-3 py-2 text-sm text-muted-foreground rounded-lg hover:text-foreground hover:bg-accent transition-colors"
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Link to="/login">
              <Button size="sm" className="h-10 rounded-xl gap-1.5">
                <LogIn className="h-4 w-4" />
                כניסת מורים וצוות
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-bl from-primary/10 via-background to-background border-b border-border">
          <div className="mx-auto max-w-6xl px-5 py-14 md:py-20 grid gap-8 md:grid-cols-2 items-center">
            <div className="space-y-5 text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium px-3 py-1">
                <GraduationCap className="h-3.5 w-3.5" />
                קונסרבטוריון מוכר על ידי משרד החינוך
              </span>
              <h1 className="text-3xl md:text-5xl font-bold leading-tight tracking-tight">
                אולפן ומגמת המוסיקה חוף הכרמל
              </h1>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                מוסד חינוכי מקצועי המציע מגוון רחב של תוכניות לימוד מהגיל הרך ועד הבגרות,
                בליווי צוות מורים מהשורה הראשונה.
              </p>
            </div>
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-border shadow-xl">
              <img
                src={heroImage}
                alt="תזמורת המגמה בקונצרט"
                className="absolute inset-0 h-full w-full object-cover"
                loading="eager"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/30 via-transparent to-transparent" />
            </div>
          </div>
        </section>

        {/* Registration Hub */}
        <section id="registration" className="py-16 md:py-24 bg-primary text-primary-foreground">
          <div className="mx-auto max-w-4xl px-5 text-center space-y-8">
            <div className="space-y-2">
              <h2 className="text-2xl md:text-4xl font-bold">להרשמה לשנת הלימודים תשפ״ז</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Link to="/register?year=2026-2027" className="group">
                <div className="rounded-2xl bg-card text-card-foreground p-7 shadow-xl hover:scale-[1.02] transition-transform text-right border border-border">
                  <Music2 className="h-10 w-10 text-primary mb-3" />
                  <h3 className="text-xl font-bold mb-1">רישום ללימודים פרטניים</h3>
                  <p className="text-sm text-muted-foreground">כינור, פסנתר, גיטרה, כלי נשיפה, פיתוח קול ועוד</p>
                </div>
              </Link>
              <Link to="/school-music-register?year=2026-2027" className="group">
                <div className="rounded-2xl bg-card text-card-foreground p-7 shadow-xl hover:scale-[1.02] transition-transform text-right border border-border">
                  <School className="h-10 w-10 text-primary mb-3" />
                  <h3 className="text-xl font-bold mb-1">רישום לבתי ספר מנגנים</h3>
                  <p className="text-sm text-muted-foreground">לימודי נגינה קבוצתיים במסגרת תוכנית בית ספר מנגן</p>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="py-16 md:py-20">
          <div className="mx-auto max-w-4xl px-5 text-right space-y-5">
            <h2 className="text-2xl md:text-3xl font-bold text-center">אודות האולפן</h2>
            <p className="text-muted-foreground leading-relaxed text-base md:text-lg">
              אולפן המוסיקה חוף הכרמל הינו קונסרבטוריון מוכר ע״י משרד החינוך המאפשר לכל תלמיד/ה שמעוניין/ת להירשם ללימודי נגינה במגוון כלים רחב: כינור, צ׳לו, סקסופון, קלרינט, חליל צד, חליליות, חצוצרה, טרומבון, קרן יער, טובה, פסנתר, גיטרה קלאסית, גיטרה חשמלית, גיטרה בס, תופים וכלי הקשה, פיתוח קול, תיאוריה והלחנה.
            </p>
            <p className="text-muted-foreground leading-relaxed text-base md:text-lg">
              רק במקרה של הרשמה נמוכה לכלי כלשהו, או נרשמים רבים מדי, ניאלץ לענות בשלילה או לדחות לזמן מה את בקשת הרישומים.
            </p>
            <p className="text-muted-foreground leading-relaxed text-base md:text-lg">
              לצד השיעורים הפרטניים פועלים במסגרת האולפן הרכבים מוסיקליים (תזמורות, מקהלות, הרכבים קאמריים קלאסיים, הרכבי ג׳אז ומוסיקה קלה) ושיעורי תיאוריה קבוצתיים.
            </p>
          </div>
        </section>

        {/* Musical Journey Timeline */}
        <section id="journey" className="py-16 md:py-24 bg-muted/30 border-y border-border">
          <div className="mx-auto max-w-4xl px-5">
            <div className="text-center space-y-2 mb-12">
              <h2 className="text-2xl md:text-3xl font-bold">המסע המוזיקלי באולפן</h2>
              <p className="text-muted-foreground">מסלול לימודים רציף — מהגן ועד לבגרות</p>
            </div>

            <div className="relative">
              {/* Vertical line (RTL: positioned on the right) */}
              <div className="absolute right-6 md:right-1/2 top-2 bottom-2 w-px bg-border md:translate-x-[0.5px]" aria-hidden />

              <ol className="space-y-10 md:space-y-14">
                {JOURNEY.map((step, i) => {
                  const Icon = step.icon;
                  const isEven = i % 2 === 1;
                  return (
                    <li key={step.title} className="relative">
                      {/* Dot/Icon */}
                      <div className="absolute right-0 md:right-1/2 top-0 md:translate-x-1/2 z-10">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg ring-4 ring-background">
                          <Icon className="h-5 w-5" />
                        </div>
                      </div>

                      {/* Card */}
                      <div
                        className={`pr-16 md:pr-0 ${
                          isEven
                            ? "md:pr-[calc(50%+3rem)] md:pl-0 md:text-right"
                            : "md:pl-[calc(50%+3rem)] md:pr-0 md:text-left"
                        }`}
                      >
                        <div className="rounded-2xl border border-border bg-card p-5 md:p-6 shadow-sm hover:shadow-md transition-shadow text-right">
                          <span className="inline-block text-xs font-semibold text-primary mb-1.5">
                            {step.stage}
                          </span>
                          <h3 className="text-lg md:text-xl font-bold mb-2">{step.title}</h3>
                          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </section>

        {/* Ensemble & Experience — The Envelope */}
        <section id="ensemble" className="py-16 md:py-20">
          <div className="mx-auto max-w-5xl px-5">
            <div className="text-center space-y-2 mb-10">
              <h2 className="text-2xl md:text-3xl font-bold">המעטפת — הרכבים, במה וקהילה</h2>
              <p className="text-muted-foreground">מעבר לשיעור — חוויה מוזיקלית שלמה</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <Card className="border-border">
                <CardContent className="p-6 md:p-7 text-right space-y-3">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Users className="h-6 w-6" />
                  </div>
                  <h3 className="font-bold text-lg">תזמורות והרכבים</h3>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                    האולפן מפעיל מערך תזמורות — מהתזמורת הצעירה ועד לתזמורת הייצוגית, מקהלות והרכבים קאמריים, ג׳אז ומוסיקה קלה.
                  </p>
                </CardContent>
              </Card>
              <Card className="border-border">
                <CardContent className="p-6 md:p-7 text-right space-y-3">
                  <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Heart className="h-6 w-6" />
                  </div>
                  <h3 className="font-bold text-lg">במה, קהילה וערכים</h3>
                  <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
                    תלמידי האולפן נהנים מניסיון במה עשיר, הופעות בקונצרטים, השתתפות בטקסים רשמיים ותרומה פעילה לקהילה בחוף הכרמל.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>



        {/* Tuition & Regulations */}
        <section id="policies" className="py-16 md:py-20">
          <div className="mx-auto max-w-3xl px-5">
            <div className="text-center space-y-2 mb-10">
              <h2 className="text-2xl md:text-3xl font-bold">תעריפים ונהלים</h2>
              <p className="text-muted-foreground">המידע המלא לפני ההרשמה</p>
            </div>
            <Accordion type="single" collapsible className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
              <AccordionItem value="tuition" className="border-0">
                <AccordionTrigger className="px-5 text-base font-semibold text-right">תעריפי לימודים</AccordionTrigger>
                <AccordionContent className="px-5 text-sm leading-relaxed">
                  <ul className="space-y-1.5 text-muted-foreground">
                    {price45 > 0 && (
                      <li>שיעור פרטני 45 דקות — <span className="font-semibold text-foreground">{formatPrice(price45)} ₪ לשנה</span></li>
                    )}
                    {price60 > 0 && (
                      <li>שיעור פרטני 60 דקות — <span className="font-semibold text-foreground">{formatPrice(price60)} ₪ לשנה</span></li>
                    )}
                    {price30 > 0 && (
                      <li>שיעור פרטני 30 דקות (שנה א', כיתות א'–ד') — <span className="font-semibold text-foreground">{formatPrice(price30)} ₪ לשנה</span></li>
                    )}
                    {pricing?.music_production_price ? (
                      <li>הפקה מוסיקלית — <span className="font-semibold text-foreground">{formatPrice(pricing.music_production_price)} ₪ לשנה</span></li>
                    ) : null}
                    {pricing?.recital_track_price ? (
                      <li>מסלול רסיטל — <span className="font-semibold text-foreground">{formatPrice(pricing.recital_track_price)} ₪ לשנה</span></li>
                    ) : null}
                  </ul>
                  {pricing && Number(pricing.vat_rate) > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">המחירים כוללים מע״מ {Number(pricing.vat_rate)}%.</p>
                  )}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="discounts" className="border-0">
                <AccordionTrigger className="px-5 text-base font-semibold text-right">הנחות</AccordionTrigger>
                <AccordionContent className="px-5 text-sm leading-relaxed">
                  {pricing?.discounts && pricing.discounts.length > 0 ? (
                    <>
                      <ul className="space-y-1.5 text-muted-foreground">
                        {pricing.discounts.map((d, i) => (
                          <li key={i}>
                            <span className="font-semibold text-foreground">{Number(d.percentage)}%</span> — {d.label}
                          </li>
                        ))}
                      </ul>
                      <p className="mt-3 text-xs text-foreground font-medium">* אין כפל הנחות.</p>
                    </>
                  ) : (
                    <p className="text-muted-foreground">פרטי ההנחות יפורסמו בקרוב.</p>
                  )}
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="rules" className="border-0">
                <AccordionTrigger className="px-5 text-base font-semibold text-right">נהלי נוכחות וביטול</AccordionTrigger>
                <AccordionContent className="px-5 text-sm leading-relaxed text-muted-foreground space-y-2">
                  <p>שנת הפעילות: ספטמבר–יוני (שיעורי השלמה ביולי).</p>
                  <p>מינימום של 32 שיעורים בשנה.</p>
                  <p>חובה להודיע על היעדרות 24 שעות מראש.</p>
                  <p>ביטול הרשמה יתאפשר אך ורק עד ה-1 במרץ ובכתב בלבד.</p>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer id="contact" className="bg-muted/40 border-t border-border">
        <div className="mx-auto max-w-6xl px-5 py-12 grid gap-8 md:grid-cols-3 text-right">
          <div className="space-y-2.5">
            <h3 className="font-bold text-base mb-3">משרד האולפן</h3>
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4 shrink-0" />
              <span>04-6299711</span>
            </p>
            <a
              href="mailto:music.hof@gmail.com"
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <Mail className="h-4 w-4 shrink-0" />
              <span>music.hof@gmail.com</span>
            </a>
          </div>
          <div className="space-y-2.5">
            <h3 className="font-bold text-base mb-3">רישום ובירורים</h3>
            <p className="text-sm text-muted-foreground">קורין פאר</p>
            <a
              href="https://wa.me/972547467498"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <MessageCircle className="h-4 w-4 shrink-0 text-green-600" />
              <span>054-7467498 (וואטסאפ)</span>
            </a>
            <p className="text-xs text-muted-foreground">בין השעות: 08:30–14:30</p>
          </div>
          <div className="space-y-2.5">
            <h3 className="font-bold text-base mb-3">מנהל האולפן</h3>
            <p className="text-sm text-muted-foreground">עמיר סטולר</p>
          </div>
        </div>
        <div className="border-t border-border py-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} אולפן ומגמת המוסיקה חוף הכרמל. כל הזכויות שמורות.
        </div>
      </footer>
    </div>
  );
};

export default Landing;
