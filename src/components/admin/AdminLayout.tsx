import { ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Home, Users, GraduationCap, School, Music, LogOut } from "lucide-react";

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
      <header className="sticky top-0 z-10 border-b bg-card shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            {backPath && (
              <Button variant="ghost" size="icon" onClick={() => navigate(backPath)}>
                <ArrowRight className="h-5 w-5" />
              </Button>
            )}
            <h1 className="text-lg font-bold text-foreground">{title}</h1>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV_ITEMS.map((item) => (
              <Button
                key={item.path}
                variant={location.pathname === item.path ? "secondary" : "ghost"}
                size="sm"
                onClick={() => navigate(item.path)}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" />
              התנתק
            </Button>
          </nav>
          <div className="flex items-center gap-1 md:hidden">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
              <Home className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 flex border-t bg-card shadow-sm md:hidden">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-1 flex-col items-center gap-1 py-2 text-xs ${
              location.pathname.startsWith(item.path) && item.path !== "/admin"
                ? "text-primary"
                : location.pathname === item.path
                  ? "text-primary"
                  : "text-muted-foreground"
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default AdminLayout;
