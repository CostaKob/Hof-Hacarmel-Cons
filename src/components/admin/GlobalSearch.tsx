import { ComponentType, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import {
  Search, Loader2, Users, GraduationCap, Building2,
  Music2, Music4, Drum, ClipboardList, X,
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
  const location = useLocation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);

  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const reqIdRef = useRef(0);

  const flat = useMemo(() => {
    const ordered: SearchResult[] = [];
    KIND_ORDER.forEach((kind) => results.filter((r) => r.kind === kind).forEach((r) => ordered.push(r)));
    return ordered;
  }, [results]);

  const grouped = useMemo(
    () =>
      KIND_ORDER.map((kind) => ({ kind, items: results.filter((r) => r.kind === kind) })).filter(
        (g) => g.items.length > 0,
      ),
    [results],
  );

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 8, left: r.left, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      vv?.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  const close = useCallback(() => {
    setOpen(false);
    setActiveIndex(0);
  }, []);

  // Close on outside pointer, but never when interacting with the panel or input
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, close]);

  // Close when the route changes
  useEffect(() => {
    close();
  }, [location.pathname, close]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    const reqId = ++reqIdRef.current;
    debounceRef.current = setTimeout(async () => {
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{
          data: SearchResult[] | null;
          error: unknown;
        }>;
      }).rpc("global_search", { p_query: q });
      if (reqId !== reqIdRef.current) return;
      setResults(!error && data ? data : []);
      setActiveIndex(0);
      setLoading(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const pick = useCallback(
    (r: SearchResult) => {
      setOpen(false);
      setQuery("");
      setResults([]);
      setActiveIndex(0);
      inputRef.current?.blur();
      navigate(r.path);
    },
    [navigate],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      inputRef.current?.blur();
      return;
    }
    if (!open || flat.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % flat.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(flat[activeIndex] ?? flat[0]);
    }
  };

  // Keep active item in view
  useEffect(() => {
    if (!open) return;
    const el = panelRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  const clear = () => {
    setQuery("");
    setResults([]);
    close();
    inputRef.current?.focus();
  };

  const maxHeight = rect ? `calc(100dvh - ${Math.round(rect.top)}px - 16px)` : "60dvh";

  const panel =
    open && rect
      ? createPortal(
          <>
            <div className="fixed inset-0 z-[90]" aria-hidden onPointerDown={close} />
            <div
              ref={panelRef}
              role="listbox"
              dir="rtl"
              className="fixed z-[100] overflow-y-auto overscroll-contain rounded-xl border border-border shadow-2xl"
              style={{
                top: rect.top,
                left: rect.left,
                width: rect.width,
                maxHeight,
                WebkitOverflowScrolling: "touch",
                backgroundColor: "hsl(var(--card))",
                touchAction: "pan-y",
              }}
            >
              {loading && flat.length === 0 && (
                <p className="flex items-center justify-center gap-2 px-4 py-6 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  מחפש...
                </p>
              )}
              {!loading && flat.length === 0 && (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  לא נמצאו תוצאות עבור &quot;{query.trim()}&quot;
                </p>
              )}
              {(() => {
                let idx = -1;
                return grouped.map((g) => {
                  const meta = KIND_META[g.kind];
                  const Icon = meta.icon;
                  return (
                    <div key={g.kind}>
                      <div
                        className="sticky top-0 z-10 flex items-center gap-1.5 border-b border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                        style={{ backgroundColor: "hsl(var(--muted))" }}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {meta.label}
                        <span className="ms-auto opacity-70">{g.items.length}</span>
                      </div>
                      {g.items.map((r) => {
                        idx += 1;
                        const i = idx;
                        return (
                          <button
                            key={`${r.kind}-${r.id}`}
                            data-idx={i}
                            type="button"
                            role="option"
                            aria-selected={i === activeIndex}
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => pick(r)}
                            onMouseEnter={() => setActiveIndex(i)}
                            className={`flex w-full flex-col items-start gap-0.5 border-b border-border/40 px-4 py-3 text-right transition-colors last:border-b-0 ${
                              i === activeIndex ? "bg-accent" : ""
                            }`}
                          >
                            <span className="text-sm font-medium leading-tight">{r.title}</span>
                            {r.subtitle && (
                              <span className="text-xs leading-tight text-muted-foreground">{r.subtitle}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                });
              })()}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div ref={anchorRef} className="relative w-full">
      <div className="relative">
        <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-foreground/60" />
        <Input
          ref={inputRef}
          value={query}
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          placeholder="חיפוש: תלמיד, הורה, מורה, שלוחה, מספר כלי..."
          className="h-11 rounded-xl border-primary-foreground/20 bg-primary-foreground/10 pl-16 pr-9 text-base text-primary-foreground placeholder:text-primary-foreground/50 focus-visible:ring-primary-foreground/30 md:text-sm [&::-webkit-search-cancel-button]:hidden"
        />
        <div className="absolute left-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-primary-foreground/60" />}
          {query.length > 0 && (
            <button
              type="button"
              aria-label="נקה חיפוש"
              onClick={clear}
              className="flex h-7 w-7 items-center justify-center rounded-full text-primary-foreground/70 hover:bg-primary-foreground/10"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {panel}
    </div>
  );
};

export default GlobalSearch;
