// Hebrew-aware alphabetical sort helpers.
export const cmpHe = (a: string, b: string) => (a || "").localeCompare(b || "", "he");

export const sortByName = <T extends Record<string, any>>(arr: T[] | null | undefined): T[] =>
  [...(arr || [])].sort((a, b) => cmpHe(a?.name || "", b?.name || ""));

export const sortByPerson = <T extends Record<string, any>>(arr: T[] | null | undefined): T[] =>
  [...(arr || [])].sort((a, b) =>
    cmpHe(
      `${a?.first_name || ""} ${a?.last_name || ""}`,
      `${b?.first_name || ""} ${b?.last_name || ""}`,
    ),
  );
