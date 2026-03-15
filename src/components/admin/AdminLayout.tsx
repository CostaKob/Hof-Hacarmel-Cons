import { ReactNode, useState, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Home, Users, GraduationCap, School, Music, LogOut, BarChart3, CalendarDays, Upload, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAppLogo } from "@/hooks/useAppLogo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const NAV_ITEMS = [
  { path: "/admin", label: "ראשי", icon: Home },
  { path: "/admin/students", label: "תלמידים", icon: Users },
  { path: "/admin/teachers", label: "מורים", icon: GraduationCap },
  { path: "/admin/schools", label: "בתי ספר", icon: School },
  { path: "/admin/instruments", label: "כלי נגינה", icon: Music },
  { path: "/admin/yearly-summary", label: "סיכום שנתי", icon: BarChart3 },
  { path: "/admin/academic-years", label: "שנות לימודים", icon: CalendarDays },
  { path: "/admin/registrations", label: "הרשמות", icon: Upload },
];

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  backPath?: string;
  onBack?: () => void;
}

const AdminLayout = ({ children, title, backPath, onBack }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const { logoUrl, refreshLogo } = useAppLogo();
  const [uploading, setUploading] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("יש להעלות קובץ תמונה בלבד");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("גודל הקובץ מוגבל ל-5MB");
      return;
    }
    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from("app-settings")
        .upload("logo.png", file, { upsert: true, cacheControl: "0" });
      if (error) throw error;
      toast.success("הלוגו עודכן בהצלחה");
      refreshLogo();
      setPopoverOpen(false);
    } catch {
      toast.error("שגיאה בהעלאת הלוגו");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-primary px-4 pb-5 pt-4 text-primary-foreground shadow-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-2">
            {backPath && (
              <Button
                variant="ghost"
                size="icon"
                className="text-primary-foreground hover:bg-primary-foreground/10"
                onClick={() => onBack ? onBack() : navigate(-1)}
              >
                <ArrowRight className="h-5 w-5" />
              </Button>
            )}
            <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
              <PopoverTrigger asChild>
                <button className="rounded-lg transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-primary-foreground/30 cursor-pointer">
                  <img
                    src={logoUrl}
                    alt="לוגו"
                    className="h-10 w-auto object-contain"
                  />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-3" align="start">
                <p className="text-sm font-semibold mb-2">החלפת לוגו</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full rounded-xl"
                  disabled={uploading}
                  onClick={() => inputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-2" />
                  ) : (
                    <Upload className="h-4 w-4 ml-2" />
                  )}
                  {uploading ? "מעלה..." : "בחר תמונה"}
                </Button>
                <p className="text-[11px] text-muted-foreground mt-1.5 text-center">PNG, JPG עד 5MB</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUpload}
                />
              </PopoverContent>
            </Popover>
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
