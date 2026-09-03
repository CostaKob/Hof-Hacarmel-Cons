import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Cake, Copy, MessageCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function buildBirthdayGreeting(teacherName: string): string {
  const firstName = (teacherName ?? "").trim().split(/\s+/)[0] ?? teacherName;
  return `${firstName} היקר! המון המון מזל טוב! מאחלים לך בריאות ואושר, באהבה ענקית צוות אולפן המוסיקה!`;
}

interface Props {
  teacherName: string;
  phone?: string | null;
  teacherId?: string | null;
  triggerVariant?: "default" | "outline" | "secondary" | "ghost";
  triggerClassName?: string;
  triggerLabel?: string;
}

const SendBirthdayGreetingDialog = ({
  teacherName,
  phone,
  teacherId,
  triggerVariant = "outline",
  triggerClassName = "h-11 rounded-xl",
  triggerLabel = "שלח ברכה",
}: Props) => {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState(buildBirthdayGreeting(teacherName));

  useEffect(() => {
    if (open) setMessage(buildBirthdayGreeting(teacherName));
  }, [open, teacherName]);

  const sendWhatsApp = () => {
    const text = encodeURIComponent(message);
    // opens WhatsApp share picker — user picks the teachers group
    window.open(`https://wa.me/?text=${text}`, "_blank");
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
