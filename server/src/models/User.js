import mongoose from 'mongoose';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';

export const RESET_TOKEN_MINUTES = 60;
export const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    password_hash: { type: String, required: true, select: false },
    // Role key (see Role collection). Validated against existing roles in the API.
    role: { type: String, required: true, default: 'manager', lowercase: true, trim: true },
    // Personal overrides on top of the role: extra permissions granted / role permissions removed.
    permission_grants: [{ type: String }],
    permission_denies: [{ type: String }],
    active: { type: Boolean, default: true },
    last_login_at: Date,
    // Sessions issued before this moment are rejected (set on password reset/change).
    password_changed_at: Date,
    // Forgot-password: only a SHA-256 hash of the emailed token is stored; single use, expires.
    reset_token_hash: { type: String, select: false },
    reset_token_expires: { type: Date, select: false },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.password_hash;
        delete ret.reset_token_hash;
        delete ret.reset_token_expires;
        return ret;
      },
    },
  }
);

UserSchema.index({ role: 1 });
UserSchema.index({ reset_token_hash: 1 }, { sparse: true });

UserSchema.methods.setPassword = async function setPassword(pw) {
  this.password_hash = await bcrypt.hash(pw, 11);
};

/** Creates a new reset token (invalidating any earlier one) and returns the raw value for the email link. */
UserSchema.methods.createResetToken = function createResetToken() {
  const raw = crypto.randomBytes(32).toString('base64url');
  this.reset_token_hash = hashToken(raw);
  this.reset_token_expires = new Date(Date.now() + RESET_TOKEN_MINUTES * 60 * 1000);
  return raw;
};

UserSchema.methods.clearResetToken = function clearResetToken() {
  this.reset_token_hash = undefined;
  this.reset_token_expires = undefined;
};

UserSchema.methods.checkPassword = function checkPassword(pw) {
  return bcrypt.compare(pw, this.password_hash);
};

export const User = mongoose.model('User', UserSchema);
