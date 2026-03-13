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
import AdminStudents from "./pages/admin/AdminStudents";
import AdminStudentForm from "./pages/admin/AdminStudentForm";
import AdminStudentCard from "./pages/admin/AdminStudentCard";
import AdminTeachers from "./pages/admin/AdminTeachers";
import AdminTeacherForm from "./pages/admin/AdminTeacherForm";
import AdminTeacherCard from "./pages/admin/AdminTeacherCard";
import AdminSchools from "./pages/admin/AdminSchools";
import AdminSchoolForm from "./pages/admin/AdminSchoolForm";
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

const AdminRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={["admin"]}>{children}</ProtectedRoute>
);
const TeacherRoute = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={["teacher"]}>{children}</ProtectedRoute>
);

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
            {/* Admin routes */}
            <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
            <Route path="/admin/students" element={<AdminRoute><AdminStudents /></AdminRoute>} />
            <Route path="/admin/students/new" element={<AdminRoute><AdminStudentForm /></AdminRoute>} />
            <Route path="/admin/students/:studentId" element={<AdminRoute><AdminStudentCard /></AdminRoute>} />
            <Route path="/admin/students/:studentId/edit" element={<AdminRoute><AdminStudentForm /></AdminRoute>} />
            <Route path="/admin/teachers" element={<AdminRoute><AdminTeachers /></AdminRoute>} />
            <Route path="/admin/teachers/new" element={<AdminRoute><AdminTeacherForm /></AdminRoute>} />
            <Route path="/admin/teachers/:teacherId" element={<AdminRoute><AdminTeacherCard /></AdminRoute>} />
            <Route path="/admin/teachers/:teacherId/edit" element={<AdminRoute><AdminTeacherForm /></AdminRoute>} />
            <Route path="/admin/schools" element={<AdminRoute><AdminSchools /></AdminRoute>} />
            <Route path="/admin/schools/new" element={<AdminRoute><AdminSchoolForm /></AdminRoute>} />
            <Route path="/admin/schools/:schoolId/edit" element={<AdminRoute><AdminSchoolForm /></AdminRoute>} />
            {/* Teacher routes */}
            <Route path="/teacher" element={<TeacherRoute><TeacherDashboard /></TeacherRoute>} />
            <Route path="/teacher/students" element={<TeacherRoute><TeacherStudents /></TeacherRoute>} />
            <Route path="/teacher/students/:enrollmentId" element={<TeacherRoute><TeacherStudentCard /></TeacherRoute>} />
            <Route path="/teacher/reports" element={<TeacherRoute><TeacherReports /></TeacherRoute>} />
            <Route path="/teacher/reports/new" element={<TeacherRoute><TeacherNewReport /></TeacherRoute>} />
            <Route path="/teacher/reports/:reportId" element={<TeacherRoute><TeacherReportView /></TeacherRoute>} />
            <Route path="/teacher/reports/:reportId/edit" element={<TeacherRoute><TeacherEditReport /></TeacherRoute>} />
            {/* Secretary */}
            <Route path="/secretary" element={<ProtectedRoute allowedRoles={["secretary"]}><SecretaryDashboard /></ProtectedRoute>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
