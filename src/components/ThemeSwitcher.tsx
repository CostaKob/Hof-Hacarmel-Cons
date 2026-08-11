import { Palette } from "lucide-react";
import { useTheme, AppTheme } from "@/hooks/useTheme";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ThemeSwitcher = ({ className = "" }: { className?: string }) => {
  const { theme, setTheme } = useTheme();

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <Palette className="h-4 w-4 opacity-70 hidden sm:block" />
      <Select value={theme} onValueChange={(v) => setTheme(v as AppTheme)}>
        <SelectTrigger
          aria-label="ערכת נושא"
          className="h-8 w-28 sm:w-32 rounded-lg bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground text-xs sm:text-sm"
        >
          <SelectValue placeholder="ערכת נושא" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">עיצוב רגיל</SelectItem>
          <SelectItem value="clean">עיצוב נקי</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
};

export default ThemeSwitcher;
