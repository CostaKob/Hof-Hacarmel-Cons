import { useEffect } from "react";

/**
 * Keeps --app-height (px) in sync with the *actual* visible viewport height.
 * iOS Chrome (especially from a home-screen shortcut) sometimes reports
 * 100svh/100dvh shorter than the visible area, leaving an empty gap at the
 * bottom. window.innerHeight / visualViewport.height track the real area.
 */
const ViewportHeightSync = () => {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      const h = window.visualViewport?.height ?? window.innerHeight;
      root.style.setProperty("--app-height", `${Math.round(h)}px`);
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  return null;
};

export default ViewportHeightSync;
