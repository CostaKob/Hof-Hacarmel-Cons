import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PhoneDisplay from "@/components/PhoneDisplay";
import { cmpHe } from "@/lib/sortHebrew";
import { Button } from "@/components/ui/button";
import { FileDown, MapPin } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

type Row = {
  studentName: string;
  instrument: string | null;
  city: string | null;
  parent1Name: string | null;
  parent1Phone: string | null;
  parent2Name: string | null;
  parent2Phone: string | null;
};

const NO_CITY = "ללא יישוב";

const AdminEnsembleContacts = () => {
  const { id } = useParams<{ id: string }>();
  const [exporting, setExporting] = useState(false);

  const { data: ensemble } = useQuery({
    queryKey: ["ensemble", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ensembles")
        .select("*, schools(name), academic_years(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: cityGroups = [], isLoading } = useQuery<{ city: string; rows: Row[] }[]>({
    queryKey: ["ensemble-contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ensemble_students")
        .select(
          "*, students(id, first_name, last_name, city, parent_name, parent_phone, parent_name_2, parent_phone_2), enrollments(id, instruments(name))"
        )
        .eq("ensemble_id", id!);
      if (error) throw error;
      const rows: Row[] = (data ?? []).map((es: any): Row => ({
        studentName: `${es.students?.first_name ?? ""} ${es.students?.last_name ?? ""}`.trim(),
        instrument: es.enrollments?.instruments?.name ?? null,
        city: es.students?.city ?? null,
        parent1Name: es.students?.parent_name ?? null,
        parent1Phone: es.students?.parent_phone ?? null,
        parent2Name: es.students?.parent_name_2 ?? null,
        parent2Phone: es.students?.parent_phone_2 ?? null,
      }));
      const byCity = new Map<string, Row[]>();
      for (const r of rows) {
        const key = r.city?.trim() || NO_CITY;
        if (!byCity.has(key)) byCity.set(key, []);
        byCity.get(key)!.push(r);
      }
      return [...byCity.entries()]
        .sort((a, b) => {
          if (a[0] === NO_CITY) return 1;
          if (b[0] === NO_CITY) return -1;
          return cmpHe(a[0], b[0]);
        })
        .map(([city, list]) => ({
          city,
          rows: list.sort((a, b) => cmpHe(a.studentName, b.studentName)),
        }));
    },
    enabled: !!id,
  });

  const totalRows = cityGroups.reduce((sum, g) => sum + g.rows.length, 0);

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      await document.fonts.ready;
      const cellStyle = "border:1px solid #bbb;padding:6px 10px;text-align:right;font-size:14px;white-space:nowrap;";
      const headerStyle = `${cellStyle}font-weight:bold;background:#e8e8e8;text-align:center;`;
      const cityStyle = `${cellStyle}font-weight:bold;background:#dbeafe;text-align:right;font-size:15px;`;

      let html = `<div dir="rtl" style="font-family:Arial,sans-serif;">`;
      html += `<h2 style="text-align:center;font-size:20px;margin-bottom:4px;">דף קשר להורים — ${ensemble?.name ?? "הרכב"}</h2>`;
      const yearName = (ensemble as any)?.academic_years?.name;
      if (yearName) html += `<p style="text-align:center;font-size:14px;color:#666;margin-top:0;">${yearName}</p>`;
      html += `<table style="border-collapse:collapse;width:100%;">`;
      html += `<tr>`;
      for (const h of ["#", "תלמיד/ה", "כלי", "הורה 1", "טלפון", "הורה 2", "טלפון"])
        html += `<th style="${headerStyle}">${h}</th>`;
      html += `</tr>`;
      let idx = 0;
      for (const group of cityGroups) {
        html += `<tr><td colspan="7" style="${cityStyle}">${group.city} (${group.rows.length})</td></tr>`;
        group.rows.forEach((r, i) => {
          idx++;
          const rowBg = i % 2 === 1 ? "background:#fafafa;" : "";
          html += `<tr style="${rowBg}">`;
          html += `<td style="${cellStyle}color:#999;text-align:center;">${idx}</td>`;
          html += `<td style="${cellStyle}font-weight:bold;">${r.studentName}</td>`;
          html += `<td style="${cellStyle}">${r.instrument ?? ""}</td>`;
          html += `<td style="${cellStyle}">${r.parent1Name ?? ""}</td>`;
          html += `<td style="${cellStyle}" dir="ltr">${r.parent1Phone ?? ""}</td>`;
          html += `<td style="${cellStyle}">${r.parent2Name ?? ""}</td>`;
          html += `<td style="${cellStyle}" dir="ltr">${r.parent2Phone ?? ""}</td>`;
          html += `</tr>`;
        });
      }
      html += `</table></div>`;

      const container = document.createElement("div");
      container.style.cssText = "position:absolute;left:-9999px;top:0;width:1000px;background:#ffffff;padding:20px;";
      container.innerHTML = html;
      document.body.appendChild(container);

      const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
      document.body.removeChild(container);

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableWidth = pageWidth - margin * 2;
      const ratio = usableWidth / canvas.width;
      const scaledHeight = canvas.height * ratio;

      if (scaledHeight <= pageHeight - margin * 2) {
        pdf.addImage(imgData, "PNG", margin, margin, usableWidth, scaledHeight);
      } else {
        let yOffset = 0;
        const sliceHeight = (pageHeight - margin * 2) / ratio;
        while (yOffset < canvas.height) {
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.min(sliceHeight, canvas.height - yOffset);
          const ctx = sliceCanvas.getContext("2d")!;
          ctx.drawImage(canvas, 0, -yOffset);
          const sliceImg = sliceCanvas.toDataURL("image/png");
          const h = sliceCanvas.height * ratio;
          pdf.addImage(sliceImg, "PNG", margin, margin, usableWidth, h);
          yOffset += sliceHeight;
          if (yOffset < canvas.height) pdf.addPage();
        }
      }

      pdf.save(`דף_קשר_${ensemble?.name ?? "הרכב"}.pdf`);
      toast.success("PDF יוצא בהצלחה");
    } catch {
      toast.error("שגיאה בייצוא PDF");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminLayout title={`דף קשר — ${ensemble?.name ?? "הרכב"}`} backPath={`/admin/ensembles/${id}`}>
      <PageTitle title={`דף קשר — ${ensemble?.name ?? "הרכב"}`} />
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">דף קשר להורים ({totalRows})</h2>
          <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={exporting || totalRows === 0}>
            <FileDown className="h-4 w-4 ml-1" /> {exporting ? "מייצא..." : "ייצוא PDF"}
          </Button>
        </div>

        {isLoading ? (
          <p className="text-center text-muted-foreground py-8">טוען...</p>
        ) : totalRows === 0 ? (
          <p className="text-center text-muted-foreground py-8">אין משתתפים בהרכב</p>
        ) : (
          cityGroups.map((group) => (
            <Card key={group.city}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {group.city} <span className="text-muted-foreground font-normal">({group.rows.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>תלמיד/ה</TableHead>
                        <TableHead>כלי</TableHead>
                        <TableHead>הורה 1</TableHead>
                        <TableHead>טלפון</TableHead>
                        <TableHead>הורה 2</TableHead>
                        <TableHead>טלפון</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.rows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.studentName}</TableCell>
                          <TableCell>{r.instrument ?? "—"}</TableCell>
                          <TableCell>{r.parent1Name ?? "—"}</TableCell>
                          <TableCell><PhoneDisplay phone={r.parent1Phone} /></TableCell>
                          <TableCell>{r.parent2Name ?? "—"}</TableCell>
                          <TableCell><PhoneDisplay phone={r.parent2Phone} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminEnsembleContacts;
