// Structured JSON logger. Cloud Run / Cloud Logging parses one JSON object per line
// and maps the "severity" field to log levels automatically.
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel = LEVELS[process.env.LOG_LEVEL] || (process.env.NODE_ENV === 'production' ? LEVELS.info : LEVELS.debug);
const pretty = process.env.NODE_ENV !== 'production';

function serializeError(err) {
  if (!(err instanceof Error)) return err;
  return { name: err.name, message: err.message, stack: err.stack, ...(err.status ? { status: err.status } : {}) };
}

function write(level, message, meta = {}) {
  if (LEVELS[level] < minLevel) return;
  const clean = {};
  for (const [k, v] of Object.entries(meta || {})) clean[k] = v instanceof Error ? serializeError(v) : v;
  const entry = { severity: level.toUpperCase(), time: new Date().toISOString(), message, ...clean };
  const out = level === 'error' || level === 'warn' ? console.error : console.log;
  if (pretty) {
    const extra = Object.keys(clean).length ? ` ${JSON.stringify(clean)}` : '';
    out(`[${entry.time}] ${entry.severity.padEnd(5)} ${message}${extra}`);
  } else {
    out(JSON.stringify(entry));
  }
}

export const logger = {
  debug: (m, meta) => write('debug', m, meta),
  info: (m, meta) => write('info', m, meta),
  warn: (m, meta) => write('warn', m, meta),
  error: (m, meta) => write('error', m, meta),
};
