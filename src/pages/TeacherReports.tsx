import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTeacherProfile, useTeacherReports, useTeacherSchools } from "@/hooks/useTeacherData";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowRight, Eye, Plus } from "lucide-react";

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
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/teacher")}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-bold text-foreground">הדיווחים שלי</h1>
          </div>
          <Button size="sm" onClick={() => navigate("/teacher/reports/new")}>
            <Plus className="ml-1 h-4 w-4" />
            דיווח חדש
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">סינון לפי תאריך</Label>
            <Input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              placeholder="סנן לפי תאריך"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">סינון לפי בית ספר</Label>
            <Select value={schoolFilter} onValueChange={setSchoolFilter}>
              <SelectTrigger>
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
          <p className="text-center text-muted-foreground py-8">לא נמצאו דיווחים</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((report) => (
              <Card key={report.id} className="hover:shadow-md transition-shadow">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold text-foreground">{report.report_date}</p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span>{report.schools?.name}</span>
                      <span>·</span>
                      <span>{report.kilometers} ק״מ</span>
                      <span>·</span>
                      <span>{report.report_lines?.length ?? 0} שורות</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      הוגש: {new Date(report.submitted_at).toLocaleString("he-IL")}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => navigate(`/teacher/reports/${report.id}`)}
                  >
                    <Eye className="ml-1 h-4 w-4" />
                    צפייה
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default TeacherReports;
