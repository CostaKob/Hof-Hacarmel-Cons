import { ComponentType, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Search, Loader2, Users, GraduationCap, Building2,
  Music2, Music4, Drum, ClipboardList,
} from "lucide-react";
import FamilyIcon from "@/components/icons/FamilyIcon";

interface SearchResult {
  kind: string;
  id: string;
  title: string;
  subtitle: string | null;
  path: string;
}

const KIND_META: Record<string, { label: string; icon: ComponentType<{ className?: string }> }> = {
  student: { label: "תלמידים", icon: Users },
  parent: { label: "הורים", icon: FamilyIcon },
  teacher: { label: "מורים", icon: GraduationCap },
  branch: { label: "שלוחות", icon: Building2 },
  ensemble: { label: "הרכבים", icon: Music2 },
  sm_school: { label: "בתי ספר מנגנים", icon: Music4 },
  sm_student: { label: "תלמידי בית ספר מנגן", icon: Music4 },
  instrument: { label: "כלי נגינה", icon: Drum },
  registration: { label: "הרשמות", icon: ClipboardList },
};

const KIND_ORDER = Object.keys(KIND_META);

const GlobalSearch = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const { data, error } = (await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{
          data: SearchResult[] | null;
          error: unknown;
        }>;
      }).rpc("global_search", { p_query: q }));
      if (!error && data) {
        setResults(data);
        setOpen(true);
      }
      setLoading(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const grouped = KIND_ORDER
    .map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) }))
    .filter((g) => g.items.length > 0);

  const pick = (r: SearchResult) => {
    setOpen(false);
    setQuery("");
    setResults([]);
    navigate(r.path);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-foreground/60" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter" && results.length > 0) pick(results[0]);
          }}
          placeholder="חיפוש: תלמיד, הורה, מורה, שלוחה, מספר כלי..."
          className="h-10 rounded-xl border-primary-foreground/20 bg-primary-foreground/10 pr-9 text-primary-foreground placeholder:text-primary-foreground/50 focus-visible:ring-primary-foreground/30"
        />
        {loading && (
          <Loader2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-primary-foreground/60" />
        )}
      </div>

      {open && query.trim().length >= 2 && (
        <div className="absolute inset-x-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card text-card-foreground shadow-2xl">
          {grouped.length === 0 && !loading && (
            <p className="px-4 py-6 text-center text-sm text-muted-foreground">
              לא נמצאו תוצאות עבור &quot;{query.trim()}&quot;
            </p>
          )}
          {grouped.map((g) => {
            const meta = KIND_META[g.kind];
            const Icon = meta.icon;
            return (
              <div key={g.kind}>
                <div className="sticky top-0 flex items-center gap-1.5 border-b border-border bg-muted/80 px-3 py-1.5 text-xs font-semibold text-muted-foreground backdrop-blur">
                  <Icon className="h-3.5 w-3.5" />
                  {meta.label}
                </div>
                {g.items.map((r) => (
                  <button
                    key={`${r.kind}-${r.id}`}
                    onClick={() => pick(r)}
                    className="flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-right transition-colors hover:bg-accent"
                  >
                    <span className="text-sm font-medium leading-tight">{r.title}</span>
                    {r.subtitle && (
                      <span className="text-xs text-muted-foreground leading-tight">
                        {r.subtitle}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;
