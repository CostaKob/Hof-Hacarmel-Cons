import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Users, GraduationCap, School, Music, BarChart3, CalendarDays } from "lucide-react";
import LogoUpload from "@/components/admin/LogoUpload";
import { useAppLogo } from "@/hooks/useAppLogo";

const SECTIONS = [
  { path: "/admin/students", label: "תלמידים", description: "ניהול תלמידים, פרטים אישיים ורישומים", icon: Users },
  { path: "/admin/teachers", label: "מורים", description: "ניהול מורים, פרטים אישיים ושיוכים", icon: GraduationCap },
  { path: "/admin/schools", label: "בתי ספר", description: "ניהול בתי ספר וכתובות", icon: School },
  { path: "/admin/instruments", label: "כלי נגינה", description: "ניהול כלי נגינה", icon: Music },
  { path: "/admin/yearly-summary", label: "סיכום שנתי", description: "סיכום שיעורים שנתי לכלל המערכת", icon: BarChart3 },
  { path: "/admin/academic-years", label: "שנות לימודים", description: "ניהול שנות לימודים ומעבר שנה", icon: CalendarDays },
];

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { logoUrl, refreshLogo } = useAppLogo();

  return (
    <AdminLayout title="פאנל ניהול">
      <div className="space-y-6">
        {/* Logo management */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold text-foreground mb-3">לוגו המערכת</h2>
          <LogoUpload currentLogoUrl={logoUrl} onUploaded={refreshLogo} />
        </div>

        {/* Sections grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <button
              key={s.path}
              onClick={() => navigate(s.path)}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md active:scale-[0.98] text-right"
            >
              <div className="rounded-xl bg-accent p-3.5">
                <s.icon className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1">
                <p className="font-semibold text-foreground text-base">{s.label}</p>
                <p className="text-sm text-muted-foreground mt-0.5">{s.description}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
