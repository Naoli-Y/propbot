// Usage: npm run create-admin -- <email> <password> [name] [role]
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';
import { Role } from '../models/Role.js';
import { ensureRoles } from '../services/rbac.js';

const [email, password, name = 'Admin', role = 'super_admin'] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Usage: npm run create-admin -- <email> <password(min 8 chars)> [name] [super_admin|admin|manager|investor|viewer|<custom role key>]');
  process.exit(1);
}

await connectDB({ retries: 1 });
await ensureRoles();
if (!(await Role.exists({ key: role }))) {
  console.error(`Unknown role "${role}"`);
  process.exit(1);
}
let user = await User.findOne({ email: email.toLowerCase() }).select('+password_hash');
if (!user) user = new User({ email: email.toLowerCase(), name, role });
user.role = role;
user.active = true;
await user.setPassword(password);
await user.save();
console.log(`User ${user.email} saved with role ${user.role}`);
await disconnectDB();
