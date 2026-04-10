import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Users, GraduationCap, School, Music, BarChart3, CalendarDays, ClipboardList, FileDown, Music2, Music4, Database, ArrowUpCircle } from "lucide-react";

const MAIN_SECTIONS = [
  { path: "/admin/students", label: "תלמידים", description: "ניהול תלמידים, פרטים אישיים ורישומים", icon: Users },
  { path: "/admin/teachers", label: "מורים", description: "ניהול מורים, פרטים אישיים ושיוכים", icon: GraduationCap },
  { path: "/admin/ensembles", label: "הרכבים", description: "ניהול הרכבים, צוות ומשתתפים", icon: Music2 },
  { path: "/admin/school-music-schools", label: "בתי ספר מנגנים", description: "ניהול בתי ספר מנגנים, קבוצות ורכזים", icon: Music4 },
  { path: "/admin/registrations", label: "הרשמות", description: "צפייה וניהול הרשמות חדשות", icon: ClipboardList },
];

const DATA_SECTIONS = [
  { path: "/admin/schools", label: "בתי ספר", description: "ניהול בתי ספר וכתובות", icon: School },
  { path: "/admin/instruments", label: "כלי נגינה", description: "ניהול כלי נגינה", icon: Music },
];

const TOOLS_SECTIONS = [
  { path: "/admin/yearly-summary", label: "סיכום שנתי", description: "סיכום שיעורים שנתי לכלל המערכת", icon: BarChart3 },
  { path: "/admin/year-promotion", label: "מעבר שנה", description: "קידום כיתות ויצירת רישומי חידוש לשנה הבאה", icon: ArrowUpCircle },
  { path: "/admin/academic-years", label: "שנות לימודים", description: "ניהול שנות לימודים ומעבר שנה", icon: CalendarDays },
  { path: "/admin/exports", label: "דוחות וייצוא", description: "ייצוא תלמידים, מורים, דיווחים וסיכומים לאקסל", icon: FileDown },
];

const SectionCard = ({ item, navigate }: { item: typeof MAIN_SECTIONS[0]; navigate: (path: string) => void }) => (
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

  return (
    <AdminLayout title="פאנל ניהול">
      <div className="space-y-8">
        {/* Main */}
        <div className="grid gap-4 sm:grid-cols-2">
          {MAIN_SECTIONS.map((s) => (
            <SectionCard key={s.path} item={s} navigate={navigate} />
          ))}
        </div>

        {/* Data */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">נתונים</h2>
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
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-muted-foreground">כלים ודוחות</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {TOOLS_SECTIONS.map((s) => (
              <SectionCard key={s.path} item={s} navigate={navigate} />
            ))}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
