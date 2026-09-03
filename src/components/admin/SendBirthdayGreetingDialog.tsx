import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Cake, Copy, MessageCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

function normalizeWaPhone(phone?: string | null): string {
  if (!phone) return "";
  return String(phone).replace(/\D/g, "").replace(/^0/, "");
}

export function buildBirthdayGreeting(teacherName: string): string {
  return `${teacherName} היקר! המון המון מזל טוב! מאחלים לך בריאות ואושר, באהבה ענקית צוות אולפן המוסיקה!`;
}

interface Props {
  teacherName: string;
  phone?: string | null;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
  triggerClassName?: string;
  triggerLabel?: string;
}

const SendBirthdayGreetingDialog = ({
  teacherName,
  phone,
  triggerVariant = "outline",
  triggerClassName = "h-11 rounded-xl",
  triggerLabel = "שלח ברכה",
}: Props) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(buildBirthdayGreeting(teacherName));

  useEffect(() => {
    if (open) setMessage(buildBirthdayGreeting(teacherName));
  }, [open, teacherName]);

  const waPhone = normalizeWaPhone(phone);

  const sendWhatsApp = () => {
    const text = encodeURIComponent(message);
    const url = waPhone
      ? `https://wa.me/972${waPhone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank");
    setOpen(false);
  };

  const copyText = async () => {
    await navigator.clipboard.writeText(message);
    toast.success("הברכה הועתקה");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className={triggerClassName}>
          <Cake className="h-4 w-4" /> {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto overscroll-contain">
        <DialogHeader>
          <DialogTitle>שליחת ברכת יום הולדת</DialogTitle>
          <DialogDescription>
            {waPhone ? `הברכה תישלח בוואטסאפ למספר ${phone}` : "אין מספר טלפון למורה — ניתן לבחור נמען בוואטסאפ"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="birthday-message">נוסח הברכה</Label>
          <Textarea
            id="birthday-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            className="rounded-xl"
          />
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="h-12 rounded-xl" onClick={copyText}>
            <Copy className="h-4 w-4" /> העתק
          </Button>
          <Button className="h-12 rounded-xl" onClick={sendWhatsApp} disabled={!message.trim()}>
            <MessageCircle className="h-4 w-4" /> שלח בוואטסאפ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SendBirthdayGreetingDialog;
