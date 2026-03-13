import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const Index = () => {
  const { user, roles, loading } = useAuth();

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

  // Priority: admin > teacher > secretary
  if (roles.includes("admin")) return <Navigate to="/admin" replace />;
  if (roles.includes("teacher")) return <Navigate to="/teacher" replace />;
  if (roles.includes("secretary")) return <Navigate to="/secretary" replace />;

  return (
    <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-2 bg-background">
      <h1 className="text-2xl font-bold text-foreground">אין הרשאה</h1>
      <p className="text-muted-foreground">לא הוקצה לך תפקיד במערכת. פנה למנהל.</p>
    </div>
  );
};

export default Index;
