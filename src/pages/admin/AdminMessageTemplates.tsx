import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";
import {
  DEFAULT_TEMPLATES,
  FAMILY_ASSIGNMENT_TEMPLATE_KEY,
  TEMPLATE_VARIABLES,
  SAMPLE_VARIABLE_VALUES,
  fetchMessageTemplate,
  renderTemplate,
  parseInlineLinks,
} from "@/lib/messageTemplates";

const KEY = FAMILY_ASSIGNMENT_TEMPLATE_KEY;

const AdminMessageTemplates = () => {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["message-template", KEY],
    queryFn: () => fetchMessageTemplate(KEY),
  });

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) {
      setSubject(data.subject);
      setBody(data.body);
    }
  }, [data]);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("message_templates")
        .upsert(
          {
            key: KEY,
            name: DEFAULT_TEMPLATES[KEY].name,
            subject,
            body,
          },
          { onConflict: "key" },
        );
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["message-template", KEY] });
      toast.success("הנוסח נשמר");
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const resetToDefault = () => {
    setSubject(DEFAULT_TEMPLATES[KEY].subject);
    setBody(DEFAULT_TEMPLATES[KEY].body);
    toast.info("הוחזר לנוסח ברירת המחדל — יש ללחוץ שמירה");
  };

  return (
    <AdminLayout title="נוסחי הודעות">
      <PageTitle title="נוסחי הודעות להורים" />
      <div className="space-y-6" dir="rtl">
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">{DEFAULT_TEMPLATES[KEY].name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-xl bg-accent/60 p-4 text-sm">
              <p className="font-medium mb-2">משתנים זמינים (יוחלפו אוטומטית בעת השליחה):</p>
              <ul className="space-y-1">
                {TEMPLATE_VARIABLES[KEY].map((v) => {
                  const name = v.token.replace(/[{}]/g, "");
                  const sample = SAMPLE_VARIABLE_VALUES[KEY]?.[name] ?? "";
                  return (
                    <li key={v.token} className="rounded-lg bg-background/70 p-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="rounded bg-background px-1.5 py-0.5 text-xs" dir="ltr">
                          {v.token}
                        </code>
                        <span className="text-muted-foreground">{v.description}</span>
                      </div>
                      {sample && (
                        <pre className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground/90 font-sans">
                          {sample}
                        </pre>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">נושא המייל</Label>
              <Input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="h-12 rounded-xl"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">תוכן ההודעה</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={22}
                dir="rtl"
                className="rounded-xl font-mono text-xs"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">תצוגה מקדימה (עם נתוני דוגמה)</Label>
              <div className="rounded-xl border bg-background p-4 text-sm leading-6" dir="rtl">
                {renderTemplate(body, SAMPLE_VARIABLE_VALUES[KEY] || {})
                  .split("\n")
                  .map((line, i) => (
                    <p key={i} className="min-h-[1.25rem]">
                      {parseInlineLinks(line).map((part, j) =>
                        part.type === "link" ? (
                          <a
                            key={j}
                            href={part.href}
                            target="_blank"
                            rel="noreferrer"
                            className="font-bold text-primary underline"
                          >
                            {part.text}
                          </a>
                        ) : (
                          <span key={j}>{part.text}</span>
                        ),
                      )}
                    </p>
                  ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                טיפ: קישור מעוצב נכתב כך — [לחצו כאן לתשלום](https://כתובת-הקישור)
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={save} disabled={saving || isLoading} className="h-12 rounded-xl w-full sm:w-auto">
                <Save className="h-4 w-4" />
                {saving ? "שומר..." : "שמירה"}
              </Button>
              <Button
                variant="outline"
                onClick={resetToDefault}
                className="h-12 rounded-xl w-full sm:w-auto"
              >
                <RotateCcw className="h-4 w-4" />
                החזר לנוסח ברירת המחדל
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
};

export default AdminMessageTemplates;
