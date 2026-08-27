import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import RichTextEditor from "@/components/admin/RichTextEditor";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import MultiSelectFilter from "@/components/MultiSelectFilter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Send, Users, Mail, Loader2, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";


type Source = "registrations" | "enrollments" | "school_music" | "both" | "unregistered_students";

const SOURCE_LABELS: Record<Source, string> = {
  registrations: "הורים שנרשמו (טופס הרשמה)",
  enrollments: "תלמידים פרטניים",
  school_music: "בית ספר מנגן",
  both: "פרטניים + בית ספר מנגן",
  unregistered_students: "תלמידים שלא נרשמו לשנה הנוכחית",
};

const FILTERABLE: Source[] = ["enrollments", "school_music", "both"];


interface Recipient {
  email: string;
  parentName: string;
  studentName: string;
  siblingCount?: number;
}

interface RecipientRow extends Recipient {
  grade?: string | null;
  schoolKey?: string | null;
  teacherIds: string[];
  ensembleIds: string[];
}


const firstNameOf = (full: string) => (full || "").trim().split(/\s+/)[0] || "";

const TOKENS: { key: string; label: string; sample: string; get: (r: { parentName: string; studentName: string }) => string }[] = [
  { key: "{{שם_הורה}}", label: "שם הורה (פרטי)", sample: "דנה", get: (r) => firstNameOf(r.parentName) },
  { key: "{{שם_הורה_מלא}}", label: "שם הורה מלא", sample: "דנה כהן", get: (r) => r.parentName || "" },
  { key: "{{שם_תלמיד}}", label: "שם תלמיד (פרטי)", sample: "נועם", get: (r) => firstNameOf(r.studentName) },
  { key: "{{שם_תלמיד_מלא}}", label: "שם תלמיד מלא", sample: "נועם כהן", get: (r) => r.studentName || "" },
];

const renderTemplate = (text: string, r: { parentName: string; studentName: string }) => {
  let out = text;
  for (const t of TOKENS) out = out.split(t.key).join(t.get(r));
  return out;
};

const stripHtml = (html: string) => {
  if (typeof window === "undefined") return html;
  const div = document.createElement("div");
  div.innerHTML = html;
  return (div.textContent || div.innerText || "").trim();
};

