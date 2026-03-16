import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { AcademicYearProvider } from "@/hooks/useAcademicYear";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ScrollToTop } from "@/components/ScrollToTop";
import Index from "./pages/Index";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import AdminStudents from "./pages/admin/AdminStudents";
import AdminStudentForm from "./pages/admin/AdminStudentForm";
import AdminStudentCard from "./pages/admin/AdminStudentCard";
import AdminTeachers from "./pages/admin/AdminTeachers";
import AdminTeacherForm from "./pages/admin/AdminTeacherForm";
import AdminTeacherCard from "./pages/admin/AdminTeacherCard";
import AdminTeacherReports from "./pages/admin/AdminTeacherReports";
import AdminSchools from "./pages/admin/AdminSchools";
import AdminEnrollments from "./pages/admin/AdminEnrollments";
import AdminEnrollmentForm from "./pages/admin/AdminEnrollmentForm";
import AdminInstruments from "./pages/admin/AdminInstruments";
import AdminInstrumentForm from "./pages/admin/AdminInstrumentForm";
import AdminSchoolForm from "./pages/admin/AdminSchoolForm";
import TeacherDashboard from "./pages/TeacherDashboard";
import TeacherStudents from "./pages/TeacherStudents";
import TeacherStudentCard from "./pages/TeacherStudentCard";
import TeacherReports from "./pages/TeacherReports";
import TeacherNewReport from "./pages/TeacherNewReport";
import TeacherReportView from "./pages/TeacherReportView";
import TeacherEditReport from "./pages/TeacherEditReport";
import TeacherChangePassword from "./pages/TeacherChangePassword";
import TeacherYearlySummary from "./pages/TeacherYearlySummary";
import TeacherTravelSummary from "./pages/TeacherTravelSummary";
import TeacherEnsembles from "./pages/TeacherEnsembles";
import TeacherEnsembleCard from "./pages/TeacherEnsembleCard";
import TeacherEnsembleStudentCard from "./pages/TeacherEnsembleStudentCard";
import SecretaryDashboard from "./pages/SecretaryDashboard";
import AdminYearlySummary from "./pages/admin/AdminYearlySummary";
import AdminAcademicYears from "./pages/admin/AdminAcademicYears";
import AdminYearTransition from "./pages/admin/AdminYearTransition";
import AdminRegistrations from "./pages/admin/AdminRegistrations";
import AdminRegistrationCard from "./pages/admin/AdminRegistrationCard";
import AdminRegistrationSettings from "./pages/admin/AdminRegistrationSettings";
import AdminRegistrationPages from "./pages/admin/AdminRegistrationPages";
import AdminRegistrationPageEditor from "./pages/admin/AdminRegistrationPageEditor";
import AdminRegistrationConvert from "./pages/admin/AdminRegistrationConvert";
import AdminExports from "./pages/admin/AdminExports";
import AdminEnsembles from "./pages/admin/AdminEnsembles";
import AdminEnsembleForm from "./pages/admin/AdminEnsembleForm";
import AdminEnsembleCard from "./pages/admin/AdminEnsembleCard";
import AdminSchoolMusicSchools from "./pages/admin/AdminSchoolMusicSchools";
import AdminSchoolMusicSchoolForm from "./pages/admin/AdminSchoolMusicSchoolForm";
import AdminSchoolMusicSchoolCard from "./pages/admin/AdminSchoolMusicSchoolCard";
import PublicRegistration from "./pages/PublicRegistration";
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
        <ScrollToTop />
        <AuthProvider>
          <AcademicYearProvider>
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
              <Route path="/admin/teachers/:teacherId/reports" element={<AdminRoute><AdminTeacherReports /></AdminRoute>} />
              <Route path="/admin/teachers/:teacherId/reports/:reportId" element={<AdminRoute><TeacherReportView /></AdminRoute>} />
              <Route path="/admin/teachers/:teacherId/reports/:reportId/edit" element={<AdminRoute><TeacherEditReport /></AdminRoute>} />
              <Route path="/admin/schools" element={<AdminRoute><AdminSchools /></AdminRoute>} />
              <Route path="/admin/schools/new" element={<AdminRoute><AdminSchoolForm /></AdminRoute>} />
              <Route path="/admin/schools/:schoolId/edit" element={<AdminRoute><AdminSchoolForm /></AdminRoute>} />
              <Route path="/admin/enrollments" element={<AdminRoute><AdminEnrollments /></AdminRoute>} />
              <Route path="/admin/enrollments/new" element={<AdminRoute><AdminEnrollmentForm /></AdminRoute>} />
              <Route path="/admin/enrollments/:id/edit" element={<AdminRoute><AdminEnrollmentForm /></AdminRoute>} />
              <Route path="/admin/instruments" element={<AdminRoute><AdminInstruments /></AdminRoute>} />
              <Route path="/admin/instruments/new" element={<AdminRoute><AdminInstrumentForm /></AdminRoute>} />
              <Route path="/admin/instruments/:id/edit" element={<AdminRoute><AdminInstrumentForm /></AdminRoute>} />
              <Route path="/admin/yearly-summary" element={<AdminRoute><AdminYearlySummary /></AdminRoute>} />
              <Route path="/admin/academic-years" element={<AdminRoute><AdminAcademicYears /></AdminRoute>} />
              <Route path="/admin/year-transition" element={<AdminRoute><AdminYearTransition /></AdminRoute>} />
              <Route path="/admin/registrations" element={<AdminRoute><AdminRegistrations /></AdminRoute>} />
              <Route path="/admin/registrations/:id" element={<AdminRoute><AdminRegistrationCard /></AdminRoute>} />
              <Route path="/admin/registrations/:id/convert" element={<AdminRoute><AdminRegistrationConvert /></AdminRoute>} />
              <Route path="/admin/registration-settings" element={<AdminRoute><AdminRegistrationSettings /></AdminRoute>} />
              <Route path="/admin/registration-pages" element={<AdminRoute><AdminRegistrationPages /></AdminRoute>} />
              <Route path="/admin/registration-pages/:pageId" element={<AdminRoute><AdminRegistrationPageEditor /></AdminRoute>} />
              <Route path="/admin/exports" element={<AdminRoute><AdminExports /></AdminRoute>} />
              <Route path="/admin/ensembles" element={<AdminRoute><AdminEnsembles /></AdminRoute>} />
              <Route path="/admin/ensembles/new" element={<AdminRoute><AdminEnsembleForm /></AdminRoute>} />
              <Route path="/admin/ensembles/:id" element={<AdminRoute><AdminEnsembleCard /></AdminRoute>} />
              <Route path="/admin/ensembles/:id/edit" element={<AdminRoute><AdminEnsembleForm /></AdminRoute>} />
              {/* Public */}
              <Route path="/register" element={<PublicRegistration />} />
              {/* Teacher routes */}
              <Route path="/teacher" element={<TeacherRoute><TeacherDashboard /></TeacherRoute>} />
              <Route path="/teacher/students" element={<TeacherRoute><TeacherStudents /></TeacherRoute>} />
              <Route path="/teacher/students/:enrollmentId" element={<TeacherRoute><TeacherStudentCard /></TeacherRoute>} />
              <Route path="/teacher/reports" element={<TeacherRoute><TeacherReports /></TeacherRoute>} />
              <Route path="/teacher/reports/new" element={<TeacherRoute><TeacherNewReport /></TeacherRoute>} />
              <Route path="/teacher/reports/:reportId" element={<TeacherRoute><TeacherReportView /></TeacherRoute>} />
              <Route path="/teacher/reports/:reportId/edit" element={<TeacherRoute><TeacherEditReport /></TeacherRoute>} />
              <Route path="/teacher/change-password" element={<TeacherRoute><TeacherChangePassword /></TeacherRoute>} />
              <Route path="/teacher/yearly-summary" element={<TeacherRoute><TeacherYearlySummary /></TeacherRoute>} />
              <Route path="/teacher/travel-summary" element={<TeacherRoute><TeacherTravelSummary /></TeacherRoute>} />
              <Route path="/teacher/ensembles" element={<TeacherRoute><TeacherEnsembles /></TeacherRoute>} />
              <Route path="/teacher/ensembles/:id" element={<TeacherRoute><TeacherEnsembleCard /></TeacherRoute>} />
              <Route path="/teacher/ensembles/:id/students/:studentId" element={<TeacherRoute><TeacherEnsembleStudentCard /></TeacherRoute>} />
              {/* Secretary */}
              <Route path="/secretary" element={<ProtectedRoute allowedRoles={["secretary"]}><SecretaryDashboard /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AcademicYearProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
