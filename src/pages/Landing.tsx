import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import logoUrl from "@/assets/logo.png";
import {
  Baby,
  School,
  Music2,
  Users,
  LogIn,
  Phone,
  Mail,
  MessageCircle,
  GraduationCap,
} from "lucide-react";

const NAV = [
  { id: "about", label: "אודות" },
  { id: "programs", label: "תוכניות" },
  { id: "policies", label: "תעריפים ונהלים" },
  { id: "contact", label: "צור קשר" },
];

const PROGRAMS = [
  {
    icon: Baby,
    title: "גני ילדים",
    description: "חשיפה מוזיקלית מוקדמת — תוכניות ייעודיות לגיל הרך המעודדות סקרנות, הקשבה ויצירתיות.",
  },
  {
    icon: School,
    title: "בתי ספר מנגנים",
    description: "לימודי כלי נגינה במסגרת בתי הספר היסודיים, בליווי מורים מקצועיים ובשיתוף הצוות החינוכי.",
  },
  {
    icon: Music2,
    title: "לימודים פרטניים",
    description: "מגוון רחב של כלים: כינור, צ'לו, כלי נשיפה, פסנתר, גיטרות, תופים, פיתוח קול ועוד.",
  },
  {
    icon: Users,
    title: "הרכבים ותזמורות",
    description: "פעילות קבוצתית קאמרית ותזמורתית, מוסיקה קלה ולימודי תיאוריה לקראת בגרות.",
  },
];

const Landing = () => {
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
                <span className="block text-primary mt-2">הבית למוסיקה בקהילה</span>
              </h1>
              <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
                מוסד חינוכי מקצועי המציע מגוון רחב של תוכניות לימוד מהגיל הרך ועד הבגרות,
                בליווי צוות מורים מהשורה הראשונה.
              </p>
              <div className="flex flex-wrap gap-3 pt-2">
                <a href="#programs">
                  <Button size="lg" variant="outline" className="h-12 rounded-xl px-6">לתוכניות הלימוד</Button>
                </a>
              </div>
            </div>
            <div className="relative aspect-[4/3] rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-border shadow-xl flex items-center justify-center text-muted-foreground">
              <div className="text-center space-y-2">
                <Music2 className="h-16 w-16 mx-auto text-primary/40" />
                <p className="text-sm">תמונה ראשית</p>
              </div>
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
              <Link to="/register" className="group">
                <div className="rounded-2xl bg-card text-card-foreground p-7 shadow-xl hover:scale-[1.02] transition-transform text-right border border-border">
                  <Music2 className="h-10 w-10 text-primary mb-3" />
                  <h3 className="text-xl font-bold mb-1">רישום ללימודים פרטניים</h3>
                  <p className="text-sm text-muted-foreground">כינור, פסנתר, גיטרה, כלי נשיפה, פיתוח קול ועוד</p>
                </div>
              </Link>
              <Link to="/school-music-register" className="group">
                <div className="rounded-2xl bg-card text-card-foreground p-7 shadow-xl hover:scale-[1.02] transition-transform text-right border border-border">
                  <School className="h-10 w-10 text-primary mb-3" />
                  <h3 className="text-xl font-bold mb-1">רישום לבתי ספר מנגנים</h3>
                  <p className="text-sm text-muted-foreground">לימודי כלי נגינה במסגרת בית הספר היסודי</p>
                </div>
              </Link>
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" className="py-16 md:py-20">
          <div className="mx-auto max-w-4xl px-5 text-center space-y-4">
            <h2 className="text-2xl md:text-3xl font-bold">אודות האולפן</h2>
            <p className="text-muted-foreground leading-relaxed text-base md:text-lg">
              אולפן ומגמת המוסיקה של המועצה האזורית חוף הכרמל פועל לקידום החינוך המוסיקלי
              במרחב הקהילתי. אנו מציעים לימודים פרטניים וקבוצתיים, הרכבים, תזמורות
              ותוכניות חינוכיות בבתי הספר ובגני הילדים, בהובלת צוות מורים מקצועי ומסור.
            </p>
          </div>
        </section>

        {/* Programs */}
        <section id="programs" className="py-16 md:py-20 bg-muted/30 border-y border-border">
          <div className="mx-auto max-w-6xl px-5">
            <div className="text-center space-y-2 mb-10">
              <h2 className="text-2xl md:text-3xl font-bold">תוכניות הלימוד שלנו</h2>
              <p className="text-muted-foreground">מסלולים מותאמים לכל גיל ולכל רמה</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {PROGRAMS.map((p) => (
                <Card key={p.title} className="border-border hover:shadow-md transition-shadow">
                  <CardContent className="p-6 text-right space-y-3">
                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <p.icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-bold text-lg">{p.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{p.description}</p>
                  </CardContent>
                </Card>
              ))}
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
                    <li>שיעור 45 דקות — <span className="font-semibold text-foreground">480 ₪</span></li>
                    <li>שיעור 60 דקות — <span className="font-semibold text-foreground">580 ₪</span></li>
                    <li>שיעור 30 דקות (שנה א', כיתות א'–ד') — <span className="font-semibold text-foreground">350 ₪</span></li>
                    <li>שיעור בקבוצה — <span className="font-semibold text-foreground">280 ₪</span></li>
                  </ul>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="discounts" className="border-0">
                <AccordionTrigger className="px-5 text-base font-semibold text-right">הנחות</AccordionTrigger>
                <AccordionContent className="px-5 text-sm leading-relaxed">
                  <ul className="space-y-1.5 text-muted-foreground">
                    <li>5% — הרשמה מוקדמת</li>
                    <li>5% — שלוחות יישוביות</li>
                    <li>10% — מגמת מוזיקה</li>
                    <li>5% — אח / כלי שני</li>
                  </ul>
                  <p className="mt-3 text-xs text-foreground font-medium">* אין כפל הנחות.</p>
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
          <div className="space-y-2">
            <h3 className="font-bold text-base mb-3">משרד האולפן</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Phone className="h-4 w-4" /> 04-6299711
              <a
                href="https://wa.me/97246299711"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="פתח צ'אט בוואטסאפ"
                className="text-green-600 hover:text-green-700"
              >
                <MessageCircle className="h-4 w-4" />
              </a>
            </div>
            <a href="mailto:music.hof@gmail.com" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <Mail className="h-4 w-4" /> music.hof@gmail.com
            </a>
          </div>
          <div className="space-y-2">
            <h3 className="font-bold text-base mb-3">רישום ובירורים</h3>
            <p className="text-sm text-muted-foreground">קורין</p>
            <a
              href="https://wa.me/972547467498"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
            >
              <MessageCircle className="h-4 w-4" /> 054-7467498 (וואטסאפ 08:30–14:30)
            </a>
          </div>
          <div className="space-y-2">
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
