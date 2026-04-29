import { useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, MessageCircle } from "lucide-react";

const WhatsAppRedirect = () => {
  const [searchParams] = useSearchParams();

  const targetUrl = useMemo(() => {
    const phone = searchParams.get("phone")?.replace(/[^\d]/g, "") || "";
    const text = searchParams.get("text") || "";

    if (!phone) return "";

    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }, [searchParams]);

  useEffect(() => {
    if (targetUrl) {
      window.location.replace(targetUrl);
    }
  }, [targetUrl]);

  return (
    <main dir="rtl" className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <div className="rounded-full bg-primary/10 p-4 text-primary">
          {targetUrl ? <Loader2 className="h-8 w-8 animate-spin" /> : <MessageCircle className="h-8 w-8" />}
        </div>
        <h1 className="text-xl font-semibold">פותח את WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          {targetUrl ? "מיד תועברו לחלון השליחה." : "חסר מספר טלפון לפתיחת ההודעה."}
        </p>
        {targetUrl && (
          <a className="text-sm font-medium text-primary underline-offset-4 hover:underline" href={targetUrl}>
            פתח ידנית
          </a>
        )}
      </div>
    </main>
  );
};

export default WhatsAppRedirect;