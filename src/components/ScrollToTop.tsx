import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export const ScrollToTop = () => {
  const { pathname } = useLocation();
  const navType = useNavigationType();
  const prevPathname = useRef<string | null>(null);

  useEffect(() => {
    // Don't scroll on the very first render (initial page load) — preserve
    // browser-restored scroll position.
    if (prevPathname.current === null) {
      prevPathname.current = pathname;
      return;
    }

    // Only scroll when the pathname actually changes (true page navigation),
    // not on search/filter updates or unrelated re-renders.
    if (prevPathname.current === pathname) {
      return;
    }

    prevPathname.current = pathname;

    // Respect browser back/forward — let it restore the previous scroll position.
    if (navType === "POP") return;

    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, navType]);

  return null;
};
