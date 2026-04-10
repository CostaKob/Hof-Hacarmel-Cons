import { useAcademicYear } from "@/hooks/useAcademicYear";
import { AlertTriangle } from "lucide-react";

const ArchiveYearBanner = () => {
  const { activeYear, selectedYearId, years } = useAcademicYear();

  if (!activeYear || !selectedYearId || selectedYearId === activeYear.id) return null;

  const selectedYear = years.find((y) => y.id === selectedYearId);
  if (!selectedYear) return null;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 mb-4 flex items-center gap-3 text-sm">
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
      <p className="text-amber-800 dark:text-amber-200">
        אתה צופה בנתוני ארכיון של שנת <strong>{selectedYear.name}</strong>. לשינוי הגדרות הרישום, עבור לשנה הפעילה.
      </p>
    </div>
  );
};

export default ArchiveYearBanner;
