import { Phone, MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const formatWhatsApp = (phone: string) => {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return "972" + digits.slice(1);
  return digits;
};

interface PhoneDisplayProps {
  phone?: string | null;
  className?: string;
  showIcon?: boolean;
  iconClassName?: string;
  textClassName?: string;
  /** Stop click bubbling — useful inside clickable rows/cards */
  stopPropagation?: boolean;
}

/**
 * Displays a phone number as a clickable tel: link, with a WhatsApp icon
 * next to it that opens a WhatsApp chat in a new tab.
 */
export const PhoneDisplay = ({
  phone,
  className,
  showIcon = false,
  iconClassName,
  textClassName,
  stopPropagation = false,
}: PhoneDisplayProps) => {
  if (!phone) return null;
  const wa = formatWhatsApp(phone);
  const handleClick = (e: React.MouseEvent) => {
    if (stopPropagation) e.stopPropagation();
  };

  return (
    <span dir="ltr" className={cn("inline-flex items-center gap-2", className)}>
      <a
        href={`tel:${phone}`}
        onClick={handleClick}
        className={cn("inline-flex items-center gap-1 text-primary hover:underline", textClassName)}
      >
        {showIcon && <Phone className={cn("h-3.5 w-3.5", iconClassName)} />}
        <span>{phone}</span>
      </a>
      {wa && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleClick}
          aria-label="פתח צ'אט בוואטסאפ"
          title="פתח צ'אט בוואטסאפ"
          className="text-green-600 hover:text-green-700 inline-flex items-center"
        >
          <MessageCircle className={cn("h-4 w-4", iconClassName)} />
        </a>
      )}
    </span>
  );
};

export default PhoneDisplay;
