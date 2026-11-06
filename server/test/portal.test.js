import test from 'node:test';
import assert from 'node:assert/strict';
import { publicView, sellerStage, TOKEN_RE, referenceFor } from '../src/services/portalView.js';

const base = { _id: '65f0c1a2b3c4d5e6f7a8b9c0', property_address: '1 Main St, Town, ST 00000', seller_name: 'Jane Q Seller', created_at: new Date('2026-01-02T03:04:05.000Z'), outreach: [], seller_responses: [] };

test('seller stage hides internal pipeline detail', () => {
  assert.equal(sellerStage({ ...base, status: 'Inbound' }), 'received');
  for (const s of ['Underwritten', 'Offer Drafted', 'Awaiting Approval']) assert.equal(sellerStage({ ...base, status: s }), 'review');
  assert.equal(sellerStage({ ...base, status: 'Outreach Sent' }), 'offer_ready');
  assert.equal(sellerStage({ ...base, status: 'Outreach Sent', seller_response: { status: 'countered' } }), 'countered');
  assert.equal(sellerStage({ ...base, status: 'Outreach Sent', seller_response: { status: 'accepted' } }), 'accepted');
  assert.equal(sellerStage({ ...base, status: 'Dead' }), 'closed');
});

test('public view never leaks scores or margins', () => {
  const lead = { ...base, status: 'Awaiting Approval', viability_score: 88, estimated_market_value: 300000, ai_reasoning: 'secret', approved_offer: 150000 };
  const v = publicView(lead, { company: 'Acme Homes' });
  const json = JSON.stringify({ ...v, submitted_at: null, reference: null });
  assert.ok(!json.includes('secret') && !json.includes('300000') && !json.includes('88'));
  assert.equal(v.offer, null, 'offer hidden until sent');
  assert.equal(v.can_respond, false);
  assert.equal(v.seller_first_name, 'Jane');
  assert.equal(v.reference, referenceFor(lead));
  const sent = publicView({ ...lead, status: 'Outreach Sent' }, { company: 'Acme Homes' });
  assert.equal(sent.offer.amount, 150000);
  assert.equal(sent.can_respond, true);
  assert.ok(TOKEN_RE.test('a'.repeat(32)) && !TOKEN_RE.test('../etc'));
});
