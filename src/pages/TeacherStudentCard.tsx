import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useTeacherProfile, useEnrollmentDetails, useStudentNotes } from "@/hooks/useTeacherData";
import { useEnrollmentReportLines } from "@/hooks/useEnrollmentReportLines";
import EnrollmentSummary from "@/components/teacher/EnrollmentSummary";
import EnrollmentHistory from "@/components/teacher/EnrollmentHistory";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowRight, StickyNote, Plus, User, Phone, Mail, MapPin, Music, School, Calendar } from "lucide-react";
import { toast } from "sonner";

const TeacherStudentCard = () => {
  const { enrollmentId } = useParams<{ enrollmentId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: teacher } = useTeacherProfile();
  const { data: enrollment, isLoading } = useEnrollmentDetails(enrollmentId);
  const { data: notes } = useStudentNotes(enrollment?.student_id, teacher?.id);
  const { data: reportLines, isLoading: linesLoading } = useEnrollmentReportLines(enrollmentId);

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
      {/* Header with student name */}
      <header className="bg-primary px-5 pb-8 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-primary-foreground hover:bg-primary-foreground/10"
            onClick={() => navigate("/teacher/students")}
          >
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">{student.first_name} {student.last_name}</h1>
            <p className="text-sm opacity-80">כרטיס תלמיד</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-4 pb-8 space-y-4">
        {/* Student info card */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            פרטי תלמיד
          </h2>
          <div className="grid grid-cols-1 gap-3 text-sm">
            <InfoRow icon={User} label="שם מלא" value={`${student.first_name} ${student.last_name}`} />
            <InfoRow icon={Calendar} label="תאריך לידה" value={student.date_of_birth} />
            <InfoRow icon={MapPin} label="עיר" value={student.city} />
            {student.national_id && <InfoRow icon={User} label="ת.ז." value={student.national_id} />}
          </div>
        </div>

        {/* Parent info */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground">פרטי הורים</h2>
          <div className="grid grid-cols-1 gap-3 text-sm">
            {student.parent_name && <InfoRow icon={User} label="הורה 1" value={student.parent_name} />}
            {student.parent_phone && (
              <a href={`tel:${student.parent_phone}`} className="flex items-center gap-2 text-primary">
                <Phone className="h-4 w-4" />
                <span>{student.parent_phone}</span>
              </a>
            )}
            {student.parent_email && (
              <a href={`mailto:${student.parent_email}`} className="flex items-center gap-2 text-primary">
                <Mail className="h-4 w-4" />
                <span className="truncate">{student.parent_email}</span>
              </a>
            )}
            {student.parent_name_2 && (
              <>
                <div className="border-t border-border pt-3" />
                <InfoRow icon={User} label="הורה 2" value={student.parent_name_2} />
                {student.parent_phone_2 && (
                  <a href={`tel:${student.parent_phone_2}`} className="flex items-center gap-2 text-primary">
                    <Phone className="h-4 w-4" />
                    <span>{student.parent_phone_2}</span>
                  </a>
                )}
                {student.parent_email_2 && (
                  <a href={`mailto:${student.parent_email_2}`} className="flex items-center gap-2 text-primary">
                    <Mail className="h-4 w-4" />
                    <span className="truncate">{student.parent_email_2}</span>
                  </a>
                )}
              </>
            )}
          </div>
        </div>

        {/* Enrollment details */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground">פרטי רישום</h2>
          <div className="grid grid-cols-1 gap-3 text-sm">
            <InfoRow icon={Music} label="כלי" value={enrollment.instruments?.name} />
            <InfoRow icon={Calendar} label="משך שיעור" value={enrollment.lesson_duration_minutes ? `${enrollment.lesson_duration_minutes} דקות` : null} />
            <InfoRow icon={School} label="בית ספר" value={enrollment.schools?.name} />
            <InfoRow icon={Calendar} label="תאריך התחלה" value={enrollment.start_date} />
            {enrollment.end_date && <InfoRow icon={Calendar} label="תאריך סיום" value={enrollment.end_date} />}
            <div className="flex items-center gap-2 pt-1">
              <Badge variant={enrollment.is_active ? "default" : "secondary"} className="rounded-lg">
                {enrollment.is_active ? "פעיל" : "לא פעיל"}
              </Badge>
            </div>
          </div>
        </div>

        {/* Enrollment summary counts */}
        <EnrollmentSummary lines={reportLines ?? []} />

        {/* Lesson history */}
        <EnrollmentHistory lines={(reportLines ?? []) as any} isLoading={linesLoading} />

        {/* Notes */}
        <div className="rounded-2xl bg-card p-5 shadow-sm border border-border space-y-4">
          <h2 className="font-semibold text-foreground flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" />
            הערות
          </h2>

          {/* Add note */}
          <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
            <Textarea
              placeholder="כתוב הערה חדשה..."
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              rows={3}
              className="bg-card rounded-xl text-base"
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="general-note"
                  checked={isGeneralNote}
                  onCheckedChange={setIsGeneralNote}
                />
                <Label htmlFor="general-note" className="text-sm text-muted-foreground">
                  הערה כללית
                </Label>
              </div>
              <Button
                size="sm"
                className="rounded-xl h-10 px-4"
                onClick={handleAddNote}
                disabled={!noteContent.trim() || submitting}
              >
                <Plus className="ml-1 h-4 w-4" />
                הוסף
              </Button>
            </div>
          </div>

          {/* Notes list */}
          {!notes || notes.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-4">אין הערות עדיין</p>
          ) : (
            <div className="space-y-3">
              {notes.map((note) => (
                <div key={note.id} className="rounded-xl border border-border p-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{note.profiles?.full_name ?? "לא ידוע"}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs rounded-lg">
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
        </div>
      </main>
    </div>
  );
};

function InfoRow({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-center gap-2">
      {Icon && <Icon className="h-4 w-4 text-muted-foreground shrink-0" />}
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground">{value || "—"}</span>
    </div>
  );
}

export default TeacherStudentCard;
