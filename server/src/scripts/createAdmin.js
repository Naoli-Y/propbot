// Usage: npm run create-admin -- <email> <password> [name] [role]
import { connectDB, disconnectDB } from '../config/db.js';
import { User } from '../models/User.js';

const [email, password, name = 'Admin', role = 'admin'] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Usage: npm run create-admin -- <email> <password(min 8 chars)> [name] [admin|manager|viewer]');
  process.exit(1);
}

await connectDB({ retries: 1 });
let user = await User.findOne({ email: email.toLowerCase() }).select('+password_hash');
if (!user) user = new User({ email: email.toLowerCase(), name, role });
user.role = role;
user.active = true;
await user.setPassword(password);
await user.save();
console.log(`User ${user.email} saved with role ${user.role}`);
await disconnectDB();
