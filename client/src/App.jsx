import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AppLayout from "./components/layout/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import ApplicantForm from "./pages/ApplicantForm";
import AuditLogs from "./pages/AuditLogs";
import Dashboard from "./pages/Dashboard";
import DecisionDetail from "./pages/DecisionDetail";
import Login from "./pages/Login";
import MyApplications from "./pages/MyApplications";
import NotFound from "./pages/NotFound";
import Register from "./pages/Register";
import ReviewQueue from "./pages/ReviewQueue";
import Users from "./pages/Users";
import { Loader } from "./components/ui/Feedback";
import { homeFor } from "./utils/routing";

// Chart-heavy pages are split into their own bundles
const ModelInsights = lazy(() => import("./pages/ModelInsights"));
const FairnessReport = lazy(() => import("./pages/FairnessReport"));

function Home() {
  const { user } = useAuth();
  return <Navigate to={homeFor(user)} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Loader />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="apply" element={<ApplicantForm />} />
          <Route path="decisions/:id" element={<DecisionDetail />} />
          <Route path="model-insights" element={<ModelInsights />} />

          <Route element={<ProtectedRoute roles={["applicant"]} />}>
            <Route path="my-applications" element={<MyApplications />} />
          </Route>
          <Route element={<ProtectedRoute roles={["loan_officer", "admin"]} />}>
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="review" element={<ReviewQueue />} />
          </Route>
          <Route element={<ProtectedRoute roles={["admin"]} />}>
            <Route path="fairness" element={<FairnessReport />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="users" element={<Users />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
    </Suspense>
  );
}
