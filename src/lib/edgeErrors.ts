// Global enrichment for Edge Function errors.
//
// By default `supabase.functions.invoke` throws a generic
// "Edge Function returned a non-2xx status code" and hides the response body,
// so the UI shows a meaningless message. This module patches `invoke` once so
// every call site automatically gets the real server-side reason
// (including nested iCount error descriptions) in `error.message`.
import { supabase } from "@/integrations/supabase/client";

/** Pull the most human-readable message out of an arbitrary error payload. */
export function extractErrorMessage(payload: unknown): string | null {
  if (payload == null) return null;
  if (typeof payload === "string") {
    const t = payload.trim();
    return t ? t.slice(0, 500) : null;
  }
  if (typeof payload !== "object") return null;

  const o = payload as Record<string, any>;
  const direct = [
    o.error_description,
    o.errorDescription,
    o.reason,
    o.message,
    o.msg,
    o.status_description,
    o.description,
    o.hint,
    typeof o.error === "string" ? o.error : null,
  ].find((v) => typeof v === "string" && v.trim());
  const nested = extractErrorMessage(o.details ?? o.error ?? o.data ?? null);

  const parts = [direct, nested].filter(Boolean) as string[];
  // Deduplicate: don't repeat the same text twice ("iCount failed — iCount failed").
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(" — ").slice(0, 500) : null;
}

async function readBody(res: Response): Promise<any> {
  try {
    const text = await res.clone().text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  } catch {
    return null;
  }
}

let patched = false;

export function installEdgeErrorEnrichment() {
  if (patched) return;
  patched = true;

  const functions: any = (supabase as any).functions;
  const original = functions.invoke.bind(functions);

  functions.invoke = async (name: string, options?: any) => {
    let result: any;
    try {
      result = await original(name, options);
    } catch (e: any) {
      e.message = `שגיאת רשת בקריאה ל-${name}: ${e?.message ?? "לא ידוע"}`;
      throw e;
    }

    const error = result?.error;
    if (error) {
      const ctx = (error as any).context;
      let detail: string | null = null;
      let status: number | undefined;
      let body: any = null;

      if (ctx && typeof ctx === "object" && typeof ctx.status === "number") {
        status = ctx.status;
        body = await readBody(ctx as Response);
        detail = extractErrorMessage(body);
      } else {
        detail = extractErrorMessage(ctx);
      }

      (error as any).status = status;
      (error as any).body = body;
      (error as any).functionName = name;

      const statusPart = status ? ` (HTTP ${status})` : "";
      error.message = detail
        ? `${detail}${statusPart}`
        : `${name}${statusPart}: ${error.message ?? "שגיאה לא ידועה"}`;
    }

    // 200 responses that carry an application-level error field.
    const dataErr = result?.data && typeof result.data === "object" ? (result.data as any).error : null;
    if (!error && dataErr) {
      const detail = extractErrorMessage(result.data);
      if (detail) result.data.error = detail;
    }

    return result;
  };
}
