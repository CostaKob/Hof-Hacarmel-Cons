import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const TeacherDashboard = () => {
  const { signOut, user } = useAuth();

  return (
    <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
      <h1 className="text-3xl font-bold text-foreground">אזור מורה</h1>
      <p className="text-muted-foreground">ברוך הבא, {user?.email}</p>
      <p className="text-sm text-muted-foreground">עמוד זה ישמש כאזור האישי של המורה</p>
      <Button variant="outline" onClick={signOut}>התנתק</Button>
    </div>
  );
};

export default TeacherDashboard;
