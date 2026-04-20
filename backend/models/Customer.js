import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const CustomerAccountSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
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
  phoneNumber: {
    type: String,
    required: false,
    default: undefined,
    validate: {
      validator: function(v) {
        return !v || /^\+63\d{10}$/.test(v);
      },
      message: props => `${props.value} is not a valid phone number. Expected format: +63XXXXXXXXXX`
    }
  },
  phoneVerified: {
    type: Boolean,
    default: false
  },
  phoneVerifiedAt: {
    type: Date,
    default: null
  },
  preferredBranch: {
    type: String,
    default: 'Taguig Main - Cadena de Amor'
  },
  address: {
    type: String,
    default: ''
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending_verification', 'active', 'archived'],
    default: 'pending_verification'
  },
  signupVerificationCodeHash: {
    type: String,
    default: null
  },
  signupVerificationExpiresAt: {
    type: Date,
    default: null
  },
  signupVerificationSentAt: {
    type: Date,
    default: null
  },
  resetPasswordCodeHash: {
    type: String,
    default: null
  },
  resetPasswordCodeExpiresAt: {
    type: Date,
    default: null
  },
  resetPasswordVerifiedAt: {
    type: Date,
    default: null
  },
  resetPasswordSentAt: {
    type: Date,
    default: null
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

CustomerAccountSchema.index(
  { phoneNumber: 1 },
  {
    name: 'phoneNumber_1',
    unique: true,
    partialFilterExpression: {
      phoneNumber: { $type: 'string' }
    }
  }
);

// Hash passwords and normalize phone, set updatedAt before saving
CustomerAccountSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();

  if (this.isModified('password')) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  if (!this.phoneNumber) {
    this.phoneNumber = undefined;
    next();
    return;
  }

  if (this.phoneNumber) {
    // strip non-digits
    let digits = String(this.phoneNumber).replace(/\D/g, '');
    // if number starts with leading 0 (0912...), remove it
    if (digits.startsWith('0')) digits = digits.slice(1);
    // if it starts with country code 63, remove it to keep local part
    if (digits.startsWith('63')) digits = digits.slice(2);
    // take last 10 digits (local mobile part)
    digits = digits.slice(-10);
    if (digits.length === 10) {
      this.phoneNumber = '+63' + digits;
    } else {
      this.phoneNumber = undefined;
    }
  }

  next();
});

CustomerAccountSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

CustomerAccountSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    return ret;
  }
});

export default mongoose.model('CustomerAccount', CustomerAccountSchema, 'customer_accounts');
