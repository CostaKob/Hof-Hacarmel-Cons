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
import { useAppLogo } from "@/hooks/useAppLogo";

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

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
  const { logoUrl } = useAppLogo();

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
      const tableHeader = `<tr>${["#", "תלמיד/ה", "כלי", "הורה 1", "טלפון", "הורה 2", "טלפון"]
        .map((heading) => `<th style="${headerStyle}">${heading}</th>`)
        .join("")}</tr>`;

      const logoDataUrl = await loadImageDataUrl(logoUrl);

      let introHtml = `<div style="display:flex;flex-direction:column;align-items:center;gap:6px;margin-bottom:10px;">`;
      if (logoDataUrl) {
        introHtml += `<img src="${logoDataUrl}" style="height:64px;width:auto;object-fit:contain;" alt="לוגו האולפן" />`;
      }
      introHtml += `<div style="font-size:13px;color:#666;">אולפן ומגמת המוסיקה חוף הכרמל</div>`;
      introHtml += `</div>`;
      introHtml += `<h2 style="text-align:center;font-size:20px;margin-bottom:4px;margin-top:0;">דף קשר להורים — ${ensemble?.name ?? "הרכב"}</h2>`;
      const yearName = (ensemble as any)?.academic_years?.name;
      if (yearName) introHtml += `<p style="text-align:center;font-size:14px;color:#666;margin-top:0;">${yearName}</p>`;

      // סיכום לפי יישוב (להזמנת הסעות) — יוצג כעמוד אחרון
      let summaryHtml = `<h3 style="text-align:center;font-size:18px;margin:0 0 10px;">סיכום להזמנת הסעות</h3>`;
      summaryHtml += `<table style="border-collapse:collapse;margin:0 auto;min-width:320px;">`;
      summaryHtml += `<tr><th style="${headerStyle}">יישוב</th><th style="${headerStyle}">מספר ילדים</th></tr>`;
      for (const group of cityGroups) {
        summaryHtml += `<tr><td style="${cellStyle}font-weight:bold;">${group.city}</td><td style="${cellStyle}text-align:center;">${group.rows.length}</td></tr>`;
      }
      summaryHtml += `<tr><td style="${cellStyle}font-weight:bold;background:#f0f0f0;">סה״כ</td><td style="${cellStyle}text-align:center;font-weight:bold;background:#f0f0f0;">${totalRows}</td></tr>`;
      summaryHtml += `</table>`;

      const rowsHtml: string[] = [];
      let idx = 0;
      for (const group of cityGroups) {
        rowsHtml.push(`<tr data-city-row><td colspan="7" style="${cityStyle}">${group.city} (${group.rows.length})</td></tr>`);
        group.rows.forEach((r, i) => {
          idx++;
          const rowBg = i % 2 === 1 ? "background:#fafafa;" : "";
          rowsHtml.push(`<tr style="${rowBg}">
            <td style="${cellStyle}color:#999;text-align:center;">${idx}</td>
            <td style="${cellStyle}font-weight:bold;">${r.studentName}</td>
            <td style="${cellStyle}">${r.instrument ?? ""}</td>
            <td style="${cellStyle}">${r.parent1Name ?? ""}</td>
            <td style="${cellStyle}" dir="ltr">${r.parent1Phone ?? ""}</td>
            <td style="${cellStyle}">${r.parent2Name ?? ""}</td>
            <td style="${cellStyle}" dir="ltr">${r.parent2Phone ?? ""}</td>
          </tr>`);
        });
      }

      const container = document.createElement("div");
      container.style.cssText = "position:absolute;left:-9999px;top:0;width:1000px;background:#ffffff;padding:20px;box-sizing:border-box;font-family:Arial,sans-serif;";
      container.dir = "rtl";
      document.body.appendChild(container);

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 8;
      const usableWidth = pageWidth - margin * 2;
      const maxPageHeightPx = ((pageHeight - margin * 2) * 1000) / usableWidth;
      const pages: string[][] = [];
      let currentRows: string[] = [];
      let isFirstPage = true;

      const setPageContent = (rows: string[], includeIntro: boolean) => {
        container.innerHTML = `${includeIntro ? introHtml : ""}<table style="border-collapse:collapse;width:100%;">${tableHeader}${rows.join("")}</table>`;
      };

      const isCityHeader = (html: string) => html.includes("data-city-row");

      for (let i = 0; i < rowsHtml.length; i++) {
        // כותרת יישוב נבדקת יחד עם השורה הראשונה שלה — לא מתחילים יישוב בסוף עמוד
        const groupChunk =
          isCityHeader(rowsHtml[i]) && i + 1 < rowsHtml.length
            ? [rowsHtml[i], rowsHtml[i + 1]]
            : [rowsHtml[i]];
        const candidateRows = [...currentRows, ...groupChunk];
        setPageContent(candidateRows, isFirstPage);
        if (container.scrollHeight > maxPageHeightPx && currentRows.length > 0) {
          pages.push(currentRows);
          currentRows = groupChunk;
          isFirstPage = false;
        } else {
          currentRows = candidateRows;
        }
        if (groupChunk.length === 2) i++;
      }
      if (currentRows.length > 0) pages.push(currentRows);

      for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        setPageContent(pages[pageIndex], pageIndex === 0);
        const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
        const renderedHeight = (canvas.height * usableWidth) / canvas.width;
        if (pageIndex > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", margin, margin, usableWidth, renderedHeight);
      }

      // עמוד אחרון — סיכום יישובים להזמנת הסעות
      container.innerHTML = summaryHtml;
      const summaryCanvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff" });
      const summaryHeight = (summaryCanvas.height * usableWidth) / summaryCanvas.width;
      pdf.addPage();
      pdf.addImage(summaryCanvas.toDataURL("image/png"), "PNG", margin, margin, usableWidth, summaryHeight);

      document.body.removeChild(container);

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
