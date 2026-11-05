import { Lead } from '../models/Lead.js';
import { processLead } from './pipeline.js';
import { logger } from '../utils/logger.js';

// Minimal in-process FIFO used for bulk CSV imports. Leads are persisted as "Inbound"
// first, so nothing is lost if the instance stops — the /api/jobs/process-pending sweep
// (scheduled) picks up anything left unprocessed.
const queue = [];
let running = false;

export function enqueueLeads(ids, actor = 'csv-import') {
  queue.push(...ids.map((id) => ({ id: String(id), actor })));
  if (!running) drain();
}

async function drain() {
  running = true;
  while (queue.length) {
    const { id, actor } = queue.shift();
    try {
      const lead = await Lead.findById(id);
      if (!lead || lead.underwriting_status === 'ok') continue;
      await processLead(lead, { actor });
      await lead.save();
    } catch (err) {
      logger.error('Background lead processing failed', { leadId: id, error: err });
    }
  }
  running = false;
}

export const queueStatus = () => ({ pending: queue.length, running });
