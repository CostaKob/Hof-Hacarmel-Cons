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
import { FileDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

type Row = {
  studentName: string;
  instrument: string | null;
  parent1Name: string | null;
  parent1Phone: string | null;
  parent2Name: string | null;
  parent2Phone: string | null;
};

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

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["ensemble-contacts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ensemble_students")
        .select(
          "*, students(id, first_name, last_name, parent_name, parent_phone, parent_name_2, parent_phone_2), enrollments(id, instruments(name))"
        )
        .eq("ensemble_id", id!);
      if (error) throw error;
      return (data ?? [])
        .map((es: any): Row => ({
          studentName: `${es.students?.first_name ?? ""} ${es.students?.last_name ?? ""}`.trim(),
          instrument: es.enrollments?.instruments?.name ?? null,
          parent1Name: es.students?.parent_name ?? null,
          parent1Phone: es.students?.parent_phone ?? null,
          parent2Name: es.students?.parent_name_2 ?? null,
          parent2Phone: es.students?.parent_phone_2 ?? null,
        }))
        .sort((a, b) => cmpHe(a.studentName, b.studentName));
    },
    enabled: !!id,
  });

  return (
    <AdminLayout title={`דף קשר — ${ensemble?.name ?? "הרכב"}`} backPath={`/admin/ensembles/${id}`}>
      <PageTitle title={`דף קשר — ${ensemble?.name ?? "הרכב"}`} />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">דף קשר להורים ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">טוען...</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">אין משתתפים בהרכב</p>
          ) : (
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
                  {rows.map((r, i) => (
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
          )}
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminEnsembleContacts;