const AdminBulkMessage = () => {
  const { selectedYearId, years } = useAcademicYear();
  const location = useLocation();
  const duplicated = (location.state as any)?.duplicate as
    | { subject?: string; body?: string; audience?: Source }
    | undefined;
  const [source, setSource] = useState<Source>(duplicated?.audience ?? "registrations");

  const [regStatus, setRegStatus] = useState<string>("all");
  const [subject, setSubject] = useState<string>(() => {
    if (duplicated?.subject) return duplicated.subject;
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("bulk-message-subject") ?? "";
  });
  const [body, setBody] = useState<string>(() => {
    if (duplicated?.body) return duplicated.body;
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("bulk-message-body") ?? "";
  });
  const editorHostRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [siblingsOnly, setSiblingsOnly] = useState(false);
  const [manualEntries, setManualEntries] = useState<Recipient[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("bulk-message-manual-entries");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
      const legacy = window.localStorage.getItem("bulk-message-manual-emails");
      if (legacy) {
        return legacy
          .split(/[\s,;]+/)
          .map((s) => s.trim().toLowerCase())
          .filter((e) => /^\S+@\S+\.\S+$/.test(e))
          .map((email) => ({ email, parentName: "", studentName: "" }));
      }
    } catch {}
    return [];
  });
  useEffect(() => {
    try { window.localStorage.setItem("bulk-message-manual-entries", JSON.stringify(manualEntries)); } catch {}
  }, [manualEntries]);
  const manualRecipients = useMemo<Recipient[]>(() => {
    const seen = new Set<string>();
    const out: Recipient[] = [];
    for (const r of manualEntries) {
      const email = (r.email || "").trim().toLowerCase();
      if (!/^\S+@\S+\.\S+$/.test(email)) continue;
      if (seen.has(email)) continue;
      seen.add(email);
      out.push({ email, parentName: (r.parentName || "").trim(), studentName: (r.studentName || "").trim() });
    }
    return out;
  }, [manualEntries]);
  const updateManualEntry = (idx: number, patch: Partial<Recipient>) => {
    setManualEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  };
  const addManualEntry = () => setManualEntries((prev) => [...prev, { email: "", parentName: "", studentName: "" }]);
  const addFoundRecipients = (found: Recipient[]) => {
    let added = 0;
    setManualEntries((prev) => {
      const existing = new Set(prev.map((e) => (e.email || "").trim().toLowerCase()));
      const next = [...prev];
      for (const r of found) {
        const email = (r.email || "").trim().toLowerCase();
        if (!email || existing.has(email)) continue;
        existing.add(email);
        next.push({ email, parentName: r.parentName, studentName: r.studentName });
        added++;
      }
      return next;
    });
    setTimeout(() => {
      if (added > 0) toast.success(`נוספו ${added} נמענים`);
      else toast.info("כל הנמענים כבר ברשימה");
    }, 0);
  };
  const removeManualEntry = (idx: number) => setManualEntries((prev) => prev.filter((_, i) => i !== idx));
  const [previewOpen, setPreviewOpen] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: number } | null>(null);
  const [testEmail, setTestEmail] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("bulk-message-test-email") ?? "";
  });
  const [sendingTest, setSendingTest] = useState(false);

  useEffect(() => {
    try { window.localStorage.setItem("bulk-message-subject", subject); } catch {}
  }, [subject]);
  useEffect(() => {
    try { window.localStorage.setItem("bulk-message-body", body); } catch {}
  }, [body]);
  useEffect(() => {
    try { window.localStorage.setItem("bulk-message-test-email", testEmail); } catch {}
  }, [testEmail]);

  const clearDraft = () => {
    setSubject("");
    setBody("");
    try {
      window.localStorage.removeItem("bulk-message-subject");
      window.localStorage.removeItem("bulk-message-body");
    } catch {}
    toast.success("הטיוטה נוקתה");
  };


  const handleSendTest = async () => {
    const email = testEmail.trim().toLowerCase();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      toast.error("יש להזין כתובת מייל תקינה");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.error("יש למלא נושא ותוכן לפני שליחת בדיקה");
      return;
    }
    setSendingTest(true);
    try {
      const { error } = await supabase.functions.invoke("send-transactional-email", {
        body: {
          templateName: "broadcast-message",
          recipientEmail: email,
          replyTo: "musichof@gmail.com",
          idempotencyKey: `broadcast-test-${Date.now()}-${email}`,
          templateData: {
            subject: `[בדיקה] ${renderTemplate(subject.trim(), { parentName: "דנה כהן", studentName: "נועם כהן" })}`,
            bodyHtml: renderTemplate(body, { parentName: "דנה כהן", studentName: "נועם כהן" }),
            body: renderTemplate(stripHtml(body), { parentName: "דנה כהן", studentName: "נועם כהן" }),
            parentName: "דנה כהן",
          },
        },
      });
      if (error) throw error;
      toast.success(`מייל בדיקה נשלח אל ${email}`);
    } catch (e: any) {
      console.error("test send failed", e);
      toast.error(`שליחת הבדיקה נכשלה: ${e?.message ?? e}`);
    } finally {
      setSendingTest(false);
    }
  };

  const yearName = years?.find((y) => y.id === selectedYearId)?.name;

  // Label maps for the filters (branches, school-music schools, ensembles, teachers)
  const { data: filterMeta } = useQuery({
    queryKey: ["bulk-filter-meta", selectedYearId],
    enabled: !!selectedYearId,
    queryFn: async () => {
      const [schools, smSchools, ensembles, teachers] = await Promise.all([
        supabase.from("schools").select("id, name"),
        supabase.from("school_music_schools").select("id, school_name").eq("academic_year_id", selectedYearId!),
        supabase.from("ensembles").select("id, name").eq("academic_year_id", selectedYearId!),
        supabase.from("teachers").select("id, first_name, last_name").eq("is_active", true),
      ]);
      const schoolLabels: Record<string, string> = {};
      for (const s of schools.data ?? []) schoolLabels[`branch:${s.id}`] = `שלוחה — ${s.name}`;
      for (const s of smSchools.data ?? []) schoolLabels[`sm:${s.id}`] = `בי״ס מנגן — ${s.school_name}`;
      const ensembleLabels: Record<string, string> = {};
      for (const e of ensembles.data ?? []) ensembleLabels[e.id] = e.name;
      const teacherLabels: Record<string, string> = {};
      for (const t of teachers.data ?? []) teacherLabels[t.id] = `${t.first_name} ${t.last_name}`.trim();
      return { schoolLabels, ensembleLabels, teacherLabels };
    },
  });

  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["bulk-recipients", source, selectedYearId, regStatus],
    enabled: !!selectedYearId,
    queryFn: async (): Promise<RecipientRow[]> => {
      const empty = { grade: null, schoolKey: null, teacherIds: [] as string[], ensembleIds: [] as string[] };
      if (source === "registrations") {
        let q = supabase
          .from("registrations")
          .select("parent_email, parent_name, student_first_name, student_last_name, status")
          .eq("academic_year_id", selectedYearId!);
        if (regStatus !== "all") q = q.eq("status", regStatus as any);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? [])
          .filter((r: any) => r.parent_email)
          .map((r: any) => ({
            ...empty,
            email: String(r.parent_email).trim().toLowerCase(),
            parentName: r.parent_name ?? "",
            studentName: `${r.student_first_name ?? ""} ${r.student_last_name ?? ""}`.trim(),
          }));
      }

      if (source === "enrollments" || source === "school_music" || source === "both") {
        const rows: RecipientRow[] = [];

        if (source !== "school_music") {
          const [{ data: enr, error }, { data: yearEnsembles }] = await Promise.all([
            supabase
              .from("enrollments")
              .select(
                "student_id, school_id, teacher_id, students!inner(parent_email, parent_name, parent_email_2, parent_name_2, first_name, last_name, grade)",
              )
              .eq("academic_year_id", selectedYearId!)
              .eq("is_active", true),
            supabase.from("ensembles").select("id").eq("academic_year_id", selectedYearId!),
          ]);
          if (error) throw error;

          const ensembleIds = (yearEnsembles ?? []).map((e: any) => e.id);
          const studentEnsembles = new Map<string, string[]>();
          if (ensembleIds.length > 0) {
            const { data: es } = await supabase
              .from("ensemble_students")
              .select("ensemble_id, student_id")
              .in("ensemble_id", ensembleIds);
            for (const row of (es as any[]) ?? []) {
              const list = studentEnsembles.get(row.student_id) ?? [];
              list.push(row.ensemble_id);
              studentEnsembles.set(row.student_id, list);
            }
          }

          for (const e of (enr as any[]) ?? []) {
            const s = e.students;
            const name = `${s?.first_name ?? ""} ${s?.last_name ?? ""}`.trim();
            const meta = {
              grade: s?.grade ?? null,
              schoolKey: e.school_id ? `branch:${e.school_id}` : null,
              teacherIds: e.teacher_id ? [e.teacher_id] : [],
              ensembleIds: studentEnsembles.get(e.student_id) ?? [],
            };
            if (s?.parent_email)
              rows.push({ ...meta, email: String(s.parent_email).trim().toLowerCase(), parentName: s.parent_name ?? "", studentName: name });
            if (s?.parent_email_2)
              rows.push({ ...meta, email: String(s.parent_email_2).trim().toLowerCase(), parentName: s.parent_name_2 ?? "", studentName: name });
          }
        }

        if (source !== "enrollments") {
          const [{ data: sm, error }, { data: groups }] = await Promise.all([
            supabase
              .from("school_music_students")
              .select(
                "parent_email, parent_name, student_first_name, student_last_name, class_name, school_music_school_id, school_music_class_group_id",
              )
              .eq("academic_year_id", selectedYearId!),
            supabase.from("school_music_class_groups").select("id, teacher_id"),
          ]);
          if (error) throw error;
          const groupTeacher = new Map<string, string>();
          for (const g of (groups as any[]) ?? []) if (g.teacher_id) groupTeacher.set(g.id, g.teacher_id);

          for (const r of (sm as any[]) ?? []) {
            if (!r.parent_email) continue;
            const teacherId = r.school_music_class_group_id ? groupTeacher.get(r.school_music_class_group_id) : undefined;
            rows.push({
              email: String(r.parent_email).trim().toLowerCase(),
              parentName: r.parent_name ?? "",
              studentName: `${r.student_first_name ?? ""} ${r.student_last_name ?? ""}`.trim(),
              grade: r.class_name ?? null,
              schoolKey: r.school_music_school_id ? `sm:${r.school_music_school_id}` : null,
              teacherIds: teacherId ? [teacherId] : [],
              ensembleIds: [],
            });
          }
        }

        return rows;
      }

      // unregistered_students: active students with no registration and no active enrollment for the selected year
      const [{ data: allStudents, error: studentsError }, { data: registered, error: regError }, { data: enrolled, error: enrError }] = await Promise.all([
        supabase
          .from("students")
          .select("id, national_id, parent_email, parent_name, parent_email_2, parent_name_2, first_name, last_name, grade")
          .eq("is_active", true),
        supabase
          .from("registrations")
          .select("student_national_id")
          .eq("academic_year_id", selectedYearId!)
          .not("student_national_id", "is", null),
        supabase
          .from("enrollments")
          .select("student_id")
          .eq("academic_year_id", selectedYearId!)
          .eq("is_active", true),
      ]);
      if (studentsError) throw studentsError;
      if (regError) throw regError;
      if (enrError) throw enrError;

      const registeredIds = new Set((registered ?? []).map((r: any) => String(r.student_national_id).trim()));
      const enrolledStudentIds = new Set((enrolled ?? []).map((e: any) => e.student_id));

      const rows: RecipientRow[] = [];
      for (const s of (allStudents as any[]) ?? []) {
        const nid = s.national_id ? String(s.national_id).trim() : "";
        if (nid && registeredIds.has(nid)) continue;
        if (enrolledStudentIds.has(s.id)) continue;
        const name = `${s?.first_name ?? ""} ${s?.last_name ?? ""}`.trim();
        const meta = { ...empty, grade: s.grade ?? null };
        if (s?.parent_email) rows.push({ ...meta, email: String(s.parent_email).trim().toLowerCase(), parentName: s.parent_name ?? "", studentName: name });
        if (s?.parent_email_2) rows.push({ ...meta, email: String(s.parent_email_2).trim().toLowerCase(), parentName: s.parent_name_2 ?? "", studentName: name });
      }
      return rows;
    },
  });

  // ---- Audience filters ----
  const [gradeFilter, setGradeFilter] = useState<string[]>([]);
  const [schoolFilter, setSchoolFilter] = useState<string[]>([]);
  const [ensembleFilter, setEnsembleFilter] = useState<string[]>([]);
  const [teacherFilter, setTeacherFilter] = useState<string[]>([]);

  const resetFilters = () => {
    setGradeFilter([]);
    setSchoolFilter([]);
    setEnsembleFilter([]);
    setTeacherFilter([]);
  };

  const filterOptions = useMemo(() => {
    const grades = new Set<string>();
    const schools = new Set<string>();
    const ensembles = new Set<string>();
    const teachers = new Set<string>();
    for (const r of recipients) {
      if (r.grade) grades.add(r.grade);
      if (r.schoolKey) schools.add(r.schoolKey);
      for (const e of r.ensembleIds) ensembles.add(e);
      for (const t of r.teacherIds) teachers.add(t);
    }
    const he = (a: string, b: string) => a.localeCompare(b, "he");
    return {
      grades: Array.from(grades).sort(he),
      schools: Array.from(schools).sort((a, b) =>
        he(filterMeta?.schoolLabels[a] ?? a, filterMeta?.schoolLabels[b] ?? b),
      ),
      ensembles: Array.from(ensembles).sort((a, b) =>
        he(filterMeta?.ensembleLabels[a] ?? a, filterMeta?.ensembleLabels[b] ?? b),
      ),
      teachers: Array.from(teachers).sort((a, b) =>
        he(filterMeta?.teacherLabels[a] ?? a, filterMeta?.teacherLabels[b] ?? b),
      ),
    };
  }, [recipients, filterMeta]);

  const filteredRows = useMemo(() => {
    if (!FILTERABLE.includes(source)) return recipients;
    return recipients.filter((r) => {
      if (gradeFilter.length > 0 && !(r.grade && gradeFilter.includes(r.grade))) return false;
      if (schoolFilter.length > 0 && !(r.schoolKey && schoolFilter.includes(r.schoolKey))) return false;
      if (ensembleFilter.length > 0 && !r.ensembleIds.some((e) => ensembleFilter.includes(e))) return false;
      if (teacherFilter.length > 0 && !r.teacherIds.some((t) => teacherFilter.includes(t))) return false;
      return true;
    });
  }, [recipients, source, gradeFilter, schoolFilter, ensembleFilter, teacherFilter]);


  const uniqueRecipients = useMemo(() => {
    // Group by email but merge sibling student names so one message per
    // parent-email covers all their children (e.g. "אדוה ויערה טויטו").
    const map = new Map<string, { email: string; parentName: string; studentNames: string[] }>();
    const addAll = (list: Recipient[]) => {
      for (const r of list) {
        if (!r.email) continue;
        const existing = map.get(r.email);
        if (!existing) {
          map.set(r.email, {
            email: r.email,
            parentName: r.parentName || "",
            studentNames: r.studentName ? [r.studentName] : [],
          });
        } else {
          if (!existing.parentName && r.parentName) existing.parentName = r.parentName;
          if (r.studentName && !existing.studentNames.includes(r.studentName)) {
            existing.studentNames.push(r.studentName);
          }
        }
      }
    };
    addAll(filteredRows);
    addAll(manualRecipients);

    const joinHe = (names: string[]) => {
      if (names.length === 0) return "";
      if (names.length === 1) return names[0];
      const firsts = names.map((n) => firstNameOf(n));
      const lastName = names[0].trim().split(/\s+/).slice(1).join(" ");
      const joined = firsts.slice(0, -1).join(", ") + " ו" + firsts[firsts.length - 1];
      return lastName ? `${joined} ${lastName}` : joined;
    };

    return Array.from(map.values())
      .map<Recipient>((g) => ({
        email: g.email,
        parentName: g.parentName,
        studentName: joinHe(g.studentNames),
        siblingCount: g.studentNames.length,
      }))
      .sort((a, b) => a.parentName.localeCompare(b.parentName, "he"));
  }, [filteredRows, manualRecipients]);

  // Default: all selected
  const allSelectedInitial = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const r of uniqueRecipients) map[r.email] = true;
    return map;
  }, [uniqueRecipients]);

  const effectiveSelected = Object.keys(selected).length === 0 ? allSelectedInitial : selected;
  const selectedEmails = uniqueRecipients.filter((r) => effectiveSelected[r.email]);
  const allChecked = selectedEmails.length === uniqueRecipients.length && uniqueRecipients.length > 0;

  const filteredRecipients = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = uniqueRecipients;
    if (siblingsOnly) list = list.filter((r) => (r.siblingCount ?? 0) > 1);
    if (!q) return list;
    return list.filter(
      (r) =>
        r.parentName.toLowerCase().includes(q) ||
        r.studentName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q),
    );
  }, [uniqueRecipients, search, siblingsOnly]);

  const allFilteredChecked =
    filteredRecipients.length > 0 &&
    filteredRecipients.every((r) => effectiveSelected[r.email]);

  const toggleAll = () => {
    const base = Object.keys(selected).length === 0 ? { ...allSelectedInitial } : { ...selected };
    const target = !allFilteredChecked;
    for (const r of filteredRecipients) base[r.email] = target;
    setSelected(base);
  };


  const toggleOne = (email: string) => {
    setSelected((prev) => {
      const base = Object.keys(prev).length === 0 ? allSelectedInitial : prev;
      return { ...base, [email]: !base[email] };
    });
  };

  const canSend = subject.trim().length > 0 && stripHtml(body).length > 0 && selectedEmails.length > 0;

  const handleSend = async () => {
    setSending(true);
    setProgress({ done: 0, total: selectedEmails.length, failed: 0 });
    const stamp = Date.now();
    let done = 0;
    let failed = 0;
    const CONCURRENCY = 4;
    const queue = [...selectedEmails];

    const worker = async () => {
      while (queue.length > 0) {
        const r = queue.shift();
        if (!r) break;
        try {
          const { error } = await supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "broadcast-message",
              recipientEmail: r.email,
              replyTo: "musichof@gmail.com",
              idempotencyKey: `broadcast-${stamp}-${r.email}`,
              templateData: {
                subject: renderTemplate(subject.trim(), r),
                bodyHtml: renderTemplate(body, r),
                body: renderTemplate(stripHtml(body), r),
                parentName: r.parentName || "",
              },
            },
          });
          if (error) throw error;
        } catch (e) {
          console.error("broadcast send failed", r.email, e);
          failed += 1;
        }
        done += 1;
        setProgress({ done, total: selectedEmails.length, failed });
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, selectedEmails.length) }, worker));
    setSending(false);

    // Archive the broadcast
    try {
      const { data: auth } = await supabase.auth.getUser();
      await supabase.from("broadcast_messages").insert({
        subject: subject.trim(),
        body_html: body,
        audience: source,
        audience_label: SOURCE_LABELS[source],
        academic_year_id: selectedYearId,
        recipients_count: done,
        failed_count: failed,
        recipients: selectedEmails.map((r) => ({
          email: r.email,
          parentName: r.parentName,
          studentName: r.studentName,
        })) as any,
        sent_by: auth?.user?.id ?? null,
        sent_by_name: auth?.user?.email ?? null,
      });
    } catch (e) {
      console.error("archive broadcast failed", e);
    }

    if (failed === 0) {
      toast.success(`נשלחו ${done} הודעות בהצלחה`);
    } else {
      toast.warning(`נשלחו ${done - failed} הודעות. ${failed} נכשלו — ראה קונסול.`);
    }
  };


  return (
    <AdminLayout title="שליחת הודעות להורים" backPath="/admin">
      <PageTitle title="שליחת הודעות להורים" />
      <div className="max-w-4xl space-y-4">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">הודעת מייל להורים</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">קהל יעד</Label>
              <Select value={source} onValueChange={(v) => { setSource(v as Source); setSelected({}); resetFilters(); }}>
                <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="enrollments">תלמידים פרטניים</SelectItem>
                  <SelectItem value="school_music">בית ספר מנגן</SelectItem>
                  <SelectItem value="both">פרטניים + בית ספר מנגן</SelectItem>
                  <SelectItem value="registrations">הורים שנרשמו (טופס הרשמה)</SelectItem>
                  <SelectItem value="unregistered_students">תלמידים שלא נרשמו לשנה הנוכחית</SelectItem>
                </SelectContent>
              </Select>
              {yearName && <p className="text-xs text-muted-foreground">שנה נבחרת: {yearName}</p>}
            </div>
            {source === "registrations" && (
              <div className="space-y-1">
                <Label className="text-xs">סטטוס הרשמה</Label>
                <Select value={regStatus} onValueChange={setRegStatus}>
                  <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכול</SelectItem>
                    <SelectItem value="new">חדש</SelectItem>
                    <SelectItem value="in_review">בטיפול</SelectItem>
                    <SelectItem value="waiting_for_call">ממתין לשיחה</SelectItem>
                    <SelectItem value="waiting_for_payment">ממתין לתשלום</SelectItem>
                    <SelectItem value="ready_to_assign">מוכן לשיבוץ</SelectItem>
                    <SelectItem value="partially_converted">שובץ חלקית</SelectItem>
                    <SelectItem value="converted">שובץ</SelectItem>
                    <SelectItem value="rejected">נדחה</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {FILTERABLE.includes(source) && (
            <div className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs">סינון מתקדם (ריק = הכול)</Label>
                {(gradeFilter.length || schoolFilter.length || ensembleFilter.length || teacherFilter.length) > 0 && (
                  <Button type="button" variant="ghost" size="sm" className="h-7 rounded-lg text-xs" onClick={resetFilters}>
                    נקה סינון
                  </Button>
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <MultiSelectFilter
                  options={filterOptions.grades}
                  value={gradeFilter}
                  onChange={(v) => { setGradeFilter(v); setSelected({}); }}
                  allLabel="כל הכיתות"
                  className="w-full"
                />
                <MultiSelectFilter
                  options={filterOptions.schools}
                  value={schoolFilter}
                  onChange={(v) => { setSchoolFilter(v); setSelected({}); }}
                  allLabel="כל בתי הספר"
                  renderLabel={(k) => filterMeta?.schoolLabels[k] ?? k}
                  className="w-full"
                />
                <MultiSelectFilter
                  options={filterOptions.ensembles}
                  value={ensembleFilter}
                  onChange={(v) => { setEnsembleFilter(v); setSelected({}); }}
                  allLabel="כל ההרכבים"
                  renderLabel={(k) => filterMeta?.ensembleLabels[k] ?? k}
                  className="w-full"
                />
                <MultiSelectFilter
                  options={filterOptions.teachers}
                  value={teacherFilter}
                  onChange={(v) => { setTeacherFilter(v); setSelected({}); }}
                  allLabel="כל המורים"
                  renderLabel={(k) => filterMeta?.teacherLabels[k] ?? k}
                  className="w-full"
                />
              </div>
            </div>
          )}


          <div className="space-y-1">
            <Label className="text-xs">נושא</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="לדוגמה: עדכון לגבי שיבוץ מורים"
              className="h-11 rounded-xl"
              dir="rtl"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="text-xs">תוכן ההודעה</Label>
              <div className="flex flex-wrap gap-1">
                {TOKENS.map((t) => (
                  <Button
                    key={t.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 rounded-lg text-xs"
                    onClick={() => {
                      const host = editorHostRef.current;
                      const editable = host?.querySelector<HTMLDivElement>('[contenteditable="true"]');
                      if (editable) {
                        editable.dispatchEvent(new CustomEvent("rte-insert", { detail: t.key }));
                      } else {
                        setBody((prev) => (prev ? `${prev} ${t.key}` : t.key));
                      }
                    }}
                  >
                    + {t.label}
                  </Button>
                ))}
              </div>
            </div>
            <div ref={editorHostRef}>
              <RichTextEditor
                value={body}
                onChange={setBody}
                placeholder="כתבו כאן את תוכן ההודעה. השתמשו בסרגל הכלים לעיצוב טקסט, קישורים, רשימות ויישור."
                minHeight={240}
              />
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
              <p className="text-xs text-muted-foreground">
                המייל יישלח עם כותרת האולפן, פרטי הקשר וחתימה. השמות יוחלפו אוטומטית לכל נמען. הטיוטה נשמרת אוטומטית.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewOpen(true)}
                  className="h-8 rounded-lg gap-1"
                >
                  <Eye className="h-4 w-4" />
                  תצוגה מקדימה
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={clearDraft}
                  className="h-8 rounded-lg gap-1 text-muted-foreground"
                >
                  <Trash2 className="h-4 w-4" />
                  נקה טיוטה
                </Button>
              </div>
            </div>
          </div>


          <div className="pt-3 border-t border-border/50 space-y-1">
            <Label className="text-xs">שליחת מייל בדיקה</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="email"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                placeholder="example@email.com"
                className="h-11 rounded-xl flex-1"
                dir="ltr"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleSendTest}
                disabled={sendingTest || !testEmail.trim()}
                className="h-11 rounded-xl gap-2"
              >
                {sendingTest ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                שלח בדיקה
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              נשלח רק לכתובת שהוזנה, עם הקידומת [בדיקה] בנושא.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold">נמענים</h2>
              <Badge variant="outline">{selectedEmails.length} / {uniqueRecipients.length}</Badge>
              {filteredRows.length > uniqueRecipients.length && (
                <span className="text-xs text-muted-foreground">
                  ({uniqueRecipients.length} מיילים ייחודיים מתוך {filteredRows.length} רשומות — אותו מייל הורה משמש כמה תלמידים)
                </span>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={toggleAll} disabled={filteredRecipients.length === 0}>
              {allFilteredChecked ? "בטל בחירה" : search ? "בחר את המסוננים" : "בחר הכול"}
            </Button>
          </div>

          <BulkStudentSearchAdd onAdd={addFoundRecipients} />

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">הוספת נמענים ידנית</Label>
              <Button type="button" variant="outline" size="sm" className="h-8 rounded-lg" onClick={addManualEntry}>
                + הוסף נמען
              </Button>
            </div>
            {manualEntries.length === 0 ? (
              <p className="text-xs text-muted-foreground">אין נמענים ידניים. לחצו "הוסף נמען" כדי להוסיף מייל, שם הורה ושם תלמיד.</p>
            ) : (
              <div className="space-y-2">
                {manualEntries.map((entry, idx) => {
                  const email = (entry.email || "").trim().toLowerCase();
                  const invalid = email.length > 0 && !/^\S+@\S+\.\S+$/.test(email);
                  return (
                    <div key={idx} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] items-start">
                      <Input
                        value={entry.email}
                        onChange={(e) => updateManualEntry(idx, { email: e.target.value })}
                        placeholder="example@email.com"
                        className={`h-10 rounded-xl ${invalid ? "border-destructive" : ""}`}
                        dir="ltr"
                      />
                      <Input
                        value={entry.parentName}
                        onChange={(e) => updateManualEntry(idx, { parentName: e.target.value })}
                        placeholder="שם הורה"
                        className="h-10 rounded-xl"
                        dir="rtl"
                      />
                      <Input
                        value={entry.studentName}
                        onChange={(e) => updateManualEntry(idx, { studentName: e.target.value })}
                        placeholder="שם תלמיד"
                        className="h-10 rounded-xl"
                        dir="rtl"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-10 w-10 rounded-xl text-muted-foreground"
                        onClick={() => removeManualEntry(idx)}
                        aria-label="הסר נמען"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground">
                  נוספו {manualRecipients.length} נמענים תקינים מתוך {manualEntries.length}.
                </p>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="חיפוש לפי שם הורה, שם תלמיד או מייל..."
              className="h-10 rounded-xl flex-1"
              dir="rtl"
            />
            <Button
              type="button"
              variant={siblingsOnly ? "default" : "outline"}
              className="h-10 rounded-xl whitespace-nowrap"
              onClick={() => {
                const next = !siblingsOnly;
                setSiblingsOnly(next);
                if (next) {
                  // Auto-select only sibling families for quick resend
                  const map: Record<string, boolean> = {};
                  for (const r of uniqueRecipients) {
                    if ((r.siblingCount ?? 0) > 1) map[r.email] = true;
                  }
                  setSelected(map);
                }
              }}
            >
              {siblingsOnly ? "מציג משפחות עם אחים ✓" : "רק משפחות עם אחים"}
            </Button>
          </div>







          {isLoading ? (
            <p className="text-sm text-muted-foreground">טוען נמענים...</p>
          ) : uniqueRecipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">לא נמצאו נמענים לפי הפילטרים שנבחרו.</p>
          ) : filteredRecipients.length === 0 ? (
            <p className="text-sm text-muted-foreground">לא נמצאו תוצאות לחיפוש.</p>
          ) : (
            <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <tbody>
                  {filteredRecipients.map((r) => (
                    <tr key={r.email} className="border-b last:border-b-0 border-border/50">
                      <td className="p-2 w-8">
                        <Checkbox checked={!!effectiveSelected[r.email]} onCheckedChange={() => toggleOne(r.email)} />
                      </td>
                      <td className="p-2">
                        <div className="font-medium text-foreground">{r.parentName || "—"}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.studentName && <span>{r.studentName} · </span>}
                          <span dir="ltr">{r.email}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          {progress && (
            <p className="text-sm text-muted-foreground">
              נשלחו {progress.done} מתוך {progress.total}
              {progress.failed > 0 ? ` · נכשלו ${progress.failed}` : ""}
            </p>
          )}
          <Button
            onClick={() => setConfirmOpen(true)}
            disabled={!canSend || sending}
            className="h-11 rounded-xl gap-2 ms-auto"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "שולח..." : `שלח ל־${selectedEmails.length} נמענים`}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>לשלוח את ההודעה?</AlertDialogTitle>
            <AlertDialogDescription>
              ההודעה תישלח ל־{selectedEmails.length} נמענים במייל. פעולה זו אינה ניתנת לביטול.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); setConfirmOpen(false); handleSend(); }}>
              שלח
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>תצוגה מקדימה של המייל</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border border-border bg-white p-5 text-right" dir="rtl">
            <div className="text-center mb-4">
              <img
                src="https://mtzzalrmtzfrkrpdjjoy.supabase.co/storage/v1/object/public/app-settings/logo.png"
                alt="אולפן ומגמת המוסיקה חוף הכרמל"
                width={120}
                style={{ display: "inline-block", height: "auto" }}
              />
            </div>
            {subject.trim() && (
              <p className="text-xs text-muted-foreground mb-2">
                נושא: <span className="font-medium text-foreground">{renderTemplate(subject, { parentName: "דנה כהן", studentName: "נועם כהן" })}</span>
              </p>
            )}
            <div
              dir="rtl"
              className="text-[15px] leading-[1.5] text-neutral-800 [&_p]:my-1 [&_h1]:my-2 [&_h2]:my-2 [&_ul]:my-1 [&_ol]:my-1 [&_ul]:pr-5 [&_ol]:pr-5 [&_a]:text-primary [&_a]:underline"
              dangerouslySetInnerHTML={{
                __html: renderTemplate(body || "<p class='text-muted-foreground'>אין תוכן</p>", { parentName: "דנה כהן", studentName: "נועם כהן" }),
              }}
            />
            <hr className="my-4 border-neutral-200" />
            <div className="text-sm text-right space-y-1">
              <p className="font-semibold">פרטי קשר</p>
              <p>מייל: <a href="mailto:musichof@gmail.com" className="text-primary underline">musichof@gmail.com</a></p>
              <p>טלפון משרד: 04-6299711</p>
              <p>קורין: 054-7467498</p>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              בברכה,<br />אולפן ומגמת המוסיקה חוף הכרמל
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            השמות מודגמים עם "דנה כהן" / "נועם כהן". בשליחה בפועל יוחלפו לכל נמען.
          </p>
        </DialogContent>
      </Dialog>
    </AdminLayout>

  );
};

export default AdminBulkMessage;
