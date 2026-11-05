// Data normalization for raw seller inputs coming from forms, webhooks and CSV files.
// Different sources name fields differently, so we accept common aliases.

const ALIASES = {
  property_address: ['property_address', 'address', 'propertyAddress', 'street_address', 'full_address', 'location'],
  seller_name: ['seller_name', 'sellerName', 'name', 'owner', 'owner_name', 'contact_name', 'full_name'],
  seller_email: ['seller_email', 'sellerEmail', 'email', 'contact_email', 'owner_email'],
  seller_phone: ['seller_phone', 'sellerPhone', 'phone', 'phone_number', 'contact_phone', 'mobile'],
  asking_price: ['asking_price', 'askingPrice', 'price', 'list_price', 'listing_price', 'asking'],
  property_condition: ['property_condition', 'propertyCondition', 'condition', 'condition_notes', 'description', 'notes'],
  seller_timeline: ['seller_timeline', 'sellerTimeline', 'timeline', 'timeframe', 'move_timeline'],
  property_type: ['property_type', 'propertyType', 'type'],
  bedrooms: ['bedrooms', 'beds', 'br'],
  bathrooms: ['bathrooms', 'baths', 'ba'],
  square_feet: ['square_feet', 'squareFeet', 'sqft', 'sq_ft', 'living_area'],
  year_built: ['year_built', 'yearBuilt', 'built'],
  source: ['source', 'lead_source', 'channel'],
};

const pick = (raw, keys) => {
  for (const k of keys) {
    if (raw[k] !== undefined && raw[k] !== null && String(raw[k]).trim() !== '') return raw[k];
    const lower = Object.keys(raw).find((rk) => rk.toLowerCase() === k.toLowerCase());
    if (lower && raw[lower] !== undefined && String(raw[lower]).trim() !== '') return raw[lower];
  }
  return undefined;
};

// Strip control characters and HTML tags, collapse whitespace, cap length.
export function cleanString(v, max = 2000) {
  if (v === undefined || v === null) return undefined;
  const s = String(v)
    .replace(/<[^>]*>/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
  return s ? s.slice(0, max) : undefined;
}

// "$1,250,000", "350k", "1.2M" -> number
export function parseMoney(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : undefined;
  let s = String(v).trim().toLowerCase().replace(/[$,\s]|usd/g, '');
  let mult = 1;
  if (s.endsWith('k')) { mult = 1e3; s = s.slice(0, -1); }
  else if (s.endsWith('m')) { mult = 1e6; s = s.slice(0, -1); }
  const n = parseFloat(s) * mult;
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
}

const parseNum = (v) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : undefined;
};

const titleCase = (s) => s.replace(/\b([a-z])/g, (m) => m.toUpperCase());

export function normalizeAddress(v) {
  const s = cleanString(v, 300);
  if (!s) return undefined;
  return titleCase(s.replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').toLowerCase())
    .replace(/\b(Ne|Nw|Se|Sw|Po)\b/g, (m) => m.toUpperCase())
    .replace(/\b([A-Z][a-z])(\s+\d{5}(-\d{4})?)$/, (_, st, zip) => st.toUpperCase() + zip);
}

const TIMELINES = [
  { re: /(asap|immediate|urgent|right away|this week|now|7 days)/i, label: 'ASAP' },
  { re: /(30 days|1 month|one month|this month|few weeks)/i, label: 'Within 30 days' },
  { re: /(60|90 days|2-3 months|two months|three months|1-3 months)/i, label: '1-3 months' },
  { re: /(6 months|six months|3-6 months|this year)/i, label: '3-6 months' },
  { re: /(flexible|no rush|whenever|not sure|undecided)/i, label: 'Flexible' },
];

export function normalizeTimeline(v) {
  const s = cleanString(v, 200);
  if (!s) return undefined;
  const hit = TIMELINES.find((t) => t.re.test(s));
  return hit ? hit.label : s;
}

export function normalizeEmail(v) {
  const s = cleanString(v, 254);
  if (!s) return undefined;
  const e = s.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : undefined;
}

export function normalizePhone(v) {
  const s = cleanString(v, 40);
  if (!s) return undefined;
  const digits = s.replace(/[^\d+]/g, '');
  return digits.length >= 7 ? digits : undefined;
}

/**
 * Turns an arbitrary payload into a clean lead object.
 * Returns { data, errors } — errors is a list of human-readable validation problems.
 */
export function normalizeLead(raw = {}, { defaultSource = 'manual' } = {}) {
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { data: null, errors: ['Payload must be a JSON object'] };

  const data = {
    property_address: normalizeAddress(pick(raw, ALIASES.property_address)),
    seller_name: cleanString(pick(raw, ALIASES.seller_name), 120),
    seller_email: normalizeEmail(pick(raw, ALIASES.seller_email)),
    seller_phone: normalizePhone(pick(raw, ALIASES.seller_phone)),
    asking_price: parseMoney(pick(raw, ALIASES.asking_price)),
    property_condition: cleanString(pick(raw, ALIASES.property_condition), 4000),
    seller_timeline: normalizeTimeline(pick(raw, ALIASES.seller_timeline)),
    property_type: cleanString(pick(raw, ALIASES.property_type), 60),
    bedrooms: parseNum(pick(raw, ALIASES.bedrooms)),
    bathrooms: parseNum(pick(raw, ALIASES.bathrooms)),
    square_feet: parseNum(pick(raw, ALIASES.square_feet)),
    year_built: parseNum(pick(raw, ALIASES.year_built)),
    source: cleanString(pick(raw, ALIASES.source), 60) || defaultSource,
  };

  if (!data.property_address || data.property_address.length < 5) errors.push('property_address is required');
  const rawPrice = pick(raw, ALIASES.asking_price);
  if (rawPrice !== undefined && data.asking_price === undefined) errors.push('asking_price must be a positive number');
  if (data.asking_price !== undefined && data.asking_price > 1e9) errors.push('asking_price is unrealistically high');
  const rawEmail = pick(raw, ALIASES.seller_email);
  if (rawEmail !== undefined && !data.seller_email) errors.push('seller_email is not a valid email address');
  if (data.year_built && (data.year_built < 1700 || data.year_built > new Date().getFullYear() + 2)) data.year_built = undefined;

  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return { data, errors };
}
