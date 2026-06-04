import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import AppLogo from "@/components/AppLogo";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State = "loading" | "ready" | "already" | "invalid" | "submitting" | "done" | "error";

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    if (!token) {
      setState("invalid");
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON } },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState("invalid");
          return;
        }
        if (data.reason === "already_unsubscribed") {
          setState("already");
        } else if (data.valid) {
          setState("ready");
        } else {
          setState("invalid");
        }
      } catch {
        setState("invalid");
      }
    })();
  }, [token]);

  const confirm = async () => {
    setState("submitting");
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.reason === "already_unsubscribed")) {
        setState("done");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md text-center">
        <CardContent className="pt-10 pb-10 space-y-6">
          <AppLogo size="lg" />
          {state === "loading" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">בודק קישור...</p>
            </>
          )}
          {state === "ready" && (
            <>
              <h2 className="text-xl font-bold">ביטול הרשמה לדיוור</h2>
              <p className="text-muted-foreground">
                ללחיצה על הכפתור תוסר כתובת המייל שלך מרשימת הדיוור של אולפן המוסיקה.
              </p>
              <Button onClick={confirm} className="w-full">אישור ביטול הרשמה</Button>
            </>
          )}
          {state === "submitting" && (
            <>
              <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
              <p className="text-muted-foreground">מעבד...</p>
            </>
          )}
          {state === "done" && (
            <>
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold">בוטלה הרשמה לדיוור</h2>
              <p className="text-muted-foreground">לא תקבלי/ תקבל הודעות נוספות לכתובת זו.</p>
            </>
          )}
          {state === "already" && (
            <>
              <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
              <h2 className="text-xl font-bold">כבר בוטלה הרשמה</h2>
              <p className="text-muted-foreground">כתובת המייל הזו כבר הוסרה מרשימת הדיוור.</p>
            </>
          )}
          {(state === "invalid" || state === "error") && (
            <>
              <XCircle className="h-16 w-16 text-destructive mx-auto" />
              <h2 className="text-xl font-bold">קישור לא תקין</h2>
              <p className="text-muted-foreground">
                הקישור פג תוקף או אינו תקין. אם הגעת לכאן בטעות אפשר להתעלם מההודעה.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
