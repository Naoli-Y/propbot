// Pure (DB-free) helpers for the seller-facing view — unit tested.

export const TOKEN_RE = /^[A-Za-z0-9_-]{24,64}$/;
export const referenceFor = (lead) => String(lead._id).slice(-8).toUpperCase();

/** Maps the internal pipeline to the simple stages a seller sees. */
export function sellerStage(lead) {
  const response = lead.seller_response?.status;
  if (response === 'accepted') return 'accepted';
  if (response === 'declined') return 'declined';
  if (lead.status === 'Dead') return 'closed';
  if (lead.status === 'Outreach Sent') return response === 'countered' ? 'countered' : 'offer_ready';
  if (lead.status === 'Inbound') return 'received';
  return 'review';
}

const STAGE_COPY = {
  received: { title: 'We received your property', body: 'Our team is reviewing the details you sent.' },
  review: { title: 'Your property is under review', body: 'We are preparing a fair cash offer. This usually takes less than one business day.' },
  offer_ready: { title: 'Your cash offer is ready', body: 'Review the offer below and let us know how you would like to proceed.' },
  countered: { title: 'We received your counter-offer', body: 'Our team is reviewing your number and will get back to you shortly.' },
  accepted: { title: 'You accepted our offer', body: 'Congratulations! We will contact you within one business day to schedule a walkthrough and start closing.' },
  declined: { title: 'You declined our offer', body: 'Thank you for considering us. If anything changes, just reply to our email.' },
  closed: { title: 'This request is closed', body: 'We are not able to make an offer on this property right now. Thank you for reaching out.' },
};

/** Seller-safe view of a lead — no scores, AI reasoning, margins or internal notes. */
export function publicView(lead, { company } = {}) {
  const stage = sellerStage(lead);
  const hasOffer = ['offer_ready', 'countered', 'accepted', 'declined'].includes(stage) && lead.approved_offer;
  const offerEmail = (lead.outreach || []).filter((o) => o.kind === 'cash_offer' && o.status !== 'failed').at(-1);
  const r = lead.seller_response;
  return {
    reference: referenceFor(lead),
    company,
    stage,
    stage_title: STAGE_COPY[stage].title,
    stage_body: STAGE_COPY[stage].body,
    steps: [
      { key: 'received', label: 'Submitted', done: true },
      { key: 'review', label: 'Under review', done: stage !== 'received' },
      { key: 'offer', label: 'Offer ready', done: Boolean(hasOffer) },
      { key: 'decision', label: 'Your decision', done: ['accepted', 'declined'].includes(stage) },
    ],
    property: {
      address: lead.property_address,
      property_type: lead.property_type,
      bedrooms: lead.bedrooms,
      bathrooms: lead.bathrooms,
      square_feet: lead.square_feet,
    },
    seller_first_name: lead.seller_name ? String(lead.seller_name).trim().split(/\s+/)[0] : null,
    submitted_at: lead.created_at,
    offer: hasOffer
      ? {
          amount: lead.approved_offer,
          sent_at: offerEmail?.sent_at || lead.status_changed_at,
          terms: ['All-cash purchase — no bank financing contingency', 'Buy as-is: no repairs or cleaning needed', 'No agent commissions or listing fees', 'You choose the closing date'],
        }
      : null,
    can_respond: stage === 'offer_ready' || stage === 'countered',
    response: r && r.status !== 'pending'
      ? { status: r.status, counter_offer: r.counter_offer, message: r.message, responded_at: r.responded_at }
      : null,
    history: (lead.seller_responses || []).filter((x) => x.status !== 'pending').map((x) => ({
      status: x.status, counter_offer: x.counter_offer, offer_amount: x.offer_amount, message: x.message, responded_at: x.responded_at,
    })),
  };
}
