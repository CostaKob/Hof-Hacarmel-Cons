import { Copy, ExternalLink, Printer, School } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const BRANCHES = [
  { name: "העמר", slug: "haomer" },
  { name: "כרמל וים", slug: "carmelvayam" },
  { name: "מעגנים", slug: "maaganim" },
  { name: "קיסריה", slug: "caesarea" },
];

const getPublicUrl = (slug: string) => `${window.location.origin}/branch/${slug}`;

const AdminSchoolContacts = () => {
  const copyLink = async (slug: string) => {
    try {
      await navigator.clipboard.writeText(getPublicUrl(slug));
      toast.success("הקישור הועתק");
    } catch {
      toast.error("לא ניתן להעתיק את הקישור");
    }
  };

  return (
    <AdminLayout title="דפי קשר בתי ספר" backPath="/admin">
      <PageTitle title="דפי קשר בתי ספר" />
      <div className="mb-5" dir="rtl">
        <h2 className="text-xl font-semibold text-foreground">דפי קשר בתי ספר</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          קישורים ציבוריים שמתעדכנים אוטומטית ומוכנים להדפסה על A4
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2" dir="rtl">
        {BRANCHES.map((branch) => (
          <Card key={branch.slug}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <School className="h-5 w-5 text-primary" />
                דף קשר — {branch.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild className="h-12 flex-1 rounded-xl">
                <a href={`/branch/${branch.slug}`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" /> פתיחת הדף
                </a>
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-xl"
                onClick={() => copyLink(branch.slug)}
              >
                <Copy className="h-4 w-4" /> העתקת קישור
              </Button>
              <Button asChild variant="outline" className="h-12 rounded-xl">
                <a href={`/branch/${branch.slug}?print=1`} target="_blank" rel="noopener noreferrer">
                  <Printer className="h-4 w-4" /> הדפסה
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
};

export default AdminSchoolContacts;