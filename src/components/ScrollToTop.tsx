import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

export const ScrollToTop = () => {
  const { pathname, search } = useLocation();
  const navType = useNavigationType();

  useEffect(() => {
    // Only scroll to top on true page navigation, not on filter/search changes
    const isAdminListSearchUpdate =
      pathname.startsWith("/admin/") && search && navType === "REPLACE";

    if (navType !== "POP" && !isAdminListSearchUpdate) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }, [pathname, search, navType]);

  return null;
};
