import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const AdminAccountSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Hash passwords and set updatedAt before saving
AdminAccountSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();

  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

AdminAccountSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

AdminAccountSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    return ret;
  }
});

export default mongoose.model('AdminAccount', AdminAccountSchema, 'admin_accounts');
