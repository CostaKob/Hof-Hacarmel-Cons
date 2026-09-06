import { useEffect } from "react";

/**
 * Keeps --app-height (px) in sync with the actual app window height.
 * iOS home-screen shortcuts can expose a stale visualViewport value during
 * their first frames, so the app shell deliberately follows innerHeight.
 */
const ViewportHeightSync = () => {
  useEffect(() => {
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--app-height", `${Math.round(window.innerHeight)}px`);
    };
    update();
    const frameId = window.requestAnimationFrame(update);
    const settleTimers = [100, 300, 700].map((delay) => window.setTimeout(update, delay));
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.cancelAnimationFrame(frameId);
      settleTimers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return null;
};

export default ViewportHeightSync;
