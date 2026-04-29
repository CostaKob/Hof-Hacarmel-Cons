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
    // Restore on mount
    const saved = scrollPositions.get(storageKey);
    if (saved != null && !restored.current) {
      restored.current = true;
      // Wait for content render
      requestAnimationFrame(() => {
        window.scrollTo(0, saved);
      });
    }

    const handleScroll = () => {
      scrollPositions.set(storageKey, window.scrollY);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
      // Save final position
      scrollPositions.set(storageKey, window.scrollY);
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

import { useState as useReactState, useEffect as useReactEffect } from "react";

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
  const [value, setValue] = useReactState<T>(saved !== undefined ? saved : initial);

  useReactEffect(() => {
    stateStore.set(fullKey, { value });
  }, [fullKey, value]);

  return [value, setValue];
};

