import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS_HE, emptyStatusCounts, calcTotal, getExpectedLessons, getMonthlyRate, getRateColorClass, type StatusCounts } from "@/lib/lessonCounts";
import { BarChart3 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface Props {
  lines: { status: string }[];
  startDate?: string | null;
}

export default function EnrollmentSummary({ lines, startDate }: Props) {
  const counts: StatusCounts = emptyStatusCounts();
  for (const l of lines) {
    if (l.status in counts) counts[l.status as keyof StatusCounts]++;
  }
  const total = calcTotal(counts);
  const expected = getExpectedLessons(startDate);
  const { rate, status } = getMonthlyRate(total, startDate);

  const items: { key: keyof StatusCounts; label: string }[] = [
    { key: "present", label: "נוכח/ת" },
    { key: "double_lesson", label: "שיעור כפול" },
    { key: "justified_absence", label: "היעדרות מוצדקת" },
    { key: "unjustified_absence", label: "היעדרות בלתי מוצדקת" },
    { key: "vacation", label: "חופש" },
  ];

  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
      <h2 className="font-semibold text-foreground flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-primary" />
        סיכום נוכחות
      </h2>
      <div className="grid grid-cols-2 gap-3 text-sm">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between rounded-xl bg-muted/30 px-3 py-2">
            <span className="text-muted-foreground">{item.label}</span>
            <Badge variant="secondary" className="rounded-lg min-w-[2rem] justify-center">
              {counts[item.key]}
            </Badge>
          </div>
        ))}
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-between rounded-xl bg-primary/10 px-4 py-3 font-semibold">
              <span className="text-foreground">סה״כ יחידות</span>
              <span className="flex items-center gap-2">
                <span className="text-primary text-lg">{total} / {expected}</span>
                {status !== "unknown" && (
                  <span className={`text-sm font-medium ${getRateColorClass(status)}`}>
                    ({rate.toFixed(1)}/חודש)
                  </span>
                )}
                {status === "unknown" && (
                  <span className="text-sm text-muted-foreground">—</span>
                )}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>יעד: 3.2 שיעורים/חודש</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
