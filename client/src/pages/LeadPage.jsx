import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import LeadDetail from '../components/LeadDetail.jsx';

export default function LeadPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  return (
    <div>
      <Link to="/leads" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" />All leads</Link>
      <div className="-mx-4 overflow-hidden bg-paper sm:mx-0 sm:rounded-2xl sm:border sm:border-line">
        <LeadDetail id={id} onDeleted={() => navigate('/leads', { replace: true })} />
      </div>
    </div>
  );
}
