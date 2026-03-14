import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const LOGO_PATH = "logo.png";
const BUCKET = "app-settings";
const CACHE_KEY = "app-logo-url";
const CACHE_TS_KEY = "app-logo-ts";
const CACHE_TTL = 5 * 60 * 1000; // 5 min

export function useAppLogo() {
  const [logoUrl, setLogoUrl] = useState<string>(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    const ts = localStorage.getItem(CACHE_TS_KEY);
    if (cached && ts && Date.now() - Number(ts) < CACHE_TTL) return cached;
    return "/logo.png";
  });

  useEffect(() => {
    const cached = localStorage.getItem(CACHE_KEY);
    const ts = localStorage.getItem(CACHE_TS_KEY);
    if (cached && ts && Date.now() - Number(ts) < CACHE_TTL) {
      setLogoUrl(cached);
      return;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(LOGO_PATH);
    // Check if file exists by fetching head
    fetch(data.publicUrl, { method: "HEAD" })
      .then((res) => {
        if (res.ok) {
          const url = `${data.publicUrl}?t=${Date.now()}`;
          setLogoUrl(url);
          localStorage.setItem(CACHE_KEY, url);
          localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
        }
        // else keep default /logo.png
      })
      .catch(() => {
        // keep default
      });
  }, []);

  const refreshLogo = () => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(LOGO_PATH);
    const url = `${data.publicUrl}?t=${Date.now()}`;
    setLogoUrl(url);
    localStorage.setItem(CACHE_KEY, url);
    localStorage.setItem(CACHE_TS_KEY, String(Date.now()));
  };

  return { logoUrl, refreshLogo };
}
