import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTeacherProfile, useTeacherReports, useTeacherSchools } from "@/hooks/useTeacherData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Eye, Pencil, Plus, FileText, ChevronLeft } from "lucide-react";

const TeacherReports = () => {
  const navigate = useNavigate();
  const { data: teacher, isLoading: teacherLoading } = useTeacherProfile();
  const { data: reports, isLoading: reportsLoading } = useTeacherReports(teacher?.id);
  const { data: teacherSchools } = useTeacherSchools(teacher?.id);

  const [dateFilter, setDateFilter] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("all");

  const filtered = useMemo(() => {
    if (!reports) return [];
    return reports.filter((r) => {
      if (dateFilter && !r.report_date.includes(dateFilter)) return false;
      if (schoolFilter !== "all" && r.school_id !== schoolFilter) return false;
      return true;
    });
  }, [reports, dateFilter, schoolFilter]);

  const isLoading = teacherLoading || reportsLoading;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-primary px-5 pb-6 pt-5 text-primary-foreground">
        <div className="mx-auto flex max-w-lg items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/10"
              onClick={() => navigate("/teacher")}
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold">הדיווחים שלי</h1>
          </div>
          <Button
            size="sm"
            variant="secondary"
            className="rounded-xl h-10"
            onClick={() => navigate("/teacher/reports/new")}
          >
            <Plus className="ml-1 h-4 w-4" />
            דיווח חדש
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-5 -mt-3 pb-8 space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">תאריך</Label>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-11 rounded-xl bg-card"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">בית ספר</Label>
            <Select value={schoolFilter} onValueChange={setSchoolFilter}>
              <SelectTrigger className="h-11 rounded-xl bg-card">
                <SelectValue placeholder="כל בתי הספר" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל בתי הספר</SelectItem>
                {teacherSchools?.map((ts) => (
                  <SelectItem key={ts.school_id} value={ts.school_id}>
                    {ts.schools?.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">לא נמצאו דיווחים</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((report) => (
              <button
                key={report.id}
                onClick={() => navigate(`/teacher/reports/${report.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl bg-card p-4 shadow-sm border border-border text-right transition-all active:scale-[0.98] hover:shadow-md"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent">
                  <FileText className="h-5 w-5 text-accent-foreground" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="font-semibold text-foreground">{report.report_date}</p>
                  <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                    <span>{report.schools?.name}</span>
                    <span>·</span>
                    <span>{report.kilometers} ק״מ</span>
                    <span>·</span>
                    <Badge variant="secondary" className="text-xs rounded-lg">{report.report_lines?.length ?? 0} שורות</Badge>
                  </div>
                </div>
                <ChevronLeft className="h-5 w-5 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherReports;
