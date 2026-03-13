import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Home, Users, GraduationCap, School, Music, LogOut } from "lucide-react";
import AppLogo from "@/components/AppLogo";

const NAV_ITEMS = [
  { path: "/admin", label: "ראשי", icon: Home },
  { path: "/admin/students", label: "תלמידים", icon: Users },
  { path: "/admin/teachers", label: "מורים", icon: GraduationCap },
  { path: "/admin/schools", label: "בתי ספר", icon: School },
  { path: "/admin/instruments", label: "כלי נגינה", icon: Music },
];

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  backPath?: string;
}

const AdminLayout = ({ children, title, backPath }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      {/* Blue gradient header */}
      <header className="bg-primary px-4 pb-5 pt-4 text-primary-foreground shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            {backPath && (
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => navigate(backPath)}
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-lg font-bold">{title}</h1>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.path}
                variant="ghost"
                size="sm"
                className={`text-primary-foreground hover:bg-primary-foreground/10 ${
                  (location.pathname === item.path || (item.path !== "/admin" && location.pathname.startsWith(item.path)))
                    ? "bg-primary-foreground/15"
                    : ""
                }`}
                onClick={() => navigate(item.path)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            ))}
            <Button
              variant="ghost"
              size="sm"
              className="text-primary-foreground hover:bg-primary-foreground/10"
              onClick={signOut}
            >
              <LogOut className="h-4 w-4" />
              התנתק
            </Button>
          </nav>
          <div className="flex items-center gap-1 md:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/10"
              onClick={signOut}
            >
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5 -mt-2 pb-24 md:pb-6">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 flex border-t border-border bg-card shadow-lg md:hidden safe-area-pb">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.path === "/admin"
              ? location.pathname === "/admin"
              : location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default AdminLayout;
