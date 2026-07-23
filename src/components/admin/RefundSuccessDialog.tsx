import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, FileDown } from "lucide-react";
import AppLogo from "@/components/AppLogo";

export interface RefundSuccessInfo {
  amount: number;
  docNumber?: string | null;
  sentToEmail?: string | null;
  url?: string | null;
  ccRefund?: boolean;
  ccLast4?: string | null;
}

interface Props {
  info: RefundSuccessInfo | null;
  onClose: () => void;
}

const RefundSuccessDialog = ({ info, onClose }: Props) => {
  return (
    <Dialog open={!!info} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent dir="rtl" className="max-w-lg p-0 overflow-hidden">
        {info && (
          <div className="py-10 px-6 text-center space-y-4">
            <div className="flex justify-center pb-2">
              <AppLogo size="lg" />
            </div>

            <CheckCircle2 className="h-14 w-14 mx-auto text-emerald-600" />

            <h2 className="text-2xl font-bold">הזיכוי בוצע בהצלחה</h2>

            <p className="text-muted-foreground">
              סכום זיכוי:{" "}
              <span className="font-semibold text-foreground">
                ₪{Number(info.amount || 0).toLocaleString()}
              </span>
              {info.docNumber && <> · קבלה #{info.docNumber}</>}
            </p>

            {info.ccRefund && (
              <p className="text-sm text-muted-foreground">
                הכסף הוחזר לכרטיס האשראי המקורי
                {info.ccLast4 && (
                  <> · מסתיים ב-<span className="font-mono font-semibold text-foreground">{info.ccLast4}</span></>
                )}
              </p>
            )}

            {info.sentToEmail ? (
              <p className="text-sm text-muted-foreground">
                הקבלה נשלחה לכתובת:{" "}
                <span className="font-medium text-foreground" dir="ltr">{info.sentToEmail}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">לא נשלח מייל (אין כתובת)</p>
            )}

            {info.url && (
              <div>
                <Button
                  variant="outline"
                  className="h-11 rounded-xl"
                  onClick={() => window.open(info.url!, "_blank")}
                >
                  <FileDown className="h-4 w-4 ml-2" /> הורדת קבלה
                </Button>
              </div>
            )}

            <div className="pt-4">
              <Button variant="ghost" onClick={onClose} className="h-10">
                סיום
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default RefundSuccessDialog;
