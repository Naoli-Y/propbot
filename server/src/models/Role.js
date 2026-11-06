import mongoose from 'mongoose';

// A role is a named set of permissions. Default roles are created on startup;
// the super admin can edit their permissions or create custom roles at any time.
const RoleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true, match: /^[a-z][a-z0-9_]{1,39}$/ },
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300 },
    permissions: [{ type: String }],
    is_system: { type: Boolean, default: false }, // one of the default roles (can be reset, not deleted)
    locked: { type: Boolean, default: false }, // super admin: cannot be edited
    updated_by: String,
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { transform: (_d, r) => { r.id = r._id.toString(); delete r._id; delete r.__v; return r; } },
  }
);

export const Role = mongoose.model('Role', RoleSchema);
