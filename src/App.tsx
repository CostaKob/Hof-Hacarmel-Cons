import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherStudents from "./pages/TeacherStudents";
import TeacherStudentCard from "./pages/TeacherStudentCard";
import TeacherReports from "./pages/TeacherReports";
import TeacherNewReport from "./pages/TeacherNewReport";
import TeacherReportView from "./pages/TeacherReportView";
import TeacherEditReport from "./pages/TeacherEditReport";
import SecretaryDashboard from "./pages/SecretaryDashboard";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Index />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["admin"]}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher"
              element={
                <ProtectedRoute allowedRoles={["teacher"]}>
                  <TeacherDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/students"
              element={
                <ProtectedRoute allowedRoles={["teacher"]}>
                  <TeacherStudents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/students/:enrollmentId"
              element={
                <ProtectedRoute allowedRoles={["teacher"]}>
                  <TeacherStudentCard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/reports"
              element={
                <ProtectedRoute allowedRoles={["teacher"]}>
                  <TeacherReports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/reports/new"
              element={
                <ProtectedRoute allowedRoles={["teacher"]}>
                  <TeacherNewReport />
                </ProtectedRoute>
              }
            />
            <Route
              path="/teacher/reports/:reportId"
              element={
                <ProtectedRoute allowedRoles={["teacher"]}>
                  <TeacherReportView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/secretary"
              element={
                <ProtectedRoute allowedRoles={["secretary"]}>
                  <SecretaryDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
