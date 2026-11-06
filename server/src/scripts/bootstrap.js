import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { logger } from '../utils/logger.js';

/** Creates the first admin account from ADMIN_EMAIL / ADMIN_PASSWORD when the users collection is empty. */
export async function ensureAdminUser() {
  const count = await User.estimatedDocumentCount();
  if (count > 0) return null;
  const user = new User({ name: env.adminName, email: env.adminEmail.toLowerCase(), role: 'super_admin' });
  await user.setPassword(env.adminPassword);
  await user.save();
  logger.info('Created initial admin user', { email: user.email });
  return user;
}
