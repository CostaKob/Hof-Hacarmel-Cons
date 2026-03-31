import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getMonthlyRate, getRateColorClass, type EnrollmentSummaryRow } from "@/lib/lessonCounts";

interface Props {
  rows: EnrollmentSummaryRow[];
  showTeacher?: boolean;
}

const YearlySummaryTable = ({ rows, showTeacher = false }: Props) => {
  if (rows.length === 0) {
    return <p className="text-center text-muted-foreground py-12">לא נמצאו נתונים</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead className="text-right">תלמיד/ה</TableHead>
            {showTeacher && <TableHead className="text-right">מורה</TableHead>}
            <TableHead className="text-right">כלי</TableHead>
            <TableHead className="text-right">בי״ס</TableHead>
            <TableHead className="text-center">דק׳</TableHead>
            <TableHead className="text-center">סטטוס</TableHead>
            <TableHead className="text-center">נוכחות</TableHead>
            <TableHead className="text-center">כפול</TableHead>
            <TableHead className="text-center">מוצדק</TableHead>
            <TableHead className="text-center">לא מוצדק</TableHead>
            <TableHead className="text-center">חופש</TableHead>
            <TableHead className="text-center font-bold">סה״כ / צפי</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.enrollmentId}>
              <TableCell className="font-medium whitespace-nowrap">{r.studentName}</TableCell>
              {showTeacher && <TableCell className="whitespace-nowrap">{r.teacherName}</TableCell>}
              <TableCell className="whitespace-nowrap">{r.instrumentName}</TableCell>
              <TableCell className="whitespace-nowrap">{r.schoolName}</TableCell>
              <TableCell className="text-center">{r.lessonDuration}</TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className={`text-[11px] ${r.isActive ? "text-primary border-primary bg-primary/10" : "text-destructive border-destructive bg-destructive/10"}`}>
                  {r.isActive ? "פעיל" : "לא פעיל"}
                </Badge>
              </TableCell>
              <TableCell className="text-center">{r.counts.present}</TableCell>
              <TableCell className="text-center">{r.counts.double_lesson}</TableCell>
              <TableCell className="text-center">{r.counts.justified_absence}</TableCell>
              <TableCell className="text-center">{r.counts.unjustified_absence}</TableCell>
              <TableCell className="text-center">{r.counts.vacation}</TableCell>
              <TableCell className="text-center font-bold text-primary">{r.totalLessons} / {r.expectedLessons}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

/* ── Mobile card layout ── */
export const YearlySummaryCards = ({ rows, showTeacher = false }: Props) => {
  if (rows.length === 0) {
    return <p className="text-center text-muted-foreground py-12">לא נמצאו נתונים</p>;
  }

  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.enrollmentId} className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">{r.studentName}</span>
            <Badge variant="outline" className={`text-[11px] ${r.isActive ? "text-primary border-primary bg-primary/10" : "text-destructive border-destructive bg-destructive/10"}`}>
              {r.isActive ? "פעיל" : "לא פעיל"}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
            {showTeacher && <span>מורה: {r.teacherName}</span>}
            <span>{r.instrumentName}</span>
            <span>{r.schoolName}</span>
            <span>{r.lessonDuration} דק׳</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
            <CountBox label="נוכחות" value={r.counts.present} />
            <CountBox label="כפול" value={r.counts.double_lesson} />
            <CountBox label="מוצדק" value={r.counts.justified_absence} />
            <CountBox label="לא מוצדק" value={r.counts.unjustified_absence} />
            <CountBox label="חופש" value={r.counts.vacation} />
            <div className="rounded-lg bg-primary/10 p-2">
              <div className="text-lg font-bold text-primary">{r.totalLessons} / {r.expectedLessons}</div>
              <div className="text-muted-foreground">סה״כ / צפי</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

function CountBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 p-2">
      <div className="text-base font-semibold text-foreground">{value}</div>
      <div className="text-muted-foreground">{label}</div>
    </div>
  );
}

export default YearlySummaryTable;
