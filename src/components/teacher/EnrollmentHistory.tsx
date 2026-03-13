import { STATUS_LABELS_HE } from "@/lib/lessonCounts";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";

const WEEKDAYS_HE = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

function formatDateHe(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const weekday = WEEKDAYS_HE[d.getDay()];
  return `${day}/${month}/${year} (${weekday})`;
}

const STATUS_COLORS: Record<string, string> = {
  present: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  double_lesson: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  justified_absence: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  unjustified_absence: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  vacation: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
};

interface ReportLine {
  id: string;
  status: string;
  notes: string | null;
  reports: { report_date: string } | null;
}

interface Props {
  lines: ReportLine[];
  isLoading: boolean;
}

export default function EnrollmentHistory({ lines, isLoading }: Props) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
      <h2 className="font-semibold text-foreground flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-primary" />
        היסטוריית שיעורים
      </h2>

      {isLoading ? (
        <p className="text-center text-sm text-muted-foreground py-4">טוען...</p>
      ) : lines.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground py-4">אין שיעורים מדווחים</p>
      ) : (
        <div className="space-y-2">
          {lines.map((line) => {
            const dateStr = (line.reports as any)?.report_date;
            return (
              <div key={line.id} className="flex items-start gap-3 rounded-xl border border-border p-3">
                <div className="flex-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      {dateStr ? formatDateHe(dateStr) : "—"}
                    </span>
                    <Badge className={`rounded-lg text-xs border-0 ${STATUS_COLORS[line.status] ?? ""}`}>
                      {STATUS_LABELS_HE[line.status] ?? line.status}
                    </Badge>
                  </div>
                  {line.notes && (
                    <p className="text-xs text-muted-foreground">{line.notes}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
