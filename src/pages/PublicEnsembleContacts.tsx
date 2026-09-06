import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AppLogo from "@/components/AppLogo";
import PageTitle from "@/components/PageTitle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import PhoneDisplay from "@/components/PhoneDisplay";
import { cmpHe } from "@/lib/sortHebrew";
import { Loader2, MapPin, Bus } from "lucide-react";

type ContactRow = {
  student_name: string;
  instrument: string | null;
  city: string | null;
  parent1_name: string | null;
  parent1_phone: string | null;
  parent2_name: string | null;
  parent2_phone: string | null;
};

const NO_CITY = "ללא יישוב";

const getPageTitle = (ensembleName?: string, transportOnly = false) => {
  if (!ensembleName) return transportOnly ? "סיכום הסעות" : "דף קשר הרכב";
  const base = transportOnly ? "סיכום הסעות" : "דף קשר";
  if (ensembleName.includes("מקהלה")) return `${base} מקהלה ייצוגית חוף הכרמל`;
  if (ensembleName.includes("תזמורת")) return `${base} תזמורת ייצוגית חוף הכרמל`;
  return `${base} — ${ensembleName}`;
};

const PublicEnsembleContacts = ({ transportOnly = false }: { transportOnly?: boolean }) => {
  const { id } = useParams<{ id: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-ensemble-contacts", id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_public_ensemble_contacts" as never, {
        _ensemble_id: id,
      } as never);
      if (error) throw error;
      return data as unknown as { name: string; rows: ContactRow[] } | null;
    },
  });

  const pageTitle = getPageTitle(data?.name, transportOnly);

  const cityGroups = (() => {
    const rows = data?.rows ?? [];
    const byCity = new Map<string, ContactRow[]>();
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
        rows: list.sort((a, b) => cmpHe(a.student_name, b.student_name)),
      }));
  })();

  const totalRows = data?.rows?.length ?? 0;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <PageTitle title={pageTitle} />
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <AppLogo size="lg" />
          <p className="text-sm text-muted-foreground">אולפן ומגמת המוסיקה חוף הכרמל</p>
          <h1 className="text-xl font-semibold">{pageTitle}</h1>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error || !data ? (
          <p className="text-center text-muted-foreground py-12">העמוד לא נמצא</p>
        ) : totalRows === 0 ? (
          <p className="text-center text-muted-foreground py-12">אין משתתפים בהרכב</p>
        ) : transportOnly ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Bus className="h-4 w-4 text-primary" />
                סיכום להזמנת הסעות
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>יישוב</TableHead>
                    <TableHead className="text-center">מספר ילדים</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cityGroups.map((g) => (
                    <TableRow key={g.city}>
                      <TableCell className="font-medium">{g.city}</TableCell>
                      <TableCell className="text-center">{g.rows.length}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell className="font-bold">סה״כ</TableCell>
                    <TableCell className="text-center font-bold">{totalRows}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : (
          cityGroups.map((group) => (
            <Card key={group.city}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {group.city}{" "}
                  <span className="text-muted-foreground font-normal">({group.rows.length})</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {group.rows.map((r, i) => (
                    <li key={i} className="px-4 py-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold text-[15px] leading-snug">{r.student_name}</span>
                        {r.instrument && (
                          <span className="text-xs text-muted-foreground shrink-0">{r.instrument}</span>
                        )}
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {[
                          { name: r.parent1_name, phone: r.parent1_phone },
                          { name: r.parent2_name, phone: r.parent2_phone },
                        ]
                          .filter((p) => p.name || p.phone)
                          .map((p, j) => (
                            <div key={j} className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-muted-foreground truncate">{p.name ?? "הורה"}</span>
                              {p.phone && (
                                <span className="shrink-0">
                                  <PhoneDisplay phone={p.phone} />
                                </span>
                              )}
                            </div>
                          ))}
                        {!r.parent1_name && !r.parent1_phone && !r.parent2_name && !r.parent2_phone && (
                          <div className="text-sm text-muted-foreground">אין פרטי קשר</div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default PublicEnsembleContacts;
