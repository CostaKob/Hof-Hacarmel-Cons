import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import AppLogo from "@/components/AppLogo";

const ShortLinkRedirect = () => {
  const { code } = useParams<{ code: string }>();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!code) {
        setNotFound(true);
        return;
      }
      const { data, error } = await supabase.rpc("resolve_short_link", { _code: code });
      if (cancelled) return;
      if (error || !data) {
        setNotFound(true);
        return;
      }
      window.location.replace(data as string);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center" dir="rtl">
      <AppLogo size="lg" />
      {notFound ? (
        <>
          <h1 className="text-xl font-semibold">הקישור לא נמצא</h1>
          <p className="text-muted-foreground">
            ייתכן שהקישור פג תוקף. אנא פנו למשרד: 04-6299711
          </p>
        </>
      ) : (
        <>
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">מעבירים אתכם לעמוד התשלום...</p>
        </>
      )}
    </div>
  );
};

export default ShortLinkRedirect;
