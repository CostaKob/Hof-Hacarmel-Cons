import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import PageTitle from "@/components/PageTitle";
import { Mail, Users, FileText, BarChart3 } from "lucide-react";

const SECTIONS = [
  {
    path: "/admin/bulk-message",
    label: "רשימת תפוצה — שליחת מייל מרוכז",
    description: "בחירת קהל יעד, עריכת מייל מותג ושליחה להורים",
    icon: Users,
  },
  {
    path: "/admin/message-templates",
    label: "נוסח הודעת שיוך מורה",
    description: "עריכת הנוסח שנשלח להורים עם פרטי המורים והקישור לתשלום",
    icon: FileText,
  },
  {
    path: "/admin/email-dashboard",
    label: "לוח בקרת מיילים",
    description: "מעקב אחר מיילים שנשלחו, כשלים וחסימות",
    icon: BarChart3,
  },
];

const AdminMessaging = () => {
  const navigate = useNavigate();
  return (
    <AdminLayout title="שליחת הודעות להורים">
      <PageTitle title="שליחת הודעות להורים" />
      <div className="grid gap-4 sm:grid-cols-2" dir="rtl">
        {SECTIONS.map((s) => (
          <button
            key={s.path}
            onClick={() => navigate(s.path)}
            className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md active:scale-[0.98] text-right"
          >
            <div className="rounded-xl bg-accent p-3.5">
              <s.icon className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground text-base">{s.label}</p>
              <p className="text-sm text-muted-foreground mt-0.5">{s.description}</p>
            </div>
          </button>
        ))}
      </div>
      <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground" dir="rtl">
        <Mail className="h-4 w-4" />
        כל ההודעות נשלחות מכתובת האולפן עם הלוגו והעיצוב המותג.
      </div>
    </AdminLayout>
  );
};

export default AdminMessaging;
