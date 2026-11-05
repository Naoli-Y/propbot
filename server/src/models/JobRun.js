import mongoose from 'mongoose';

// Execution log for scheduled jobs (pipeline audits, digests) triggered by Cloud Scheduler or manually.
const JobRunSchema = new mongoose.Schema(
  {
    job: { type: String, required: true, index: true },
    trigger: { type: String, enum: ['scheduler', 'manual'], default: 'scheduler' },
    triggered_by: String,
    status: { type: String, enum: ['running', 'success', 'failed'], default: 'running' },
    result: mongoose.Schema.Types.Mixed,
    error: String,
    started_at: { type: Date, default: Date.now },
    finished_at: Date,
    duration_ms: Number,
  },
  { toJSON: { transform: (_d, r) => { r.id = r._id.toString(); delete r.__v; return r; } } }
);

JobRunSchema.index({ started_at: -1 });

export const JobRun = mongoose.model('JobRun', JobRunSchema);
