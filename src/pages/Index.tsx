import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import type { AppRole } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, GraduationCap, ClipboardList } from "lucide-react";
import { useNavigate } from "react-router-dom";

const ROLE_CONFIG: Record<AppRole, { label: string; path: string; icon: React.ReactNode; description: string }> = {
  admin: { label: "מנהל", path: "/admin", icon: <Shield className="h-6 w-6" />, description: "ניהול המערכת, משתמשים ונתונים" },
  teacher: { label: "מורה", path: "/teacher", icon: <GraduationCap className="h-6 w-6" />, description: "תלמידים, דיווחים ושיעורים" },
  secretary: { label: "מזכירה", path: "/secretary", icon: <ClipboardList className="h-6 w-6" />, description: "תלמידים, רישומים ותשלומים" },
};

const Index = () => {
  const { user, roles, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">טוען...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles.length === 0) {
    return (
      <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background">
        <h1 className="text-2xl font-bold text-foreground">אין הרשאה</h1>
        <p className="text-muted-foreground">לא הוקצה לך תפקיד במערכת. פנה למנהל.</p>
      </div>
    );
  }

  // Single role — redirect immediately
  if (roles.length === 1) {
    return <Navigate to={ROLE_CONFIG[roles[0]].path} replace />;
  }

  // Multiple roles — show chooser
  return (
    <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-foreground">בחר אזור</h1>
          <p className="text-sm text-muted-foreground">יש לך מספר תפקידים במערכת. לאן תרצה להיכנס?</p>
        </div>
        <div className="space-y-3">
          {roles.map((role) => {
            const config = ROLE_CONFIG[role];
            return (
              <Card
                key={role}
                className="cursor-pointer hover:shadow-md transition-shadow border-border"
                onClick={() => navigate(config.path)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {config.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground">{config.label}</p>
                    <p className="text-sm text-muted-foreground">{config.description}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Index;
