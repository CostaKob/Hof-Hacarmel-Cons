const WHATSAPP_WINDOW_NAME = "musichof_whatsapp";

const isMobileDevice = () =>
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

export const buildWhatsAppUrl = (phone: string, message?: string) => {
  const params = new URLSearchParams({ phone: phone.replace(/\D/g, "") });
  if (message) params.set("text", message);
  const host = isMobileDevice() ? "https://api.whatsapp.com/send" : "https://web.whatsapp.com/send";
  return `${host}?${params.toString()}`;
};

export const openWhatsApp = (phone: string, message?: string) => {
  const whatsappWindow = window.open(buildWhatsAppUrl(phone, message), WHATSAPP_WINDOW_NAME);
  whatsappWindow?.focus();
};