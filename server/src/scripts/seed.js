// Seeds demo leads (no external API calls — uses the heuristic engine and preset coordinates).
// Usage: npm run seed            (adds demo leads)
//        npm run seed -- --reset (deletes ALL leads first)
import { connectDB, disconnectDB } from '../config/db.js';
import { env } from '../config/env.js';
import { Lead } from '../models/Lead.js';
import { heuristicUnderwrite } from '../services/heuristics.js';
import { transition, statusAfterUnderwriting } from '../services/stateMachine.js';
import { normalizeLead } from '../utils/normalize.js';
import { ensureAdminUser } from './bootstrap.js';
import { ensureRoles, ensureSuperAdmin } from '../services/rbac.js';
import { User } from '../models/User.js';
import { newPortalToken } from '../services/portal.js';

const SAMPLES = [
  { address: '4521 Magnolia Ave, Memphis, TN 38117', lat: 35.1055, lon: -89.9062, seller_name: 'Linda Carter', email: 'linda.carter@example.com', price: 145000, sqft: 1820, beds: 3, baths: 2, year: 1968, timeline: 'ASAP', condition: 'Inherited property, vacant for a year. Roof leaks in two bedrooms, HVAC does not work, outdated kitchen and bathrooms. Selling as-is.', end: 'Awaiting Approval', days: 3 },
  { address: '918 W Grace St, Richmond, VA 23220', lat: 37.5503, lon: -77.4515, seller_name: 'Marcus Webb', email: 'mwebb@example.com', price: 265000, sqft: 1500, beds: 3, baths: 1, year: 1925, timeline: '1-3 months', condition: 'Tired landlord, bad tenant moving out. Needs paint, carpet and some plumbing work under the kitchen sink.', end: 'Offer Drafted', days: 1 },
  { address: '2207 Elm St, Dallas, TX 75201', lat: 32.7826, lon: -96.7896, seller_name: 'Priya Natarajan', email: 'priya.n@example.com', price: 410000, sqft: 2100, beds: 4, baths: 3, year: 2004, timeline: 'Flexible', condition: 'Move-in ready, renovated kitchen in 2021, new roof.', end: 'Underwritten', days: 6 },
  { address: '77 Brook Rd, Cleveland, OH 44105', lat: 41.4489, lon: -81.6246, seller_name: 'Tom Kowalski', email: 'tkowalski@example.com', price: 62000, sqft: 1100, beds: 2, baths: 1, year: 1941, timeline: 'Within 30 days', condition: 'Foundation cracks in the basement, water damage and some mold, old knob and tube wiring. Behind on payments.', end: 'Outreach Sent', days: 9, response: 'countered', web: true },
  { address: '3310 N Central Ave, Phoenix, AZ 85012', lat: 33.4886, lon: -112.0738, seller_name: 'Angela Ruiz', email: 'angela.ruiz@example.com', price: 330000, sqft: 1650, beds: 3, baths: 2, year: 1979, timeline: '3-6 months', condition: 'AC unit is 18 years old, dated bathrooms, windows need replacement.', end: 'Underwritten', days: 12 },
  { address: '15 Pine Hollow Ln, Birmingham, AL 35210', lat: 33.5367, lon: -86.6851, seller_name: 'Derek Simmons', email: 'derek.s@example.com', price: 98000, sqft: 1400, beds: 3, baths: 2, year: 1972, timeline: 'ASAP', condition: 'Divorce, must sell quickly. Termite damage on the back porch, roof is old, flooring needs replacing.', end: 'Offer Drafted', days: 4, stale: true },
  { address: '600 E Market St, Indianapolis, IN 46204', lat: 39.7686, lon: -86.1499, seller_name: 'Grace Liu', email: 'grace.liu@example.com', price: 189000, sqft: 1300, beds: 2, baths: 2, year: 1988, timeline: '1-3 months', condition: 'Fair condition, cosmetic updates needed.', end: 'Underwritten', days: 2 },
  { address: '1402 Bayshore Blvd, Tampa, FL 33606', lat: 27.9283, lon: -82.4836, seller_name: 'Robert Hale', email: 'rhale@example.com', price: 720000, sqft: 2600, beds: 4, baths: 3, year: 1995, timeline: 'Flexible', condition: 'Excellent condition, like new.', end: 'Dead', days: 15 },
  { address: '58 Chestnut St, Rochester, NY 14604', lat: 43.1545, lon: -77.6044, seller_name: 'Nina Patel', email: 'nina.patel@example.com', price: 79000, sqft: 1250, beds: 3, baths: 1, year: 1910, timeline: 'Within 30 days', condition: 'Estate sale. Fire damage in the kitchen, smoke damage throughout, electrical panel needs replacement.', end: 'Awaiting Approval', days: 5, stale: true },
  { address: '2840 Fulton St, Denver, CO 80238', lat: 39.7593, lon: -104.8836, seller_name: 'Chris Morgan', price: 455000, sqft: 1900, beds: 3, baths: 2, year: 2010, timeline: 'Not sure', condition: '', end: 'Inbound', days: 0 },
  { address: '411 Oak Grove Dr, Jackson, MS 39206', lat: 32.3655, lon: -90.1732, seller_name: 'Shirley Brooks', email: 'sbrooks@example.com', price: 54000, sqft: 1150, beds: 2, baths: 1, year: 1960, timeline: 'ASAP', condition: 'Vacant, code violations, roof damage after storm, sewer line issue.', end: 'Awaiting Approval', days: 0, web: true },
  { address: '9020 Lakeview Ter, Kansas City, MO 64114', lat: 38.9586, lon: -94.5953, seller_name: 'Ethan Brooks', email: 'ebrooks@example.com', price: 238000, sqft: 1720, beds: 3, baths: 2, year: 1983, timeline: '1-3 months', condition: 'Relocating for job transfer. Furnace is old, outdated kitchen.', end: 'Outreach Sent', days: 7, response: 'accepted' },
];

