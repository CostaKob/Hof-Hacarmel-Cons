import { useNavigate } from "react-router-dom";
import AdminLayout from "@/components/admin/AdminLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Users, GraduationCap, School, Link } from "lucide-react";

const SECTIONS = [
  { path: "/admin/students", label: "תלמידים", description: "ניהול תלמידים, פרטים אישיים ורישומים", icon: Users },
  { path: "/admin/teachers", label: "מורים", description: "ניהול מורים, פרטים אישיים ושיוכים", icon: GraduationCap },
  { path: "/admin/schools", label: "בתי ספר", description: "ניהול בתי ספר וכתובות", icon: School },
  { path: "/admin/enrollments", label: "שיוכים", description: "ניהול שיוכי תלמידים למורים ובתי ספר", icon: Link },
];

const AdminDashboard = () => {
  const navigate = useNavigate();

  return (
    <AdminLayout title="פאנל ניהול">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((s) => (
          <Card
            key={s.path}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => navigate(s.path)}
          >
            <CardContent className="flex items-center gap-4 p-6">
              <div className="rounded-lg bg-primary/10 p-3">
                <s.icon className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{s.label}</p>
                <p className="text-sm text-muted-foreground">{s.description}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
