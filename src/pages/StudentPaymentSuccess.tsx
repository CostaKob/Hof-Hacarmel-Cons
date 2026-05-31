import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Clock, XCircle, FileDown } from "lucide-react";
import AppLogo from "@/components/AppLogo";

const StudentPaymentSuccess = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const paymentId = params.get("payment_id");
  const status = params.get("status");
  const [pollCount, setPollCount] = useState(0);

  const { data: payment, isLoading } = useQuery({
    queryKey: ["student-payment-after-pay", paymentId, pollCount],
    enabled: !!paymentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .rpc("get_student_payment_public_status" as any, { _payment_id: paymentId! });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return row as any;
    },
    refetchInterval: (q) => {
      const p: any = q.state.data;
      if (status === "cancel") return false;
      if (p?.payment_status === "paid") return false;
      return 2000;
    },
  });

  useEffect(() => {
    if (status === "cancel") return;
    if (payment?.payment_status === "paid") return;
    const t = setTimeout(() => setPollCount((c) => c + 1), 60000);
    return () => clearTimeout(t);
  }, [payment?.payment_status, status]);

  const renderBody = () => {
    if (status === "cancel") {
      return (
        <>
          <XCircle className="h-14 w-14 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">התשלום בוטל</h2>
          <p className="text-muted-foreground">לא בוצע חיוב. ניתן להשלים את התשלום בהמשך באמצעות הקישור שנשלח אליכם.</p>
        </>
      );
    }

    if (!paymentId) {
      return (
        <>
          <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-600" />
          <h2 className="text-2xl font-bold">התשלום התקבל בהצלחה!</h2>
          <p className="text-muted-foreground">הקבלה תישלח אליכם במייל בדקות הקרובות.</p>
        </>
      );
    }

    if (isLoading || !payment) {
      return (
        <>
          <Clock className="h-14 w-14 mx-auto text-primary animate-pulse" />
          <h2 className="text-2xl font-bold">מאמתים את התשלום...</h2>
          <p className="text-muted-foreground">רגע אחד.</p>
        </>
      );
    }

    if (payment.payment_status === "paid") {
      return (
        <>
          <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-600" />
          <h2 className="text-2xl font-bold">התשלום התקבל בהצלחה!</h2>
          <p className="text-muted-foreground">
            סכום ששולם: <span className="font-semibold text-foreground">₪{Number(payment.amount).toLocaleString()}</span>
            {payment.icount_doc_number && <> · קבלה #{payment.icount_doc_number}</>}
          </p>
          <p className="text-sm text-muted-foreground">הקבלה נשלחה אליכם גם במייל.</p>
          {payment.recipient_email && (
            <p className="text-sm text-muted-foreground">
              לכתובת: <span className="font-medium text-foreground" dir="ltr">{payment.recipient_email}</span>
            </p>
          )}
          {payment.invoice_url && (
            <Button variant="outline" className="h-11 rounded-xl" onClick={() => window.open(payment.invoice_url, "_blank")}>
              <FileDown className="h-4 w-4 ml-2" /> הורדת קבלה
            </Button>
          )}
        </>
      );
    }

    return (
      <>
        <Clock className="h-14 w-14 mx-auto text-amber-500 animate-pulse" />
        <h2 className="text-2xl font-bold">התשלום בעיבוד</h2>
        <p className="text-muted-foreground">
          האישור עשוי לקחת מספר רגעים. ברגע שיתקבל אישור — תוכלו לראות את הקבלה כאן או בקישור שיישלח לכם במייל.
        </p>
      </>
    );
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-lg w-full">
        <CardContent className="py-12 text-center space-y-4">
          {renderBody()}
          <div className="pt-4">
            <Button variant="ghost" onClick={() => navigate("/")} className="h-10">
              סיום
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StudentPaymentSuccess;
