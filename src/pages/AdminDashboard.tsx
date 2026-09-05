import { ComponentType } from "react";
import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Users, UsersRound, GraduationCap, School, Music, BarChart3, CalendarDays, ClipboardList, FileDown, Music2, Music4, Database, ExternalLink, MapPin, Guitar, Wallet, Mail, TrendingUp, Radio, FileMusic, Car, ScrollText } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface DashboardItem {
  path: string;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const PRIVATE_LESSONS_SECTIONS: DashboardItem[] = [
  { path: "/admin/students", label: "תלמידים", description: "ניהול תלמידים, פרטים אישיים ורישומים", icon: Users },
  { path: "/admin/families", label: "משפחות", description: "כרטיס הורה מרכזי — שיוכים ותשלומים לפי משפחה", icon: UsersRound },
  { path: "/admin/siblings", label: "אחים ואחיות", description: "חיבור אוטומטי של אחים וטיפול בהתאמות שממתינות לאישור", icon: Users },
  { path: "/admin/teachers", label: "מורים", description: "ניהול מורים, פרטים אישיים ושיוכים", icon: GraduationCap },
  { path: "/admin/registrations", label: "הרשמות", description: "צפייה וניהול הרשמות חדשות", icon: ClipboardList },
  { path: "/admin/private-payments", label: "תשלומים — שיעורים פרטניים", description: "ריכוז חיובים, פוטנציאל הכנסות ויתרות לגבייה", icon: Wallet },
  { path: "/admin/yearly-summary", label: "נוכחות תלמידים - סיכום שנתי", description: "סיכום שנתי של נוכחות ושיעורים פרטניים", icon: BarChart3 },
];

const ENSEMBLES_AND_TRACKS_SECTIONS: DashboardItem[] = [
  { path: "/admin/ensembles", label: "הרכבי ביצוע", description: "ניהול הרכבים, צוות ומשתתפים", icon: Music2 },
  { path: "/admin/special-tracks/music-major", label: "מגמת המוסיקה", description: "תלמידים במגמת המוסיקה", icon: GraduationCap },
  { path: "/admin/special-tracks/junior-track", label: "מסלול חטיבה", description: "תלמידים במסלול חטיבה", icon: School },
  { path: "/admin/special-tracks/music-production", label: "הפקה מוסיקלית", description: "תלמידים בקורס הפקה מוסיקלית", icon: Radio },
  { path: "/admin/special-tracks/recital", label: "מסלול רסיטל", description: "תלמידים במסלול רסיטל", icon: FileMusic },
];

const SCHOOL_MUSIC_SECTIONS: DashboardItem[] = [
  { path: "/admin/school-music-schools", label: "בתי ספר מנגנים", description: "ניהול בתי ספר מנגנים, קבוצות ורכזים", icon: Music4 },
  { path: "/admin/school-music-attendance", label: "נוכחות מורים", description: "דוח נוכחות מרוכז עם איתור דיווחים חסרים", icon: ClipboardList },
  { path: "/admin/school-music-payments", label: "תשלומים", description: "מעקב, סימון ידני וזיכוי תשלומים", icon: Wallet },
];

const DATA_SECTIONS: DashboardItem[] = [
  { path: "/admin/schools", label: "שלוחות", description: "ניהול שלוחות לימוד וכתובות", icon: School },
  { path: "/admin/educational-schools", label: "בתי ספר", description: "ניהול בתי ספר ללימודי בוקר", icon: School },
  { path: "/admin/instruments", label: "כלי נגינה", description: "ניהול כלי נגינה", icon: Music },
  { path: "/admin/inventory-instruments", label: "מאגר כלי נגינה", description: "ניהול מלאי הכלים, מספרים סידוריים והשאלות", icon: Guitar },
  { path: "/admin/cities", label: "ישובי מגורים", description: "ניהול רשימת הישובים בטפסי ההרשמה", icon: MapPin },
];

const TOOLS_SECTIONS: DashboardItem[] = [
  { path: "/admin/enrollment-stats", label: "דוח תלמידים ושיבוצים", description: "תלמידים לפי שכבה, התפלגות כלים ונרשמים שטרם שובצו", icon: BarChart3 },
  { path: "/admin/academic-years", label: "שנות לימודים", description: "ניהול שנות לימודים, הגדרת שנה פעילה ומעבר שנה", icon: CalendarDays },
  { path: "/admin/year-calendar", label: "לוח שנה שנתי", description: "לוח גאנט שנתי — זמינות, חגים ואירועי סניפים", icon: CalendarDays },
  { path: "/admin/activity-calendar", label: "לוח פעילות מורים", description: "מי לימד, מתי ואת מי — לפי דיווחי המורים", icon: CalendarDays },
  { path: "/admin/branch-schedule", label: "לוח שבועי לשלוחה", description: "שיבוץ תלמידים בגרירה לפי ימים ושעות, וייצוא תמונה", icon: CalendarDays },
  { path: "/admin/payment-settings", label: "הגדרות תשלום", description: "מחירון שיעורים, מע\"מ ואחוזי הנחה", icon: Wallet },
  { path: "/admin/cashflow", label: "דוח תזרים", description: "תזרים אמיתי מאייקאונט לפי תאריכי פרעון — שיקים, אשראי בתשלומים וזיכויים", icon: TrendingUp },
  { path: "/admin/travel-report", label: "דוח נסיעות מורים", description: "סיכום קילומטרים והחזרי נסיעות לפי חודש", icon: Car },
  { path: "/admin/exports", label: "דוחות וייצוא", description: "ייצוא תלמידים, מורים, דיווחים וסיכומים לאקסל", icon: FileDown },
  { path: "/admin/messaging", label: "שליחת הודעות להורים", description: "רשימת תפוצה, נוסח הודעת השיוך ולוח בקרת מיילים", icon: Mail },
];

const FORM_LINKS = [
  { href: "/register", label: "טופס הרשמה — אולפן המוסיקה", description: "טופס הרשמה ציבורי לתלמידים חדשים וממשיכים", icon: ClipboardList },
  { href: "/school-music-register", label: "טופס קבלת כלי — בית ספר מנגן", description: "טופס הרשמה וקבלת כלי לתלמידי בית הספר המנגן", icon: Music4 },
];

const ExternalLinkCard = ({ item }: { item: typeof FORM_LINKS[0] }) => (
  <a
    href={item.href}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-4 rounded-2xl border border-primary/30 bg-primary/5 p-5 shadow-sm transition-all hover:shadow-md active:scale-[0.98] text-right"
  >
    <div className="rounded-xl bg-primary/10 p-3.5">
      <item.icon className="h-6 w-6 text-primary" />
    </div>
    <div className="flex-1">
      <p className="font-semibold text-foreground text-base">{item.label}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>
    </div>
    <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
  </a>
);

const SectionCard = ({ item, navigate }: { item: DashboardItem; navigate: (path: string) => void }) => (
  <button
    onClick={() => navigate(item.path)}
    className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md active:scale-[0.98] text-right"
  >
    <div className="rounded-xl bg-accent p-3.5">
      <item.icon className="h-6 w-6 text-primary" />
    </div>
    <div className="flex-1">
      <p className="font-semibold text-foreground text-base">{item.label}</p>
      <p className="text-sm text-muted-foreground mt-0.5">{item.description}</p>
    </div>
  </button>
);

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, hasRole } = useAuth();
  const toolsSections: DashboardItem[] = !!user && hasRole("owner")
    ? [...TOOLS_SECTIONS, { path: "/admin/operations-log", label: "יומן חריגות", description: "תיעוד פעולות חריגות, ביטולים ידניים ותיקוני באגים", icon: ScrollText }]
    : TOOLS_SECTIONS;

  return (
    <AdminLayout title="פאנל ניהול">
      <PageTitle title="פאנל ניהול" />
      <div className="space-y-8">

        {/* Private Lessons */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Users className="h-4 w-4 text-destructive admin-section-title" />
            <h2 className="text-sm font-semibold text-destructive admin-section-title">לימודים פרטניים</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {PRIVATE_LESSONS_SECTIONS.map((s) => (
              <SectionCard key={s.path} item={s} navigate={navigate} />
            ))}
          </div>
        </div>

        {/* Ensembles & Special Tracks */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Music2 className="h-4 w-4 text-destructive admin-section-title" />
            <h2 className="text-sm font-semibold text-destructive admin-section-title">הרכבים ומסלולים מיוחדים</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {ENSEMBLES_AND_TRACKS_SECTIONS.map((s) => (
              <SectionCard key={s.path} item={s} navigate={navigate} />
            ))}
          </div>
        </div>

        {/* School Music */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Music4 className="h-4 w-4 text-destructive admin-section-title" />
            <h2 className="text-sm font-semibold text-destructive admin-section-title">בית ספר מנגן</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {SCHOOL_MUSIC_SECTIONS.map((s) => (
              <SectionCard key={s.path} item={s} navigate={navigate} />
            ))}
          </div>
        </div>

        {/* Data */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-4 w-4 text-destructive admin-section-title" />
            <h2 className="text-sm font-semibold text-destructive admin-section-title">נתונים</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {DATA_SECTIONS.map((s) => (
              <SectionCard key={s.path} item={s} navigate={navigate} />
            ))}
          </div>
        </div>

        {/* Tools */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="h-4 w-4 text-destructive admin-section-title" />
            <h2 className="text-sm font-semibold text-destructive admin-section-title">כלים ודוחות</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {toolsSections.map((s) => (
              <SectionCard key={s.path} item={s} navigate={navigate} />
            ))}
          </div>
        </div>

      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
