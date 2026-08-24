import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ClipboardList, CreditCard, AlertTriangle, Users, CheckCheck, Loader2, Trash2, Volume2, VolumeX, CalendarClock, Play, Check, ChevronDown, ChevronUp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, type NotificationRow } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import { PAYMENT_SOUNDS, type PaymentSoundCategory } from "@/lib/notificationSound";

const ICONS: Record<string, { icon: typeof Bell; className: string }> = {
  registration: { icon: ClipboardList, className: "text-primary" },
  payment_paid: { icon: CreditCard, className: "text-emerald-600" },
  payment_failed: { icon: AlertTriangle, className: "text-destructive" },
  sibling_candidate: { icon: Users, className: "text-amber-600" },
  calendar_change_request: { icon: CalendarClock, className: "text-sky-600" },
};

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "עכשיו";
  if (m < 60) return `לפני ${m} דק׳`;
  const h = Math.floor(m / 60);
  if (h < 24) return `לפני ${h} שע׳`;
  const d = Math.floor(h / 24);
  if (d < 30) return `לפני ${d} ימים`;
  return new Date(iso).toLocaleDateString("he-IL");
}

const NotificationsBell = ({ className }: { className?: string }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const {
    items, unreadCount, isLoading, enabled, markRead, markAllRead, isMarking,
    dismiss, clearAll, isClearing, soundEnabled, setSoundEnabled,
    paymentSound, setPaymentSound, previewPaymentSound,
  } = useNotifications();
  const [soundPanel, setSoundPanel] = useState(false);
  const [soundCategory, setSoundCategory] = useState<PaymentSoundCategory>(
    PAYMENT_SOUNDS.find((s) => s.id === paymentSound)?.category ?? "register"
  );

  if (!enabled) return null;

  const handleClick = (n: NotificationRow) => {
    if (!n.isRead) markRead([n.id]);
    if (n.link_path) {
      setOpen(false);
      navigate(n.link_path);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="התראות"
          className={cn("relative hover:bg-primary-foreground/10", className)}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -left-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold leading-none text-destructive-foreground">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" dir="rtl" className="w-[22rem] p-0 max-w-[calc(100vw-1.5rem)]">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-1">
            <p className="text-sm font-semibold">התראות</p>
            <Button
              variant="ghost"
              size="icon"
              aria-label={soundEnabled ? "כבה צליל התראה" : "הפעל צליל התראה"}
              title={soundEnabled ? "צליל התראה פעיל" : "צליל התראה כבוי"}
              className="h-7 w-7 text-muted-foreground"
              onClick={() => setSoundEnabled(!soundEnabled)}
            >
              {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px] text-muted-foreground"
              onClick={() => setSoundPanel((v) => !v)}
            >
              צליל תשלום
            </Button>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-xs" disabled={isMarking} onClick={() => markAllRead()}>
                {isMarking ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <CheckCheck className="h-3.5 w-3.5 ml-1" />}
                סמן הכל כנקרא
              </Button>
            )}
            {items.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-destructive hover:text-destructive"
                disabled={isClearing}
                onClick={() => clearAll()}
              >
                {isClearing ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <Trash2 className="h-3.5 w-3.5 ml-1" />}
                נקה הכל
              </Button>
            )}
          </div>
        </div>
        {soundPanel && (
          <div className="border-b bg-muted/40 px-4 py-3 space-y-2 max-h-[22rem] overflow-y-auto">
            <p className="text-[11px] text-muted-foreground">בחר את הצליל שיושמע כשמתקבל תשלום</p>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {[
                { id: "register", label: "קופה" },
                { id: "coins", label: "מטבעות" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSoundCategory(cat.id as PaymentSoundCategory)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                    soundCategory === cat.id
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              {PAYMENT_SOUNDS.filter((s) => s.category === soundCategory).map((s) => (
                <div key={s.id} className="flex items-center gap-2">
                  <Button
                    variant={paymentSound === s.id ? "default" : "outline"}
                    size="sm"
                    className="h-8 flex-1 justify-start rounded-lg text-xs"
                    onClick={() => setPaymentSound(s.id)}
                  >
                    {paymentSound === s.id && <Check className="h-3.5 w-3.5 ml-1" />}
                    {s.label}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`השמע ${s.label}`}
                    className="h-8 w-8 shrink-0"
                    onClick={() => previewPaymentSound(s.id)}
                  >
                    <Play className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
        <ScrollArea className="max-h-[26rem]">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">טוען...</p>
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">אין התראות</p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => {
                const meta = ICONS[n.type] ?? { icon: Bell, className: "text-muted-foreground" };
                const Icon = meta.icon;
                return (
                  <li key={n.id} className="group flex items-start gap-2">
                    <button
                      onClick={() => handleClick(n)}
                      className={cn(
                        "flex flex-1 min-w-0 items-start gap-3 px-4 py-3 text-right transition-colors hover:bg-accent",
                        !n.isRead && "bg-primary/5"
                      )}
                    >
                      <span className={cn("mt-0.5 shrink-0", meta.className)}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className={cn("block text-sm text-foreground", !n.isRead && "font-semibold")}>
                          {n.title}
                        </span>
                        {n.body && <span className="block text-xs text-muted-foreground mt-0.5">{n.body}</span>}
                        <span className="block text-[11px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</span>
                      </span>
                      {!n.isRead && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-destructive" />}
                    </button>
                    <div className="shrink-0 pt-2 pl-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label="נקה התראה"
                        onClick={(e) => {
                          e.stopPropagation();
                          dismiss([n.id]);
                        }}
                        className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                      >
                        נקה
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationsBell;
