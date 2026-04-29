import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Preserves scroll position of a list page across navigation.
 * On mount, restores scroll if returning from a child page.
 * On unmount, saves scroll position keyed by route path.
 */
const scrollPositions = new Map<string, number>();

export const useListStatePreservation = (key?: string) => {
  const location = useLocation();
  const storageKey = key || location.pathname;
  const restored = useRef(false);

  useEffect(() => {
    // Disable browser's automatic scroll restoration so it doesn't fight us
    const prevRestoration = window.history.scrollRestoration;
    try {
      window.history.scrollRestoration = "manual";
    } catch {}

    const saved = scrollPositions.get(storageKey);
    let cancelled = false;

    if (saved != null && saved > 0 && !restored.current) {
      restored.current = true;
      // Poll until the document is tall enough to reach the saved position
      // (lists fetch async, so content height grows after mount).
      const start = performance.now();
      const tryRestore = () => {
        if (cancelled) return;
        const maxScroll =
          document.documentElement.scrollHeight - window.innerHeight;
        if (maxScroll >= saved - 2) {
          window.scrollTo(0, saved);
          // Re-assert on the next frame in case layout shifts again
          requestAnimationFrame(() => {
            if (!cancelled) window.scrollTo(0, saved);
          });
          return;
        }
        if (performance.now() - start < 4000) {
          requestAnimationFrame(tryRestore);
        } else {
          // Give up gracefully — scroll as far as possible
          window.scrollTo(0, Math.min(saved, Math.max(maxScroll, 0)));
        }
      };
      requestAnimationFrame(tryRestore);
    }

    const handleScroll = () => {
      scrollPositions.set(storageKey, window.scrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      cancelled = true;
      window.removeEventListener("scroll", handleScroll);
      scrollPositions.set(storageKey, window.scrollY);
      try {
        window.history.scrollRestoration = prevRestoration;
      } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
};

/**
 * Persists arbitrary state per route path (search/filters) so it survives
 * unmount/remount when navigating to a child page and back.
 */
const stateStore = new Map<string, Record<string, unknown>>();

export const getPersistedState = <T extends Record<string, unknown>>(
  key: string,
  defaults: T,
): T => {
  const saved = stateStore.get(key);
  return { ...defaults, ...(saved as Partial<T> | undefined) } as T;
};

export const setPersistedState = (
  key: string,
  patch: Record<string, unknown>,
) => {
  const prev = stateStore.get(key) ?? {};
  stateStore.set(key, { ...prev, ...patch });
};

/**
 * Drop-in replacement for useState that persists value in module memory
 * keyed by `${routeKey}:${field}`. Survives unmount during in-app nav.
 */
export const usePersistedState = <T,>(
  routeKey: string,
  field: string,
  initial: T,
): [T, (v: T | ((prev: T) => T)) => void] => {
  const fullKey = `${routeKey}::${field}`;
  const saved = stateStore.get(fullKey)?.value as T | undefined;
  const [value, setValue] = useState<T>(saved !== undefined ? saved : initial);

  useEffect(() => {
    stateStore.set(fullKey, { value });
  }, [fullKey, value]);

  return [value, setValue];
};

