export function normalizePhone(phone: string): string {
  return phone.replace(/[^\d]/g, "");
}

export function isValidIsraeliPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  const mobileRegex = /^(050|051|052|053|054|055|056|057|058|059)\d{7}$/;
  const landlineRegex = /^(02|03|04|08)\d{7}$/;
  return mobileRegex.test(normalized) || landlineRegex.test(normalized);
}
