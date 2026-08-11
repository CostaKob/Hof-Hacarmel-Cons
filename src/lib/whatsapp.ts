const isMobileDevice = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export const buildWhatsAppUrl = (phone: string, message?: string) => {
  const params = new URLSearchParams({ phone: phone.replace(/\D/g, "") });
  if (message) params.set("text", message);
  const host = isMobileDevice() ? "https://api.whatsapp.com/send" : "https://web.whatsapp.com/send";
  return `${host}?${params.toString()}`;
};

// Desktop app deep link (whatsapp://) — opens the installed WhatsApp app
// without creating any new browser tab.
export const buildWhatsAppAppUrl = (phone: string, message?: string) => {
  const params = new URLSearchParams({ phone: phone.replace(/\D/g, "") });
  if (message) params.set("text", message);
  return `whatsapp://send?${params.toString()}`;
};

/**
 * Opens WhatsApp.
 * On desktop we use the whatsapp:// protocol so the installed desktop app is
 * reused (browsers cannot recycle a web.whatsapp.com tab — WhatsApp Web sets
 * Cross-Origin-Opener-Policy, which drops the window name and forces a new tab).
 * On mobile the OS hands the link to the WhatsApp app directly.
 */
export const openWhatsApp = (phone: string, message?: string) => {
  if (isMobileDevice()) {
    window.location.href = buildWhatsAppUrl(phone, message);
    return;
  }

  const appUrl = buildWhatsAppAppUrl(phone, message);
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = appUrl;
  document.body.appendChild(iframe);
  window.setTimeout(() => iframe.remove(), 2000);
};

/** Explicit fallback: open WhatsApp Web in a browser tab. */
export const openWhatsAppWeb = (phone: string, message?: string) => {
  window.open(buildWhatsAppUrl(phone, message), "musichof_whatsapp");
};
