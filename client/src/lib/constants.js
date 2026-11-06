export const STAGES = ['Inbound', 'Underwritten', 'Offer Drafted', 'Awaiting Approval', 'Outreach Sent'];
export const ALL_STATUSES = [...STAGES, 'Dead'];

export const STATUS_STYLE = {
  Inbound: { dot: 'bg-slate-400', pill: 'bg-slate-100 text-slate-700 ring-slate-200', bar: 'bg-slate-400' },
  Underwritten: { dot: 'bg-sky-500', pill: 'bg-sky-50 text-sky-800 ring-sky-200', bar: 'bg-sky-500' },
  'Offer Drafted': { dot: 'bg-violet-500', pill: 'bg-violet-50 text-violet-800 ring-violet-200', bar: 'bg-violet-500' },
  'Awaiting Approval': { dot: 'bg-ember-500', pill: 'bg-ember-50 text-ember-700 ring-ember-100', bar: 'bg-ember-500' },
  'Outreach Sent': { dot: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200', bar: 'bg-emerald-500' },
  Dead: { dot: 'bg-rose-400', pill: 'bg-rose-50 text-rose-700 ring-rose-200', bar: 'bg-rose-400' },
};

export const STAGE_HINT = {
  Inbound: 'Raw lead received',
  Underwritten: 'AI processed and scored',
  'Offer Drafted': 'Initial cash offer generated',
  'Awaiting Approval': 'Pending investor review',
  'Outreach Sent': 'Offer dispatched to seller',
  Dead: 'Disqualified or lost',
};

// Mirrors the server state machine (server is the source of truth).
export const TRANSITIONS = {
  Inbound: ['Underwritten', 'Offer Drafted', 'Dead'],
  Underwritten: ['Offer Drafted', 'Inbound', 'Dead'],
  'Offer Drafted': ['Awaiting Approval', 'Underwritten', 'Dead'],
  'Awaiting Approval': ['Outreach Sent', 'Offer Drafted', 'Dead'],
  'Outreach Sent': ['Awaiting Approval', 'Dead'],
  Dead: ['Inbound'],
};

export const SEVERITY_STYLE = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-amber-50 text-amber-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

export const TIMELINE_OPTIONS = ['ASAP', 'Within 30 days', '1-3 months', '3-6 months', 'Flexible'];
export const PROPERTY_TYPES = ['Single Family', 'Multi-Family', 'Condo', 'Townhouse', 'Mobile Home', 'Land', 'Other'];

export const RESPONSE_STYLE = {
  pending: { label: 'Awaiting seller', cls: 'bg-slate-100 text-slate-600' },
  accepted: { label: 'Seller accepted', cls: 'bg-emerald-100 text-emerald-800' },
  countered: { label: 'Seller countered', cls: 'bg-ember-100 text-ember-700' },
  declined: { label: 'Seller declined', cls: 'bg-rose-100 text-rose-700' },
};
