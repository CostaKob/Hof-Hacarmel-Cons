import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarDays } from "lucide-react";

const AcademicYearSelector = () => {
  const { years, selectedYearId, setSelectedYearId, isLoading } = useAcademicYear();

  if (isLoading || years.length === 0) return null;

  // Show active year first, then others — but hide truly archived ones (only show active + selected)
  const activeYear = years.find((y) => y.is_active);
  const visibleYears = years.filter((y) => y.is_active || y.id === selectedYearId);
  // If user previously selected a non-active year, still show it
  const allVisible = [...new Map(
    [...visibleYears, ...years].map((y) => [y.id, y])
  ).values()];

  return (
    <div className="flex items-center gap-2">
      <CalendarDays className="h-4 w-4 text-primary-foreground/70" />
      <Select value={selectedYearId ?? ""} onValueChange={setSelectedYearId}>
        <SelectTrigger className="w-44 h-9 rounded-lg bg-primary-foreground/10 border-primary-foreground/20 text-primary-foreground text-sm">
          <SelectValue placeholder="שנה" />
        </SelectTrigger>
        <SelectContent>
          {allVisible.map((y) => (
            <SelectItem key={y.id} value={y.id}>
              {y.name} {y.is_active ? "✦" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default AcademicYearSelector;
