import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NavBar } from "@/components/NavBar";
import { LoginPage } from "@/pages/LoginPage";
import { ApplicationsPage } from "@/pages/ApplicationsPage";
import { ApplicationDetailPage } from "@/pages/ApplicationDetailPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { DeletedApplicationsPage } from "@/pages/DeletedApplicationsPage";
import { Toaster } from "@/components/ui/sonner";

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <NavBar />
      <main>{children}</main>
    </div>
  );
}

function App() {
  const { isOwner, isLoading } = useAuth();

  return (
    <>
      <Routes>
        <Route
          path="/login"
          element={
            !isLoading && isOwner ? <Navigate to="/" replace /> : <LoginPage />
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ApplicationsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/applications/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ApplicationDetailPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <AppLayout>
                <DashboardPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/deleted"
          element={
            <ProtectedRoute>
              <AppLayout>
                <DeletedApplicationsPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}

export default App;
