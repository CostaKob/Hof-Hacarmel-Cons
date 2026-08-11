import { supabase } from "@/integrations/supabase/client";

/**
 * Public base for short links. Always the production domain so links sent from
 * preview environments still work for parents.
 */
export const SHORT_LINK_BASE = "https://musichof.com";

const cache = new Map<string, string>();

/**
 * Turns a long payment URL into a short, WhatsApp-friendly link.
 * On any failure it safely falls back to the original URL.
 */
export async function shortenUrl(url?: string | null): Promise<string> {
  if (!url) return "";
  if (!/^https:\/\//i.test(url)) return url;
  // Already short — nothing to do.
  if (url.startsWith(`${SHORT_LINK_BASE}/p/`)) return url;

  const cached = cache.get(url);
  if (cached) return cached;

  try {
    const { data, error } = await supabase.rpc("create_short_link", { _url: url });
    if (error || !data) return url;
    const short = `${SHORT_LINK_BASE}/p/${data}`;
    cache.set(url, short);
    return short;
  } catch {
    return url;
  }
}

/** Shortens several URLs, returning a map of original -> short (or original on failure). */
export async function shortenUrls(urls: Array<string | null | undefined>): Promise<Record<string, string>> {
  const unique = Array.from(new Set(urls.filter((u): u is string => !!u)));
  const results = await Promise.all(unique.map((u) => shortenUrl(u)));
  const map: Record<string, string> = {};
  unique.forEach((u, i) => {
    map[u] = results[i] || u;
  });
  return map;
}
