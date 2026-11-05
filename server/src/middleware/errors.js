import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

/** Wraps async route handlers so rejections reach the error handler. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function validateObjectId(param = 'id') {
  return (req, res, next) => {
    if (!mongoose.isValidObjectId(req.params[param])) return res.status(400).json({ error: 'Invalid id' });
    next();
  };
}

export function notFound(req, res) {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => e.message);
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.code === 11000) {
    status = 409;
    message = 'Duplicate record';
    details = err.keyValue;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.code === 'LIMIT_FILE_SIZE') {
    status = 413;
    message = 'File too large';
  }

  if (status >= 500) logger.error('Unhandled error', { method: req.method, path: req.originalUrl, error: err });
  else logger.debug('Request error', { method: req.method, path: req.originalUrl, status, message });

  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal server error' : message,
    ...(details ? { details } : {}),
  });
}
