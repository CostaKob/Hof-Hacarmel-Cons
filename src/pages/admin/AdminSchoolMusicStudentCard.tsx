import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import { Badge } from "@/components/ui/badge";
import StudentInstrumentLoansSection from "@/components/admin/StudentInstrumentLoansSection";
import PhoneDisplay from "@/components/PhoneDisplay";
import { User, GraduationCap, MapPin, Music } from "lucide-react";

const Row = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-3 py-1.5">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium text-foreground text-left">{value || "—"}</span>
  </div>
);

const AdminSchoolMusicStudentCard = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();

  const { data: student, isLoading } = useQuery({
    queryKey: ["school-music-student", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("school_music_students")
        .select(`
          *,
          school_music_schools(id, school_name),
          instruments(name)
        `)
        .eq("id", studentId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: activeLoan } = useQuery({
    queryKey: ["school-music-student-active-loan", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instrument_loans")
        .select("id, loan_date, inventory_instruments(serial_number, brand, model, size, instruments(name))")
        .eq("school_music_student_id", studentId!)
        .is("return_date", null)
        .order("loan_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  if (isLoading) {
    return (
      <AdminLayout title="כרטיס תלמיד" backPath="/admin/school-music-schools">
        <p className="text-muted-foreground">טוען...</p>
      </AdminLayout>
    );
  }

  if (!student) {
    return (
      <AdminLayout title="כרטיס תלמיד" backPath="/admin/school-music-schools">
        <p className="text-muted-foreground">תלמיד לא נמצא</p>
      </AdminLayout>
    );
  }

  const fullName = `${student.student_first_name} ${student.student_last_name}`;

  return (
    <AdminLayout
      title={fullName}
      backPath={student.school_music_schools?.id
        ? `/admin/school-music-schools/${student.school_music_schools.id}`
        : "/admin/school-music-schools"}
    >
      <div className="space-y-4 max-w-2xl">
        {/* Header card */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-2">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
                <User className="h-5 w-5" />
                {fullName}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {student.school_music_schools?.school_name && (
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/school-music-schools/${student.school_music_schools.id}`)}
                    className="underline hover:text-primary"
                  >
                    {student.school_music_schools.school_name}
                  </button>
                )}
                {student.class_name && <Badge variant="outline">{student.class_name}</Badge>}
                {student.instruments?.name && (
                  <Badge variant="outline" className="gap-1">
                    <Music className="h-3 w-3" /> {student.instruments.name}
                  </Badge>
                )}
              </div>
            </div>
            <Badge>{({ new: "חדש", in_review: "בטיפול", assigned: "שויך", inactive: "לא פעיל" } as Record<string, string>)[student.status] ?? student.status}</Badge>
          </div>
        </div>

        {/* Student details */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-1">
          <h2 className="font-semibold text-foreground text-base mb-2 flex items-center gap-2">
            <GraduationCap className="h-4 w-4" /> פרטי תלמיד
          </h2>
          <Row label="ת.ז." value={<span dir="ltr" className="font-mono">{student.student_national_id}</span>} />
          <Row label="מין" value={student.gender === "male" ? "זכר" : student.gender === "female" ? "נקבה" : student.gender || "—"} />
          <Row label="עיר" value={student.city} />
        </div>

        {/* Assigned instrument */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-1">
          <h2 className="font-semibold text-foreground text-base mb-2 flex items-center gap-2">
            <Music className="h-4 w-4" /> כלי משויך
          </h2>
          {activeLoan?.inventory_instruments ? (
            <>
              <Row label="כלי" value={activeLoan.inventory_instruments.instruments?.name} />
              <Row label="מס׳ סידורי" value={<span dir="ltr" className="font-mono">{activeLoan.inventory_instruments.serial_number}</span>} />
              <Row label="יצרן/דגם" value={[activeLoan.inventory_instruments.brand, activeLoan.inventory_instruments.model].filter(Boolean).join(" / ") || "—"} />
              {activeLoan.inventory_instruments.size && <Row label="גודל" value={activeLoan.inventory_instruments.size} />}
              <Row label="תאריך השאלה" value={activeLoan.loan_date} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">לא משויך כלי כרגע. ניתן לשייך דרך מודול ההשאלה למטה.</p>
          )}
        </div>

        {/* Parent details */}
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-1">
          <h2 className="font-semibold text-foreground text-base mb-2 flex items-center gap-2">
            <MapPin className="h-4 w-4" /> פרטי הורה
          </h2>
          <Row label="שם" value={student.parent_name} />
          <Row label="ת.ז." value={<span dir="ltr" className="font-mono">{student.parent_national_id}</span>} />
          <Row label="טלפון" value={student.parent_phone ? <PhoneDisplay phone={student.parent_phone} /> : "—"} />
          <Row label="אימייל" value={student.parent_email && <span dir="ltr">{student.parent_email}</span>} />
        </div>

        {/* Instrument loans */}
        <StudentInstrumentLoansSection studentType="school_music" studentId={studentId!} />
      </div>
    </AdminLayout>
  );
};

export default AdminSchoolMusicStudentCard;
