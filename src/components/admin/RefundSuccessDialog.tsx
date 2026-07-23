import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Mail, Receipt, ExternalLink } from "lucide-react";

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
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-emerald-100 p-2 dark:bg-emerald-900/40">
              <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <DialogTitle className="text-xl">הזיכוי בוצע בהצלחה</DialogTitle>
          </div>
        </DialogHeader>

        {info && (
          <div className="space-y-3 pt-2">
            <div className="rounded-xl border border-border bg-muted/40 p-4">
              <div className="text-sm text-muted-foreground">סכום זיכוי</div>
              <div className="text-2xl font-bold text-foreground">
                ₪{Number(info.amount || 0).toLocaleString()}
              </div>
              {info.ccRefund && (
                <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-1">
                  ✓ הכסף הוחזר לכרטיס האשראי המקורי
                  {info.ccLast4 && <> · מסתיים ב-<span className="font-mono font-semibold">{info.ccLast4}</span></>}
                </div>
              )}
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-border p-3">
              <Receipt className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">מספר קבלה</div>
                <div className="font-semibold">{info.docNumber || "—"}</div>
              </div>
              {info.url && (
                <Button variant="outline" size="sm" onClick={() => window.open(info.url!, "_blank")} className="gap-1">
                  <ExternalLink className="h-4 w-4" />
                  פתח
                </Button>
              )}
            </div>

            <div className="flex items-start gap-3 rounded-xl border border-border p-3">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground">הקבלה נשלחה למייל</div>
                <div className="font-semibold break-all">
                  {info.sentToEmail || <span className="text-muted-foreground font-normal">לא נשלח מייל (אין כתובת)</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose} className="w-full">סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RefundSuccessDialog;
