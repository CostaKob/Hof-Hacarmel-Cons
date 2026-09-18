import { Copy, ExternalLink, Printer, Users } from "lucide-react";
import { toast } from "sonner";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const PUBLIC_PATH = "/teacher-contacts";

const AdminTeacherContacts = () => {
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${PUBLIC_PATH}`);
      toast.success("הקישור הועתק");
    } catch {
      toast.error("לא ניתן להעתיק את הקישור");
    }
  };

  return (
    <AdminLayout title="דף קשר מורים" backPath="/admin">
      <PageTitle title="דף קשר מורים" />
      <div className="mb-5" dir="rtl">
        <h2 className="text-xl font-semibold text-foreground">דף קשר לכל המורים</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          קישור ציבורי שמתעדכן אוטומטית ומוכן להדפסה על A4
        </p>
      </div>

      <Card dir="rtl">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-5 w-5 text-primary" />
            רשימת המורים הפעילים
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button asChild className="h-12 flex-1 rounded-xl">
            <a href={PUBLIC_PATH} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4" /> פתיחת הדף
            </a>
          </Button>
          <Button variant="outline" className="h-12 rounded-xl" onClick={copyLink}>
            <Copy className="h-4 w-4" /> העתקת קישור
          </Button>
          <Button asChild variant="outline" className="h-12 rounded-xl">
            <a href={`${PUBLIC_PATH}?print=1`} target="_blank" rel="noopener noreferrer">
              <Printer className="h-4 w-4" /> הדפסה
            </a>
          </Button>
        </CardContent>
      </Card>
    </AdminLayout>
  );
};

export default AdminTeacherContacts;