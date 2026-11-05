import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Layout from './components/Layout.jsx';
import { PageLoader } from './components/ui.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Pipeline from './pages/Pipeline.jsx';
import Leads from './pages/Leads.jsx';
import LeadPage from './pages/LeadPage.jsx';
import NewLead from './pages/NewLead.jsx';
import ImportLeads from './pages/ImportLeads.jsx';
import Settings from './pages/Settings.jsx';

function Protected({ children, write }) {
  const { user, loading, canWrite } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><PageLoader /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (write && !canWrite) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Dashboard />} />
        <Route path="pipeline" element={<Pipeline />} />
        <Route path="leads" element={<Leads />} />
        <Route path="leads/new" element={<Protected write><NewLead /></Protected>} />
        <Route path="leads/:id" element={<LeadPage />} />
        <Route path="import" element={<Protected write><ImportLeads /></Protected>} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
