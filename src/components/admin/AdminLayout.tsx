import { ReactNode, useState, useRef, ComponentType } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, Home, Users, GraduationCap, Music2, Music4, ClipboardList, LogOut, Upload, Loader2, CalendarDays, Wallet, BarChart3, LucideIcon, ScrollText } from "lucide-react";
import { OPERATIONS_LOG_ALLOWED_EMAILS, OPERATIONS_LOG_ALLOWED_USER_IDS } from "@/lib/operationsLog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppLogo } from "@/hooks/useAppLogo";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ArchiveYearBanner from "./ArchiveYearBanner";
import FamilyIcon from "@/components/icons/FamilyIcon";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import NotificationsBell from "./NotificationsBell";
import { useListStatePreservation } from "@/hooks/useListStatePreservation";

type IconComponent = ComponentType<{ className?: string }>;

interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon | IconComponent;
}

const NAV_ITEMS: NavItem[] = [
  { path: "/admin", label: "ראשי", icon: Home },
  { path: "/admin/students", label: "תלמידים", icon: Users },
  { path: "/admin/families", label: "משפחות", icon: FamilyIcon },
  { path: "/admin/teachers", label: "מורים", icon: GraduationCap },
  { path: "/admin/ensembles", label: "הרכבים", icon: Music2 },
  { path: "/admin/school-music-schools", label: "בית ספר מנגן", icon: Music4 },
  { path: "/admin/registrations", label: "הרשמות", icon: ClipboardList },
  { path: "/admin/yearly-summary", label: "נוכחות תלמידים", icon: BarChart3 },
  { path: "/admin/private-payments", label: "תשלומים", icon: Wallet },
];

const MOBILE_NAV_ITEMS = NAV_ITEMS.filter(
  (item) => item.path !== "/admin/families" && item.path !== "/admin/yearly-summary"
);

const OPERATIONS_LOG_ITEM: NavItem = { path: "/admin/operations-log", label: "יומן חריגות", icon: ScrollText };

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
  backPath?: string;
  onBack?: () => void;
  fullWidth?: boolean;
}

const AdminLayout = ({ children, title, backPath, onBack, fullWidth }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  useListStatePreservation(location.pathname);
  const { signOut, user, hasRole } = useAuth();
  const showOperationsLog = !!user && hasRole("owner");
  const navItems = showOperationsLog ? [...NAV_ITEMS, OPERATIONS_LOG_ITEM] : NAV_ITEMS;
  const mobileNavItems = showOperationsLog ? [...MOBILE_NAV_ITEMS, OPERATIONS_LOG_ITEM] : MOBILE_NAV_ITEMS;
  const { logoUrl, refreshLogo } = useAppLogo();
  const { years, selectedYearId, setSelectedYearId, isLoading: yearsLoading } = useAcademicYear();
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

  const isActive = (path: string) =>
    path === "/admin"
      ? location.pathname === "/admin"
      : location.pathname.startsWith(path);

  const NavButton = ({ item }: { item: NavItem }) => (
    <Button
      key={item.path}
      variant="ghost"
      size="sm"
      className={`flex h-auto flex-col items-center justify-center gap-0.5 rounded-xl py-2 text-primary-foreground hover:bg-primary-foreground/10 ${
        isActive(item.path) ? "bg-primary-foreground/15" : ""
      }`}
      onClick={() => navigate(item.path)}
    >
      <item.icon className="h-5 w-5" />
      <span className="text-[10px] leading-none md:text-xs">{item.label}</span>
    </Button>
  );

  return (
    <div
      dir="rtl"
      className="flex h-[100svh] min-h-0 flex-col overflow-hidden bg-background"
    >
      <header className="shrink-0 bg-primary px-4 pb-4 pt-4 text-primary-foreground shadow-md">
        <div className="mx-auto max-w-5xl">
          {/* Utility row: logo/title and year/theme/logout */}
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              {backPath && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-primary-foreground hover:bg-primary-foreground/10"
                  onClick={() => (onBack ? onBack() : navigate(-1))}
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
              <h1 className="text-base font-bold sm:text-lg">{title}</h1>
            </div>

            <div className="flex items-center justify-between gap-1.5 sm:gap-2 md:justify-end">
              <NotificationsBell className="text-primary-foreground shrink-0" />
              <ThemeSwitcher className="text-primary-foreground shrink-0" />
              {!yearsLoading && years.length > 0 && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <CalendarDays className="h-4 w-4 text-primary-foreground/70 hidden sm:block" />
                  <Select value={selectedYearId ?? ""} onValueChange={setSelectedYearId}>
                    <SelectTrigger className="h-8 w-24 rounded-lg bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground text-xs sm:w-36 sm:text-sm">
                      <SelectValue placeholder="שנה" />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y.id} value={y.id}>
                          {y.name} {y.is_active ? "✦" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
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

          {/* Desktop / tablet navigation — one row */}
          <nav className="mt-3 hidden md:block">
            <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>
              {navItems.map((item) => (
                <NavButton key={item.path} item={item} />
              ))}
            </div>
          </nav>
        </div>
      </header>

      <main
        data-scroll-container
        className={`mx-auto min-h-0 w-full flex-1 overflow-y-auto overscroll-contain px-4 py-5 -mt-2 pb-28 md:pb-6 ${
          fullWidth ? "max-w-none" : "max-w-5xl"
        }`}
      >
        <ArchiveYearBanner />
        {children}
      </main>

      {/* Mobile / tablet bottom navigation */}
      <nav className="fixed bottom-3 left-3 right-3 z-10 flex overflow-x-auto rounded-full border border-border bg-card/90 px-2 py-1.5 shadow-2xl backdrop-blur-xl md:hidden safe-area-pb">
        {mobileNavItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className={`flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5 text-[11px] font-medium transition-colors ${
              isActive(item.path) ? "bg-primary/10 text-primary" : "text-muted-foreground"
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
