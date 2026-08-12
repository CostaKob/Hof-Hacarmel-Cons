import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ClipboardList, CreditCard, AlertTriangle, Users, CheckCheck, Loader2, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useNotifications, type NotificationRow } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const ICONS: Record<string, { icon: typeof Bell; className: string }> = {
  registration: { icon: ClipboardList, className: "text-primary" },
  payment_paid: { icon: CreditCard, className: "text-emerald-600" },
  payment_failed: { icon: AlertTriangle, className: "text-destructive" },
  sibling_candidate: { icon: Users, className: "text-amber-600" },
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
  const { items, unreadCount, isLoading, enabled, markRead, markAllRead, isMarking, dismiss, clearAll, isClearing } =
    useNotifications();

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
          <p className="text-sm font-semibold">התראות</p>
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
                  <li key={n.id} className="relative group">
                    <button
                      onClick={() => handleClick(n)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-3 text-right transition-colors hover:bg-accent",
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
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="נקה התראה"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismiss([n.id]);
                      }}
                      className="absolute top-2 right-2 h-7 text-xs text-destructive opacity-100 transition hover:bg-destructive/10 hover:opacity-100 focus:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                    >
                      נקה
                    </Button>
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
