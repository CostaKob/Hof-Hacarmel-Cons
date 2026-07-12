import * as React from "react";
import { cn } from "@/lib/utils";

interface TimeInput24Props {
  value?: string; // "HH:MM" or "HH:MM:SS"
  onChange?: (value: string) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
}

// Always 24-hour format, independent of browser/OS locale.
export const TimeInput24 = React.forwardRef<HTMLDivElement, TimeInput24Props>(
  ({ value, onChange, className, disabled, id }, ref) => {
    const [h = "", m = ""] = (value || "").split(":");

    const emit = (hh: string, mm: string) => {
      if (!hh && !mm) {
        onChange?.("");
        return;
      }
      onChange?.(`${(hh || "00").padStart(2, "0")}:${(mm || "00").padStart(2, "0")}`);
    };

    const baseCls =
      "flex-1 h-10 rounded-md border border-input bg-background px-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50";

    return (
      <div ref={ref} id={id} dir="ltr" className={cn("flex items-center gap-1", className)}>
        <select
          value={h}
          disabled={disabled}
          onChange={(e) => emit(e.target.value, m)}
          className={baseCls}
          aria-label="שעה"
        >
          <option value="">--</option>
          {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        <span className="px-0.5">:</span>
        <select
          value={m}
          disabled={disabled}
          onChange={(e) => emit(h, e.target.value)}
          className={baseCls}
          aria-label="דקות"
        >
          <option value="">--</option>
          {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    );
  },
);
TimeInput24.displayName = "TimeInput24";
