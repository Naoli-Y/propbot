// ─── Permission catalog ─────────────────────────────────────
// Every permission maps to a page or action in the UI. The server checks these on
// every request; the dashboard uses the same keys to show or hide pages and buttons.
// Pure module (no imports) so it can be shared with tests.

export const PERMISSIONS = [
  // Pages
  { key: 'dashboard.view', group: 'Pages', label: 'Overview dashboard', description: 'See the Overview page with KPIs and charts' },
  { key: 'pipeline.view', group: 'Pages', label: 'Pipeline board', description: 'See the Kanban pipeline board' },
  { key: 'leads.view', group: 'Pages', label: 'All leads & lead details', description: 'See the leads table and open lead details' },
  { key: 'investor.view', group: 'Pages', label: 'Investor desk', description: 'See the Investor desk (approval queue and seller responses)' },
  { key: 'settings.view', group: 'Pages', label: 'Settings: integrations & website', description: 'See integration status, seller website links and webhook docs' },

  // Leads
  { key: 'leads.create', group: 'Leads', label: 'Create leads', description: 'Use the New lead form' },
  { key: 'leads.import', group: 'Leads', label: 'CSV import', description: 'Upload CSV lead lists' },
  { key: 'leads.export', group: 'Leads', label: 'Export CSV', description: 'Download leads as CSV' },
  { key: 'leads.edit', group: 'Leads', label: 'Edit leads', description: 'Change lead details (address, price, seller info…)' },
  { key: 'leads.delete', group: 'Leads', label: 'Delete leads', description: 'Permanently delete leads' },
  { key: 'leads.move', group: 'Leads', label: 'Move pipeline stage', description: 'Drag cards / change a lead’s stage, bulk move' },
  { key: 'leads.underwrite', group: 'Leads', label: 'Re-run underwriting', description: 'Re-run geocoding and AI scoring' },
  { key: 'leads.notes', group: 'Leads', label: 'Add notes', description: 'Add notes to a lead’s activity log' },
  { key: 'status.override', group: 'Leads', label: 'Force stage override', description: 'Bypass the state machine (with a logged reason)' },

  // Offers & outreach
  { key: 'offers.submit', group: 'Offers & outreach', label: 'Submit for approval', description: 'Move drafted offers to Awaiting Approval' },
  { key: 'offers.approve', group: 'Offers & outreach', label: 'Approve & send offers', description: 'Set the final amount and email the offer to the seller' },
  { key: 'offers.decide', group: 'Offers & outreach', label: 'Send back / reject offers', description: 'Return offers for rework or reject the deal' },
  { key: 'outreach.send', group: 'Offers & outreach', label: 'Email sellers', description: 'Send clarification and follow-up emails' },
  { key: 'portal.link', group: 'Offers & outreach', label: 'Copy seller portal link', description: 'Get the private link to a seller’s offer page' },

  // Administration
  { key: 'jobs.run', group: 'Administration', label: 'Run automation jobs', description: 'Run pipeline audit, digest and sweep jobs manually' },
  { key: 'settings.secrets', group: 'Administration', label: 'View API keys', description: 'See the full webhook API key in Settings' },
  { key: 'users.manage', group: 'Administration', label: 'Manage team', description: 'Add, deactivate and remove users, change their role and personal permissions' },
  { key: 'roles.manage', group: 'Administration', label: 'Manage roles & permissions', description: 'Create roles and change what each role can do' },
];

export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key);
export const isPermission = (k) => PERMISSION_KEYS.includes(k);

const VIEW_ALL = ['dashboard.view', 'pipeline.view', 'leads.view', 'settings.view'];

// Default roles — chosen to match the screens each role used before permissions became dynamic.
export const DEFAULT_ROLES = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Full access, including roles & permissions. Cannot be edited or removed.',
    permissions: PERMISSION_KEYS,
    locked: true,
  },
  {
    key: 'admin',
    name: 'Admin',
    description: 'Everything except changing role permissions.',
    permissions: PERMISSION_KEYS.filter((k) => k !== 'roles.manage'),
  },
  {
    key: 'manager',
    name: 'Acquisition Manager',
    description: 'Works leads end to end: create, import, underwrite, move, approve and email.',
    permissions: [
      ...VIEW_ALL, 'investor.view',
      'leads.create', 'leads.import', 'leads.export', 'leads.edit', 'leads.delete', 'leads.move', 'leads.underwrite', 'leads.notes',
      'offers.submit', 'offers.approve', 'offers.decide', 'outreach.send', 'portal.link', 'jobs.run',
    ],
  },
  {
    key: 'investor',
    name: 'Investor',
    description: 'Reviews deals on the Investor desk: approve, adjust, send back or reject offers.',
    permissions: ['investor.view', 'pipeline.view', 'leads.view', 'settings.view', 'offers.approve', 'offers.decide', 'portal.link'],
  },
  {
    key: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to dashboards and leads.',
    permissions: [...VIEW_ALL, 'leads.export'],
  },
];

export const SUPER_ADMIN = 'super_admin';

/** Effective permissions = (role permissions ∪ personal grants) − personal denies. Super admin always has everything. */
export function resolvePermissions(roleKey, rolePermissions = [], grants = [], denies = []) {
  if (roleKey === SUPER_ADMIN) return [...PERMISSION_KEYS];
  const set = new Set(rolePermissions.filter(isPermission));
  grants.filter(isPermission).forEach((p) => set.add(p));
  denies.forEach((p) => set.delete(p));
  return PERMISSION_KEYS.filter((k) => set.has(k));
}
