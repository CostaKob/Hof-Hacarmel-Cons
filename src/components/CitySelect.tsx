import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface CitySelectProps {
  id?: string;
  value: string;
  onChange: (val: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  className?: string;
}

const OTHER = "__other__";

/**
 * City picker — dropdown of managed cities with an "Other" option that reveals a free-text input.
 * The committed value is always a plain city name string (no sentinel persisted).
 */
export function CitySelect({ id, value, onChange, onBlur, placeholder = "בחרו ישוב", className }: CitySelectProps) {
  const { data: cities = [] } = useQuery({
    queryKey: ["cities-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cities")
        .select("id, name")
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const cityNames = cities.map((c: any) => c.name);
  const knownMatch = value && cityNames.includes(value);
  const initialMode: "list" | "other" = !value ? "list" : knownMatch ? "list" : "other";
  const [mode, setMode] = useState<"list" | "other">(initialMode);

  // Sync mode when value or list changes externally (e.g. token-prefill)
  useEffect(() => {
    if (!value) {
      setMode("list");
      return;
    }
    if (cityNames.length === 0) return; // wait until list loads before deciding
    setMode(cityNames.includes(value) ? "list" : "other");
  }, [value, cityNames.join("|")]);

  const selectValue = mode === "other" ? OTHER : (knownMatch ? value : "");

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Select
        dir="rtl"
        value={selectValue}
        onValueChange={(v) => {
          if (v === OTHER) {
            setMode("other");
            onChange("");
          } else {
            setMode("list");
            onChange(v);
          }
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {cities.map((c: any) => (
            <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>
          ))}
          <SelectItem value={OTHER}>אחר (הזינו ישוב)</SelectItem>
        </SelectContent>
      </Select>
      {mode === "other" && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="שם הישוב"
        />
      )}
    </div>
  );
}

export default CitySelect;
