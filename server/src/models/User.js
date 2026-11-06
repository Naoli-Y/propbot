import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    password_hash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'manager', 'investor', 'viewer'], default: 'manager' },
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

UserSchema.methods.setPassword = async function setPassword(pw) {
  this.password_hash = await bcrypt.hash(pw, 11);
};

UserSchema.methods.checkPassword = function checkPassword(pw) {
  return bcrypt.compare(pw, this.password_hash);
};

export const User = mongoose.model('User', UserSchema);
