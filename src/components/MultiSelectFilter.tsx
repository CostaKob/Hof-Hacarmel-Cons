import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown, X } from "lucide-react";

interface MultiSelectFilterProps {
  /** Available option values */
  options: string[];
  /** Currently selected values — empty array means "all" */
  value: string[];
  onChange: (val: string[]) => void;
  /** Label shown when nothing is selected, e.g. "כל הכלים" */
  allLabel: string;
  /** Optional per-option display formatter */
  renderLabel?: (opt: string) => string;
  className?: string;
}

/**
 * Multi-select dropdown filter (RTL) — checkbox list inside a popover.
 * An empty selection is treated as "no filter".
 */
export function MultiSelectFilter({
  options,
  value,
  onChange,
  allLabel,
  renderLabel,
  className,
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = (opt: string) => {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  };

  const label =
    value.length === 0
      ? allLabel
      : value.length === 1
        ? (renderLabel ? renderLabel(value[0]) : value[0])
        : `${allLabel} · ${value.length} נבחרו`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={`h-11 rounded-xl justify-between gap-2 font-normal ${className ?? ""}`}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" align="start" className="w-64 p-2 max-h-72 overflow-y-auto overscroll-contain">
        <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b">
          <span className="text-xs text-muted-foreground">{allLabel}</span>
          {value.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs text-primary flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              נקה
            </button>
          )}
        </div>
        <div className="flex flex-col">
          {options.length === 0 && (
            <p className="text-xs text-muted-foreground px-2 py-3">אין אפשרויות</p>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-muted cursor-pointer text-sm"
            >
              <Checkbox checked={value.includes(opt)} onCheckedChange={() => toggle(opt)} />
              <span className="truncate">{renderLabel ? renderLabel(opt) : opt}</span>
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default MultiSelectFilter;
