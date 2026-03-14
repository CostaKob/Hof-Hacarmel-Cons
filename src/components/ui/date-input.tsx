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
}

const DateInput = React.forwardRef<HTMLButtonElement, DateInputProps>(
  ({ value, onChange, placeholder = "DD/MM/YYYY", className, disabled }, ref) => {
    const [open, setOpen] = React.useState(false);

    const dateValue = React.useMemo(() => {
      if (!value) return undefined;
      const d = parse(value, "yyyy-MM-dd", new Date());
      return isValid(d) ? d : undefined;
    }, [value]);

    const handleSelect = (date: Date | undefined) => {
      if (date) {
        onChange(format(date, "yyyy-MM-dd"));
      } else {
        onChange("");
      }
      setOpen(false);
    };

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
            initialFocus
            className={cn("p-3 pointer-events-auto")}
            captionLayout="dropdown"
            fromYear={1950}
            toYear={2040}
          />
        </PopoverContent>
      </Popover>
    );
  }
);
DateInput.displayName = "DateInput";

export { DateInput };
