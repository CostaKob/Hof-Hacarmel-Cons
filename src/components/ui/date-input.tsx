import * as React from "react";
import { format, parse, isValid } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateInputProps {
  value?: string; // ISO date string yyyy-MM-dd
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  min?: string; // ISO date string yyyy-MM-dd
  max?: string; // ISO date string yyyy-MM-dd
}

function parseIsoDate(value?: string) {
  if (!value) return undefined;
  const d = parse(value, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

const DateInput = React.forwardRef<HTMLButtonElement, DateInputProps>(
  ({ value, onChange, placeholder = "DD/MM/YYYY", className, disabled, min, max }, ref) => {
    const [open, setOpen] = React.useState(false);

    const dateValue = React.useMemo(() => parseIsoDate(value), [value]);
    const minDate = React.useMemo(() => parseIsoDate(min), [min]);
    const maxDate = React.useMemo(() => parseIsoDate(max), [max]);

    const handleSelect = (date: Date | undefined) => {
      if (date) {
        onChange(format(date, "yyyy-MM-dd"));
      } else {
        onChange("");
      }
      setOpen(false);
    };

    const disabledDays = React.useMemo(() => {
      if (!minDate && !maxDate) return undefined;
      return { before: minDate, after: maxDate };
    }, [minDate, maxDate]);

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            variant="outline"
            disabled={disabled}
            className={cn(
              "w-full h-12 rounded-xl justify-between font-normal text-right",
              !dateValue && "text-muted-foreground",
              className,
            )}
          >
            <span>{dateValue ? format(dateValue, "dd/MM/yyyy") : placeholder}</span>
            <CalendarIcon className="h-4 w-4 opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={dateValue}
            onSelect={handleSelect}
            defaultMonth={dateValue}
            captionLayout="dropdown-buttons"
            fromYear={1950}
            toYear={new Date().getFullYear() + 5}
            disabled={disabledDays}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
    );
  }
);
DateInput.displayName = "DateInput";

export { DateInput };