const ORDER = ['Inbound', 'Underwritten', 'Offer Drafted', 'Awaiting Approval', 'Outreach Sent'];

await connectDB({ retries: 2 });
await ensureRoles();
await ensureAdminUser();
await ensureSuperAdmin();
// Demo investor account for the Investor desk.
if (!(await User.exists({ email: 'investor@propbot.local' }))) {
  const investor = new User({ name: 'Demo Investor', email: 'investor@propbot.local', role: 'investor' });
  await investor.setPassword(env.adminPassword);
  await investor.save();
  console.log(`Created investor user investor@propbot.local (password: same as ADMIN_PASSWORD)`);
}

if (process.argv.includes('--reset')) {
  const r = await Lead.deleteMany({});
  console.log(`Deleted ${r.deletedCount} existing leads`);
}

let created = 0;
for (const s of SAMPLES) {
  const { data } = normalizeLead({
    property_address: s.address, seller_name: s.seller_name, seller_email: s.email, asking_price: s.price,
    property_condition: s.condition, seller_timeline: s.timeline, square_feet: s.sqft, bedrooms: s.beds,
    bathrooms: s.baths, year_built: s.year, property_type: 'Single Family', source: s.web ? 'website' : 'demo-seed',
  });
  const createdAt = new Date(Date.now() - s.days * 86400000 - Math.random() * 6 * 3600000);
  const lead = new Lead({ ...data, status: 'Inbound', created_at: createdAt, portal_token: newPortalToken(), tags: s.web ? ['website'] : [] });
  lead.timeline.push({ type: 'created', actor: 'seed', message: 'Demo lead created', at: createdAt });

  if (s.end !== 'Inbound') {
    Object.assign(lead, { latitude: s.lat, longitude: s.lon, formatted_address: s.address, geocode_status: 'ok' });
    const uw = heuristicUnderwrite(lead);
    Object.assign(lead, {
      viability_score: uw.viability_score, estimated_market_value: uw.estimated_market_value, after_repair_value: uw.after_repair_value,
      estimated_repair_cost: uw.estimated_repair_cost, estimated_offer_min: uw.estimated_offer_min, estimated_offer_max: uw.estimated_offer_max,
      defects: uw.defects, ai_reasoning: uw.ai_reasoning.replace('Rules-based underwriting (AI engine unavailable)', 'Demo underwriting'),
      ai_confidence: uw.ai_confidence, underwriting_engine: 'heuristic', underwriting_status: 'ok', underwritten_at: createdAt,
      processing_ms: 400 + Math.round(Math.random() * 1800),
    });
    lead.timeline.push({ type: 'underwritten', actor: 'heuristic-engine', message: `Viability ${uw.viability_score}/100`, at: createdAt });

    const target = s.end;
    if (target === 'Dead') {
      transition(lead, 'Underwritten', { actor: 'seed' });
      transition(lead, 'Dead', { actor: 'seed', reason: 'Asking price far above investment criteria' });
    } else {
      const initial = statusAfterUnderwriting(uw.viability_score, env.rules.viabilityThreshold);
      transition(lead, 'Underwritten', { actor: 'seed' });
      const want = ORDER.indexOf(target);
      if (want >= 2) {
        transition(lead, 'Offer Drafted', { actor: 'seed', reason: initial === 'Offer Drafted' ? 'Score above threshold' : 'Manually drafted by acquisition manager' });
        if (want >= 3) transition(lead, 'Awaiting Approval', { actor: 'seed', reason: 'Submitted for investor approval' });
        if (want >= 4) {
          lead.approved_offer = lead.estimated_offer_max;
          lead.outreach.push({ kind: 'cash_offer', to: lead.seller_email, subject: `Your cash offer for ${lead.property_address}`, body: 'Demo outreach', status: 'simulated', sent_by: 'seed', sent_at: createdAt });
          transition(lead, 'Outreach Sent', { actor: 'seed', reason: 'Offer approved and sent' });
          lead.seller_response = { status: 'pending', offer_amount: lead.approved_offer };
          if (s.response) {
            const entry = {
              status: s.response,
              offer_amount: lead.approved_offer,
              counter_offer: s.response === 'countered' ? Math.round((lead.approved_offer * 1.12) / 1000) * 1000 : undefined,
              message: s.response === 'countered' ? 'I appreciate the offer. I could do it at this price if we close within 3 weeks.' : 'Sounds good — let us move forward.',
              responded_at: new Date(createdAt.getTime() + 86400000),
            };
            lead.seller_response = entry;
            lead.seller_responses.push(entry);
            lead.timeline.push({ type: 'seller_response', actor: 'seller', message: `Seller ${entry.status} the offer`, at: entry.responded_at });
          }
        }
      }
    }
    lead.status_changed_at = s.stale ? new Date(Date.now() - (env.rules.staleLeadHours + 24) * 3600000) : createdAt;
    lead.is_stale = Boolean(s.stale);
  }
  await lead.save();
  created++;
}

console.log(`Seeded ${created} demo leads`);
await disconnectDB();
