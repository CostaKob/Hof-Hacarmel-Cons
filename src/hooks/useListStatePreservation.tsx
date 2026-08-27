import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

/**
 * Preserves scroll position of a list page across navigation.
 * On mount, restores scroll if returning from a child page.
 * On unmount, saves scroll position keyed by route path.
 *
 * Admin pages scroll inside the <main data-scroll-container> element rather
 * than the window, so this hook uses that element when present.
 */
const scrollPositions = new Map<string, number>();
const lockedScrollKeys = new Set<string>();
const SESSION_PREFIX = "list-scroll::";

const getScrollContainer = () => {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>("[data-scroll-container]");
};

const getScrollTop = () => {
  const el = getScrollContainer();
  if (el) return el.scrollTop;
  return window.scrollY;
};

const getMaxScroll = () => {
  const el = getScrollContainer();
  if (el) return Math.max(0, el.scrollHeight - el.clientHeight);
  return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
};

const scrollToY = (y: number) => {
  const el = getScrollContainer();
  if (el) {
    el.scrollTop = y;
  } else {
    window.scrollTo(0, y);
  }
};

const readSavedScroll = (key: string) => {
  const memoryValue = scrollPositions.get(key);
  if (memoryValue != null) return memoryValue;

  try {
    const stored = window.sessionStorage.getItem(`${SESSION_PREFIX}${key}`);
    return stored ? Number(stored) : undefined;
  } catch {
    // sessionStorage can be unavailable in restricted browser contexts.
    return undefined;
  }
};

const writeSavedScroll = (key: string, value: number) => {
  const scrollY = Math.max(0, Math.round(value));
  scrollPositions.set(key, scrollY);
  try {
    window.sessionStorage.setItem(`${SESSION_PREFIX}${key}`, String(scrollY));
  } catch {
    // Ignore storage failures; in-memory restoration still works.
  }
};

export const saveListScrollPosition = (key: string, value?: number) => {
  writeSavedScroll(key, value ?? getScrollTop());
  lockedScrollKeys.add(key);
};

export const useListStatePreservation = (key?: string) => {
  const location = useLocation();
  const storageKey = key || location.pathname;
  const restored = useRef(false);

  useEffect(() => {
    // Disable browser's automatic scroll restoration so it doesn't fight us
    const prevRestoration = window.history.scrollRestoration;
    try {
      window.history.scrollRestoration = "manual";
    } catch {
      // Some browsers expose scrollRestoration as read-only.
    }

    const scroller = getScrollContainer();
    const saved = readSavedScroll(storageKey);
    let cancelled = false;

    if (saved != null && saved > 0 && !restored.current) {
      restored.current = true;
      // Poll until the container is tall enough to reach the saved position
      // (lists fetch async, so content height grows after mount).
      const start = performance.now();
      const tryRestore = () => {
        if (cancelled) return;
        const maxScroll = getMaxScroll();
        if (maxScroll >= saved - 2) {
          scrollToY(saved);
          // Re-assert on the next frame in case layout shifts again
          requestAnimationFrame(() => {
            if (!cancelled) scrollToY(saved);
            lockedScrollKeys.delete(storageKey);
          });
          return;
        }
        if (performance.now() - start < 4000) {
          requestAnimationFrame(tryRestore);
        } else {
          // Give up gracefully — scroll as far as possible
          scrollToY(Math.min(saved, Math.max(maxScroll, 0)));
          lockedScrollKeys.delete(storageKey);
        }
      };
      requestAnimationFrame(tryRestore);
    } else {
      lockedScrollKeys.delete(storageKey);
    }

    const handleScroll = () => {
      if (!lockedScrollKeys.has(storageKey)) {
        scrollPositions.set(storageKey, getScrollTop());
      }
    };

    const target = scroller || window;
    target.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      cancelled = true;
      target.removeEventListener("scroll", handleScroll);
      if (!lockedScrollKeys.has(storageKey)) {
        writeSavedScroll(storageKey, getScrollTop());
      }
      try {
        window.history.scrollRestoration = prevRestoration;
      } catch {
        // Some browsers expose scrollRestoration as read-only.
      }
    };
  }, [storageKey]);
};

/**
 * Persists arbitrary state per route path (search/filters) so it survives
 * unmount/remount when navigating to a child page and back.
 */
const stateStore = new Map<string, Record<string, unknown>>();
const STATE_SESSION_PREFIX = "list-state::";

const readPersistedValue = <T,>(fullKey: string): T | undefined => {
  const memoryValue = stateStore.get(fullKey)?.value as T | undefined;
  if (memoryValue !== undefined) return memoryValue;

  try {
    const stored = window.sessionStorage.getItem(`${STATE_SESSION_PREFIX}${fullKey}`);
    return stored == null ? undefined : (JSON.parse(stored) as T);
  } catch {
    return undefined;
  }
};

const writePersistedValue = <T,>(fullKey: string, value: T) => {
  stateStore.set(fullKey, { value });
  try {
    window.sessionStorage.setItem(`${STATE_SESSION_PREFIX}${fullKey}`, JSON.stringify(value));
  } catch {
    // Ignore storage failures; in-memory persistence still works.
  }
};

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
  const saved = readPersistedValue<T>(fullKey);
  const [value, setValue] = useState<T>(saved !== undefined ? saved : initial);

  useEffect(() => {
    writePersistedValue(fullKey, value);
  }, [fullKey, value]);

  return [value, setValue];
};

