import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

const NONE = "--";

/**
 * בחירת שעה באמצעות רשימות נפתחות (ולא input type=time).
 * הבחירה נשמרת מיידית ב-state, כך שגם בנייד אין מצב שהשעה "נעלמת" בשמירה.
 */
export const TimeSelect = ({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) => {
  const [h, m] = value ? value.split(":") : ["", ""];
  const hour = h || "";
  const minute = m || "";

  const emit = (nextHour: string, nextMinute: string) => {
    if (!nextHour) {
      onChange("");
      return;
    }
    onChange(`${nextHour}:${nextMinute || "00"}`);
  };

  return (
    <div className="flex items-center gap-1" dir="ltr" aria-label={ariaLabel}>
      <Select
        value={hour || NONE}
        onValueChange={(v) => emit(v === NONE ? "" : v, minute)}
      >
        <SelectTrigger className="h-12 min-w-0 flex-1 rounded-xl px-2 justify-center">
          <SelectValue placeholder="--" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          <SelectItem value={NONE}>--</SelectItem>
          {HOURS.map((hh) => (
            <SelectItem key={hh} value={hh}>
              {hh}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-muted-foreground">:</span>
      <Select
        value={minute || "00"}
        onValueChange={(v) => emit(hour, v)}
        disabled={!hour}
      >
        <SelectTrigger className="h-12 min-w-0 flex-1 rounded-xl px-2 justify-center">
          <SelectValue placeholder="00" />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          {MINUTES.map((mm) => (
            <SelectItem key={mm} value={mm}>
              {mm}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default TimeSelect;
