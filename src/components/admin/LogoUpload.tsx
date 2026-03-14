import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";

interface Props {
  currentLogoUrl: string;
  onUploaded: () => void;
}

export default function LogoUpload({ currentLogoUrl, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("יש להעלות קובץ תמונה בלבד");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("גודל הקובץ מוגבל ל-5MB");
      return;
    }

    setUploading(true);
    try {
      const { error } = await supabase.storage
        .from("app-settings")
        .upload("logo.png", file, { upsert: true, cacheControl: "0" });

      if (error) throw error;
      toast.success("הלוגו עודכן בהצלחה");
      onUploaded();
    } catch {
      toast.error("שגיאה בהעלאת הלוגו");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-4">
      <img
        src={currentLogoUrl}
        alt="לוגו נוכחי"
        className="h-16 w-auto object-contain rounded-xl border border-border bg-card p-2"
      />
      <div className="space-y-1">
        <Button
          variant="outline"
          className="rounded-xl"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin ml-2" />
          ) : (
            <Upload className="h-4 w-4 ml-2" />
          )}
          {uploading ? "מעלה..." : "החלף לוגו"}
        </Button>
        <p className="text-xs text-muted-foreground">PNG, JPG עד 5MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
