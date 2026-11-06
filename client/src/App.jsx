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
import InvestorDesk from './pages/InvestorDesk.jsx';
import SellLanding from './pages/public/SellLanding.jsx';
import SellerPortal from './pages/public/SellerPortal.jsx';
import OfferLookup from './pages/public/OfferLookup.jsx';

function Protected({ children, perm }) {
  const { user, loading, can, homePath } = useAuth();
  const location = useLocation();
  if (loading) return <div className="flex min-h-screen items-center justify-center"><PageLoader /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (perm && !can(...[].concat(perm))) return location.pathname === homePath ? <NoAccess /> : <Navigate to={homePath} replace />;
  return children;
}

function NoAccess() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <h1 className="text-lg font-extrabold text-slate-900">You don’t have access to this page</h1>
      <p className="mt-2 text-sm text-slate-500">Ask your super admin to give your role the permission you need.</p>
    </div>
  );
}

function Home() {
  const { can, homePath } = useAuth();
  if (can('dashboard.view')) return <Dashboard />;
  return homePath === '/' ? <NoAccess /> : <Navigate to={homePath} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* Public website + seller portal (no login) */}
      <Route path="/sell" element={<SellLanding />} />
      <Route path="/offer" element={<OfferLookup />} />
      <Route path="/offer/:token" element={<SellerPortal />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route index element={<Home />} />
        <Route path="investor" element={<Protected perm="investor.view"><InvestorDesk /></Protected>} />
        <Route path="pipeline" element={<Protected perm="pipeline.view"><Pipeline /></Protected>} />
        <Route path="leads" element={<Protected perm="leads.view"><Leads /></Protected>} />
        <Route path="leads/new" element={<Protected perm="leads.create"><NewLead /></Protected>} />
        <Route path="leads/:id" element={<Protected perm={['leads.view', 'pipeline.view', 'investor.view']}><LeadPage /></Protected>} />
        <Route path="import" element={<Protected perm="leads.import"><ImportLeads /></Protected>} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
