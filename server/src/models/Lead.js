import mongoose from 'mongoose';
import { STATUSES } from '../services/stateMachine.js';

const { Schema } = mongoose;

const TimelineEventSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['created', 'geocoded', 'underwritten', 'status_change', 'override', 'outreach', 'note', 'error', 'edit', 'stale_flag', 'seller_response', 'decision'],
      required: true,
    },
    actor: { type: String, default: 'system' },
    from: String,
    to: String,
    message: String,
    meta: Schema.Types.Mixed,
    at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const DefectSchema = new Schema(
  {
    item: String,
    severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    estimated_repair_cost: Number,
  },
  { _id: false }
);

const OutreachSchema = new Schema(
  {
    channel: { type: String, enum: ['email'], default: 'email' },
    kind: { type: String, enum: ['cash_offer', 'clarification', 'follow_up'], default: 'cash_offer' },
    to: String,
    subject: String,
    body: String,
    provider_message_id: String,
    status: { type: String, enum: ['sent', 'failed', 'simulated'], default: 'sent' },
    error: String,
    sent_by: String,
    sent_at: { type: Date, default: Date.now },
  },
  { _id: true }
);

// Seller's reply to an offer, submitted through the seller portal.
const SellerResponseSchema = new Schema(
  {
    status: { type: String, enum: ['pending', 'accepted', 'declined', 'countered'], default: 'pending' },
    offer_amount: Number,
    counter_offer: Number,
    message: String,
    responded_at: Date,
  },
  { _id: false }
);

const LeadSchema = new Schema(
  {
    // ── Seller inputs ─────────────────────────────
    property_address: { type: String, required: true, trim: true, maxlength: 300 },
    seller_name: { type: String, trim: true, maxlength: 120 },
    seller_email: { type: String, trim: true, lowercase: true, maxlength: 254 },
    seller_phone: { type: String, trim: true, maxlength: 40 },
    asking_price: { type: Number, min: 0 },
    property_condition: { type: String, maxlength: 4000 },
    seller_timeline: { type: String, maxlength: 200 },
    property_type: String,
    bedrooms: Number,
    bathrooms: Number,
    square_feet: Number,
    year_built: Number,
    source: { type: String, default: 'manual' },
    external_id: { type: String, trim: true },

    // ── Geocoding ─────────────────────────────────
    latitude: Number,
    longitude: Number,
    formatted_address: String,
    neighborhood: {
      suburb: String,
      city: String,
      county: String,
      state: String,
      postcode: String,
      country: String,
      place_rank: Number,
    },
    geocode_status: { type: String, enum: ['pending', 'ok', 'not_found', 'failed'], default: 'pending' },

    // ── AI underwriting ───────────────────────────
    viability_score: { type: Number, min: 0, max: 100 },
    estimated_market_value: Number,
    estimated_repair_cost: Number,
    after_repair_value: Number,
    estimated_offer_min: Number,
    estimated_offer_max: Number,
    defects: [DefectSchema],
    ai_reasoning: String,
    ai_confidence: { type: String, enum: ['low', 'medium', 'high'] },
    underwriting_engine: { type: String, enum: ['gemini', 'heuristic'] },
    underwriting_status: { type: String, enum: ['pending', 'ok', 'failed'], default: 'pending' },
    underwritten_at: Date,
    processing_ms: Number,

    // Investor-approved final offer (may differ from AI range after manual review)
    approved_offer: Number,

    // ── Pipeline ──────────────────────────────────
    status: { type: String, enum: STATUSES, default: 'Inbound', index: true },
    status_changed_at: { type: Date, default: Date.now },
    is_stale: { type: Boolean, default: false, index: true },
    priority: { type: String, enum: ['hot', 'warm', 'cold'], default: 'cold' },
    tags: [String],
    assigned_to: String,

    outreach: [OutreachSchema],
    timeline: [TimelineEventSchema],

    // ── Seller portal ─────────────────────────────
    // Secret token for the seller's private offer page (/offer/:token). Never returned by default.
    portal_token: { type: String, select: false },
    contact_consent: Boolean,
    seller_response: SellerResponseSchema,
    seller_responses: [SellerResponseSchema],
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      virtuals: true,
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        ret.reference = ret.id.slice(-8).toUpperCase();
        delete ret.__v;
        delete ret.portal_token;
        return ret;
      },
    },
  }
);

LeadSchema.virtual('spread').get(function spread() {
  if (!this.estimated_market_value || !this.asking_price) return null;
  return Math.round(((this.estimated_market_value - this.asking_price) / this.estimated_market_value) * 1000) / 10;
});

LeadSchema.index({ created_at: -1 });
LeadSchema.index({ portal_token: 1 }, { unique: true, sparse: true });
LeadSchema.index({ 'seller_response.status': 1 });
LeadSchema.index({ seller_email: 1 });
LeadSchema.index({ viability_score: -1 });
LeadSchema.index({ status: 1, status_changed_at: 1 });
LeadSchema.index({ external_id: 1, source: 1 }, { unique: true, partialFilterExpression: { external_id: { $type: 'string' } } });
LeadSchema.index({ property_address: 'text', seller_name: 'text', property_condition: 'text', seller_email: 'text' });

LeadSchema.pre('save', function setPriority(next) {
  const s = this.viability_score;
  if (typeof s === 'number') this.priority = s >= 70 ? 'hot' : s >= 45 ? 'warm' : 'cold';
  next();
});

export const Lead = mongoose.model('Lead', LeadSchema);
