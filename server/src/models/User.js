import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

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
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        delete ret.__v;
        delete ret.password_hash;
        return ret;
      },
    },
  }
);

UserSchema.index({ role: 1 });

UserSchema.methods.setPassword = async function setPassword(pw) {
  this.password_hash = await bcrypt.hash(pw, 11);
};

UserSchema.methods.checkPassword = function checkPassword(pw) {
  return bcrypt.compare(pw, this.password_hash);
};

export const User = mongoose.model('User', UserSchema);
