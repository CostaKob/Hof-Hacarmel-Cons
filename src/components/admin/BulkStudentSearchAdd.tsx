import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, Loader2 } from "lucide-react";

export interface FoundRecipient {
  email: string;
  parentName: string;
  studentName: string;
}

interface Props {
  onAdd: (recipients: FoundRecipient[]) => void;
}

const BulkStudentSearchAdd = ({ onAdd }: Props) => {
  const [term, setTerm] = useState("");
  const q = term.trim();

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["bulk-student-search", q],
    enabled: q.length >= 2,
    queryFn: async (): Promise<(FoundRecipient & { source: string; key: string })[]> => {
      const like = `%${q}%`;
      const [priv, sm] = await Promise.all([
        supabase
          .from("students")
          .select("id, first_name, last_name, parent_name, parent_email, parent_name_2, parent_email_2")
          .or(`first_name.ilike.${like},last_name.ilike.${like}`)
          .limit(25),
        supabase
          .from("school_music_students")
          .select("id, student_first_name, student_last_name, parent_name, parent_email")
          .or(`student_first_name.ilike.${like},student_last_name.ilike.${like}`)
          .limit(25),
      ]);

      const out: (FoundRecipient & { source: string; key: string })[] = [];
      for (const s of (priv.data as any[]) || []) {
        const studentName = `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim();
        if (s.parent_email)
          out.push({
            key: `p-${s.id}-1`,
            source: "פרטני",
            studentName,
            parentName: s.parent_name ?? "",
            email: String(s.parent_email).trim().toLowerCase(),
          });
        if (s.parent_email_2)
          out.push({
            key: `p-${s.id}-2`,
            source: "פרטני",
            studentName,
            parentName: s.parent_name_2 ?? "",
            email: String(s.parent_email_2).trim().toLowerCase(),
          });
      }
      for (const s of (sm.data as any[]) || []) {
        if (!s.parent_email) continue;
        out.push({
          key: `sm-${s.id}`,
          source: "בי״ס מנגן",
          studentName: `${s.student_first_name ?? ""} ${s.student_last_name ?? ""}`.trim(),
          parentName: s.parent_name ?? "",
          email: String(s.parent_email).trim().toLowerCase(),
        });
      }
      return out;
    },
  });

  const hasQuery = q.length >= 2;
  const empty = useMemo(() => hasQuery && !isFetching && results.length === 0, [hasQuery, isFetching, results]);

  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
      <Label className="text-xs">חיפוש תלמיד והוספה מהמאגר</Label>
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="הקלידו שם תלמיד..."
          className="h-10 rounded-xl pr-9"
          dir="rtl"
        />
      </div>

      {hasQuery && (
        <div className="max-h-64 overflow-y-auto overscroll-contain rounded-lg border border-border bg-background divide-y">
          {isFetching && (
            <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> מחפש...
            </p>
          )}
          {empty && <p className="p-3 text-xs text-muted-foreground">לא נמצאו תלמידים עם כתובת מייל.</p>}
          {results.map((r) => (
            <div key={r.key} className="flex items-center justify-between gap-2 p-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {r.studentName}
                  <Badge variant="outline" className="mr-2 text-[10px]">{r.source}</Badge>
                </p>
                <p className="text-xs text-muted-foreground truncate" dir="ltr">
                  {r.email} {r.parentName ? `· ${r.parentName}` : ""}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-lg shrink-0"
                onClick={() => onAdd([{ email: r.email, parentName: r.parentName, studentName: r.studentName }])}
              >
                <Plus className="h-3.5 w-3.5 ml-1" /> הוסף
              </Button>
            </div>
          ))}
          {results.length > 0 && (
            <div className="p-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 rounded-lg w-full"
                onClick={() =>
                  onAdd(results.map((r) => ({ email: r.email, parentName: r.parentName, studentName: r.studentName })))
                }
              >
                הוסף את כל התוצאות ({results.length})
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BulkStudentSearchAdd;
