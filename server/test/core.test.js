import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLead, parseMoney, normalizeTimeline } from '../src/utils/normalize.js';
import { parseCsv, toCsv } from '../src/utils/csv.js';
import { canTransition, transition, statusAfterUnderwriting } from '../src/services/stateMachine.js';
import { heuristicUnderwrite, computeOfferRange, extractDefects } from '../src/services/heuristics.js';

const fakeLead = (status = 'Inbound') => ({ status, timeline: [] });

test('parseMoney handles common formats', () => {
  assert.equal(parseMoney('$1,250,000'), 1250000);
  assert.equal(parseMoney('350k'), 350000);
  assert.equal(parseMoney('1.2M'), 1200000);
  assert.equal(parseMoney(99000), 99000);
  assert.equal(parseMoney('abc'), undefined);
  assert.equal(parseMoney('-5'), undefined);
});

test('normalizeLead maps aliases and validates', () => {
  const { data, errors } = normalizeLead({ address: '  123 main st,  springfield, il 62701 ', price: '$200k', email: 'A@B.COM', timeline: 'need to sell asap', notes: '<b>roof</b> leaks' });
  assert.deepEqual(errors, []);
  assert.equal(data.property_address, '123 Main St, Springfield, IL 62701');
  assert.equal(data.asking_price, 200000);
  assert.equal(data.seller_email, 'a@b.com');
  assert.equal(data.seller_timeline, 'ASAP');
  assert.equal(data.property_condition, 'roof leaks');
  assert.ok(normalizeLead({}).errors.includes('property_address is required'));
  assert.ok(normalizeLead({ address: '1 Long Road X', email: 'bad' }).errors.some((e) => e.includes('email')));
  assert.equal(normalizeTimeline('within 30 days please'), 'Within 30 days');
});

test('CSV parser handles quotes, commas and newlines', () => {
  const { headers, records } = parseCsv('Property Address,Asking Price,Notes\r\n"1 A St, Town",100000,"says ""hi""\nline2"\r\n\r\n2 B St,5000,ok');
  assert.deepEqual(headers, ['property_address', 'asking_price', 'notes']);
  assert.equal(records.length, 2);
  assert.equal(records[0].property_address, '1 A St, Town');
  assert.equal(records[0].notes, 'says "hi"\nline2');
  const out = toCsv([{ a: 'x,y', b: 1 }], [{ key: 'a' }, { key: 'b' }]);
  assert.equal(out, 'a,b\r\n"x,y",1');
});

test('state machine enforces legal transitions', () => {
  assert.ok(canTransition('Inbound', 'Underwritten'));
  assert.ok(!canTransition('Inbound', 'Outreach Sent'));
  const lead = fakeLead();
  transition(lead, 'Underwritten');
  transition(lead, 'Offer Drafted');
  assert.equal(lead.status, 'Offer Drafted');
  assert.equal(lead.timeline.length, 2);
  assert.throws(() => transition(lead, 'Inbound'), /Invalid status transition/);
  assert.throws(() => transition(lead, 'Inbound', { override: true }), /reason is required/);
  transition(lead, 'Inbound', { override: true, reason: 'test' });
  assert.equal(lead.timeline.at(-1).type, 'override');
  assert.equal(statusAfterUnderwriting(70, 70), 'Offer Drafted');
  assert.equal(statusAfterUnderwriting(69, 70), 'Underwritten');
});

test('heuristic underwriting is internally consistent', () => {
  const r = heuristicUnderwrite({ property_address: 'x', asking_price: 150000, square_feet: 1800, seller_timeline: 'ASAP', property_condition: 'Inherited, roof leaks, HVAC broken, outdated kitchen', seller_email: 'a@b.co' });
  assert.ok(r.viability_score >= 0 && r.viability_score <= 100);
  assert.ok(r.defects.length >= 3);
  assert.ok(r.estimated_offer_min <= r.estimated_offer_max);
  assert.ok(r.estimated_offer_max <= 150000);
  const good = heuristicUnderwrite({ property_address: 'y', asking_price: 700000, seller_timeline: 'Flexible', property_condition: 'Excellent condition, like new' });
  assert.ok(good.viability_score < r.viability_score);
  assert.deepEqual(computeOfferRange({ arv: 0 }), { min: null, max: null });
  assert.equal(extractDefects('').length, 0);
});
