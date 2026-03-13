import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useEnrollmentDetails, useStudentNotes } from "@/hooks/useTeacherData";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ArrowRight, StickyNote, Plus } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  primary: "ראשי",
  secondary: "משני",
};

const TeacherStudentCard = () => {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: teacher } = useTeacherProfile();
  const { data: enrollment, isLoading } = useEnrollmentDetails(enrollmentId);
  const { data: notes } = useStudentNotes(enrollment?.student_id, teacher?.id);

  const [noteContent, setNoteContent] = useState("");
  const [isGeneralNote, setIsGeneralNote] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const student = enrollment?.students;

  const handleAddNote = async () => {
    if (!noteContent.trim() || !enrollment || !user) return;
    setSubmitting(true);
    const { error } = await supabase.from("student_notes").insert({
      student_id: enrollment.student_id,
      enrollment_id: isGeneralNote ? null : enrollment.id,
      author_user_id: user.id,
      content: noteContent.trim(),
    });
    setSubmitting(false);
    if (error) {
      toast.error("שגיאה בשמירת ההערה");
      return;
    }
    toast.success("ההערה נשמרה");
    setNoteContent("");
    queryClient.invalidateQueries({ queryKey: ["student-notes"] });
  };

  if (isLoading) {
    return (
      <div dir="rtl" className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!enrollment || !student) {
    return (
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-muted-foreground">רישום לא נמצא</p>
        <Button variant="outline" onClick={() => navigate("/teacher/students")}>חזרה</Button>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/teacher/students")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">
            כרטיס תלמיד — {student.first_name} {student.last_name}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-6">
        {/* Student details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">פרטי תלמיד</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
            <InfoRow label="שם מלא" value={`${student.first_name} ${student.last_name}`} />
            <InfoRow label="תאריך לידה" value={student.date_of_birth} />
            <InfoRow label="כתובת" value={student.address} />
            <InfoRow label="עיר" value={student.city} />
            <InfoRow label="ת.ז." value={student.national_id} />
          </CardContent>
        </Card>

        {/* Parent details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">פרטי הורים</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
            <InfoRow label="הורה 1 — שם" value={student.parent_name} />
            <InfoRow label="הורה 1 — טלפון" value={student.parent_phone} />
            <InfoRow label="הורה 1 — אימייל" value={student.parent_email} />
            <InfoRow label="הורה 2 — שם" value={student.parent_name_2} />
            <InfoRow label="הורה 2 — טלפון" value={student.parent_phone_2} />
            <InfoRow label="הורה 2 — אימייל" value={student.parent_email_2} />
          </CardContent>
        </Card>

        {/* Enrollment details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">פרטי רישום</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
            <InfoRow label="כלי" value={enrollment.instruments?.name} />
            <InfoRow label="משך שיעור" value={enrollment.lesson_duration_minutes ? `${enrollment.lesson_duration_minutes} דקות` : null} />
            <InfoRow label="בית ספר" value={enrollment.schools?.name} />
            <InfoRow label="תפקיד" value={ROLE_LABELS[enrollment.enrollment_role] ?? enrollment.enrollment_role} />
            <InfoRow label="תאריך התחלה" value={enrollment.start_date} />
            <InfoRow label="תאריך סיום" value={enrollment.end_date} />
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">סטטוס:</span>
              <Badge variant={enrollment.is_active ? "default" : "secondary"}>
                {enrollment.is_active ? "פעיל" : "לא פעיל"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <StickyNote className="h-4 w-4" />
              הערות
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add note form */}
            <div className="space-y-3 rounded-lg border border-border p-3">
              <Textarea
                placeholder="כתוב הערה חדשה..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                rows={3}
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    id="general-note"
                    checked={isGeneralNote}
                    onCheckedChange={setIsGeneralNote}
                  />
                  <Label htmlFor="general-note" className="text-sm text-muted-foreground">
                    הערה כללית (לא צמודה לרישום)
                  </Label>
                </div>
                <Button size="sm" onClick={handleAddNote} disabled={!noteContent.trim() || submitting}>
                  <Plus className="ml-1 h-4 w-4" />
                  הוסף הערה
                </Button>
              </div>
            </div>

            <Separator />

            {/* Notes list */}
            {!notes || notes.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">אין הערות עדיין</p>
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="rounded-lg border border-border p-3 space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{note.profiles?.full_name ?? "לא ידוע"}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {note.enrollment_id ? "צמוד לרישום" : "כללי"}
                        </Badge>
                        <span>{new Date(note.created_at).toLocaleDateString("he-IL")}</span>
                      </div>
                    </div>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{note.content}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <span className="text-muted-foreground">{label}: </span>
      <span className="text-foreground">{value || "—"}</span>
    </div>
  );
}

export default TeacherStudentCard;
