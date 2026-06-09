import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import Login from "./pages/Login";
import RoadmapList from "./pages/RoadmapList";
import RoadmapView from "./pages/RoadmapView";
import Users from "./pages/Users";
import Profile from "./pages/Profile";

function Protected({ children, adminOnly }: { children: any; adminOnly?: boolean }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div style={{ padding: 40, color: "#64748b" }}>Carregando…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Protected><RoadmapList /></Protected>} />
          <Route path="/roadmaps/:idSlug" element={<Protected><RoadmapView /></Protected>} />
          <Route path="/perfil" element={<Protected><Profile /></Protected>} />
          <Route path="/admin/users" element={<Protected adminOnly><Users /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
