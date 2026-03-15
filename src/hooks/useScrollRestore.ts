import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Saves and restores scroll position for list pages.
 * Call with a flag indicating data has loaded.
 */
export function useScrollRestore(dataLoaded: boolean) {
  const location = useLocation();
  const key = `scroll_${location.pathname}`;
  const restored = useRef(false);

  // Save scroll position on unmount
  useEffect(() => {
    return () => {
      sessionStorage.setItem(key, String(window.scrollY));
    };
  }, [key]);

  // Restore scroll position after data loads
  useEffect(() => {
    if (!dataLoaded || restored.current) return;
    const saved = sessionStorage.getItem(key);
    if (saved) {
      restored.current = true;
      requestAnimationFrame(() => {
        window.scrollTo(0, parseInt(saved, 10));
      });
    }
  }, [dataLoaded, key]);
}
