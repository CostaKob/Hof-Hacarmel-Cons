// Resolves an iCount income type ("מיון הכנסות") id by its name, so that
// documents can be classified into the right income category.
//
// The category itself must exist in iCount (הגדרות → מיוני הכנסות).
// If it does not exist, we simply skip the classification instead of failing.
const ICOUNT_BASE = "https://api.icount.co.il/api/v3.php";

export const SM_INCOME_TYPE_NAME =
  Deno.env.get("ICOUNT_SM_INCOME_TYPE_NAME") || "בית ספר מנגן";

const cache = new Map<string, string | null>();

function auth() {
  return {
    cid: Deno.env.get("ICOUNT_COMPANY_ID"),
    user: Deno.env.get("ICOUNT_USERNAME"),
    pass: Deno.env.get("ICOUNT_PASSWORD"),
  };
}

const norm = (v: unknown) => String(v ?? "").trim().replace(/["']/g, "");

export async function getIncomeTypeId(name: string): Promise<string | null> {
  const key = norm(name);
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  let id: string | null = null;
  try {
    const res = await fetch(`${ICOUNT_BASE}/income_type/get_list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth()),
    });
    const data = await res.json();
    const list = data?.income_types ?? data?.income_type_list ?? {};
    for (const [k, v] of Object.entries(list as Record<string, any>)) {
      const label = norm(typeof v === "string" ? v : v?.name ?? v?.income_type_name ?? v?.title);
      const value = String((typeof v === "object" && (v?.income_type_id ?? v?.id)) ?? k);
      if (label === key) { id = value; break; }
    }
    if (!id) console.warn(`[icount income type] "${key}" not found in iCount`);
  } catch (e) {
    console.error("[icount income type] lookup failed", e);
  }

  cache.set(key, id);
  return id;
}

/** Adds the income type to every line item (no-op when the category is missing). */
export async function withIncomeType<T extends Record<string, unknown>>(
  items: T[],
  name: string,
): Promise<T[]> {
  const id = await getIncomeTypeId(name);
  if (!id) return items;
  return items.map((it) => ({ ...it, income_type_id: id, income_type: id }));
}
