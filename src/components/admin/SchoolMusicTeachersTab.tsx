import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PhoneDisplay } from "@/components/PhoneDisplay";
import { Copy, Download, Mail } from "lucide-react";
import { toast } from "sonner";
import { useAcademicYear } from "@/hooks/useAcademicYear";

type Row = {
  teacherId: string;
  name: string;
  phone: string | null;
  email: string | null;
  roles: string[];
};

type SchoolBlock = { schoolId: string; schoolName: string; rows: Row[] };

const roleOrder = ["רכז", "מנצח", "מורה"];

const SchoolMusicTeachersTab = () => {
  const { selectedYearId } = useAcademicYear();

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ["sm-teachers-directory", selectedYearId],
    queryFn: async (): Promise<SchoolBlock[]> => {
      let sq = supabase
        .from("school_music_schools")
        .select("id, school_name, coordinator_teacher_id, conductor_teacher_id, is_active")
        .order("school_name");
      if (selectedYearId) sq = sq.eq("academic_year_id", selectedYearId);
      const { data: schools, error: sErr } = await sq;
      if (sErr) throw sErr;
      const schoolList = (schools ?? []) as any[];
      if (schoolList.length === 0) return [];

      const { data: classes } = await supabase
        .from("school_music_classes")
        .select("id, school_music_school_id")
        .in("school_music_school_id", schoolList.map((s) => s.id));
      const classToSchool = new Map<string, string>();
      (classes ?? []).forEach((c: any) => classToSchool.set(c.id, c.school_music_school_id));

      let groups: any[] = [];
      if ((classes ?? []).length > 0) {
        const { data } = await supabase
          .from("school_music_class_groups")
          .select("school_music_class_id, teacher_id, instruments(name)")
          .in("school_music_class_id", Array.from(classToSchool.keys()));
        groups = data ?? [];
      }

      const teacherIds = new Set<string>();
      schoolList.forEach((s) => {
        if (s.coordinator_teacher_id) teacherIds.add(s.coordinator_teacher_id);
        if (s.conductor_teacher_id) teacherIds.add(s.conductor_teacher_id);
      });
      groups.forEach((g) => g.teacher_id && teacherIds.add(g.teacher_id));
      if (teacherIds.size === 0) return schoolList.map((s) => ({ schoolId: s.id, schoolName: s.school_name, rows: [] }));

      const { data: teachers } = await supabase
        .from("teachers")
        .select("id, first_name, last_name, phone, email")
        .in("id", Array.from(teacherIds));
      const tMap = new Map<string, any>((teachers ?? []).map((t: any) => [t.id, t]));

      return schoolList.map((s) => {
        const byTeacher = new Map<string, Row>();
        const add = (id: string | null, role: string) => {
          if (!id) return;
          const t = tMap.get(id);
          if (!t) return;
          const existing = byTeacher.get(id);
          if (existing) {
            if (!existing.roles.includes(role)) existing.roles.push(role);
            return;
          }
          byTeacher.set(id, {
            teacherId: id,
            name: `${t.first_name ?? ""} ${t.last_name ?? ""}`.trim(),
            phone: t.phone ?? null,
            email: t.email ?? null,
            roles: [role],
          });
        };
        add(s.coordinator_teacher_id, "רכז");
        add(s.conductor_teacher_id, "מנצח");
        groups
          .filter((g) => classToSchool.get(g.school_music_class_id) === s.id)
          .forEach((g) => add(g.teacher_id, g.instruments?.name ? `מורה ${g.instruments.name}` : "מורה"));

        const rows = Array.from(byTeacher.values()).sort((a, b) => {
          const ra = roleOrder.findIndex((r) => a.roles[0]?.startsWith(r));
          const rb = roleOrder.findIndex((r) => b.roles[0]?.startsWith(r));
          if (ra !== rb) return (ra < 0 ? 99 : ra) - (rb < 0 ? 99 : rb);
          return a.name.localeCompare(b.name, "he");
        });
        return { schoolId: s.id, schoolName: s.school_name, rows };
      });
    },
  });

  const totalTeachers = useMemo(() => {
    const ids = new Set<string>();
    blocks.forEach((b) => b.rows.forEach((r) => ids.add(r.teacherId)));
    return ids.size;
  }, [blocks]);

  const buildText = () =>
    blocks
      .filter((b) => b.rows.length > 0)
      .map(
        (b) =>
          `*${b.schoolName}*\n` +
          b.rows
            .map((r) => `${r.name} (${r.roles.join(", ")}) — ${r.phone || "ללא טלפון"}${r.email ? ` — ${r.email}` : ""}`)
            .join("\n"),
      )
      .join("\n\n");

  const copyList = async () => {
    const text = buildText();
    if (!text) return toast.error("אין נתונים להעתקה");
    await navigator.clipboard.writeText(text);
    toast.success("הרשימה הועתקה");
  };

  const downloadCsv = () => {
    const lines = [["בית ספר", "מורה", "תפקיד", "טלפון", "אימייל"]];
    blocks.forEach((b) =>
      b.rows.forEach((r) => lines.push([b.schoolName, r.name, r.roles.join(" / "), r.phone || "", r.email || ""])),
    );
    if (lines.length === 1) return toast.error("אין נתונים לייצוא");
    const csv = "\uFEFF" + lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `מורי-בתי-ספר-מנגנים-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyEmails = async () => {
    const emails = Array.from(
      new Set(blocks.flatMap((b) => b.rows.map((r) => r.email).filter(Boolean) as string[])),
    );
    if (emails.length === 0) return toast.error("אין כתובות מייל");
    await navigator.clipboard.writeText(emails.join(", "));
    toast.success(`הועתקו ${emails.length} כתובות מייל`);
  };

  if (isLoading) return <p className="text-center text-muted-foreground py-8">טוען...</p>;

  return (
    <div dir="rtl">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" className="h-11 rounded-xl" onClick={copyList}>
          <Copy className="h-4 w-4" /> העתק רשימה לשליחה
        </Button>
        <Button variant="outline" className="h-11 rounded-xl" onClick={copyEmails}>
          <Mail className="h-4 w-4" /> העתק כתובות מייל
        </Button>
        <Button variant="outline" className="h-11 rounded-xl" onClick={downloadCsv}>
          <Download className="h-4 w-4" /> ייצוא לאקסל
        </Button>
        <span className="text-sm text-muted-foreground">{totalTeachers} מורים</span>
      </div>

      {blocks.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">לא נמצאו בתי ספר מנגנים</p>
      ) : (
        <div className="space-y-4">
          {blocks.map((b) => (
            <div key={b.schoolId} className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <div className="flex items-center justify-between bg-accent/50 px-4 py-3">
                <p className="font-semibold text-foreground">{b.schoolName}</p>
                <span className="text-xs text-muted-foreground">{b.rows.length} מורים</span>
              </div>
              {b.rows.length === 0 ? (
                <p className="px-4 py-3 text-sm text-muted-foreground">לא שובצו מורים</p>
              ) : (
                <div className="divide-y divide-border">
                  {b.rows.map((r) => (
                    <div key={r.teacherId} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-foreground">{r.name}</span>
                        {r.roles.map((role) => (
                          <Badge key={role} variant="outline" className="rounded-lg text-xs">{role}</Badge>
                        ))}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        {r.phone ? <PhoneDisplay phone={r.phone} textClassName="text-sm" /> : <span>ללא טלפון</span>}
                        {r.email && (
                          <a href={`mailto:${r.email}`} dir="ltr" className="text-primary hover:underline">
                            {r.email}
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SchoolMusicTeachersTab;
