import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const SecretaryDashboard = () => {
  const { signOut, user } = useAuth();

  return (
    <div dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
      <h1 className="text-3xl font-bold text-foreground">אזור מזכירה</h1>
      <p className="text-muted-foreground">ברוכה הבאה, {user?.email}</p>
      <p className="text-sm text-muted-foreground">עמוד זה ישמש כאזור המזכירות</p>
      <Button variant="outline" onClick={signOut}>התנתק</Button>
    </div>
  );
};

export default SecretaryDashboard;
