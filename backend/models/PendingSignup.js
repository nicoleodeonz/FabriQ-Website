import mongoose from 'mongoose';

const PendingSignupSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  password: { type: String, required: true },
  phoneNumber: { type: String, default: null },
  phoneVerified: { type: Boolean, default: false },
  phoneVerifiedAt: { type: Date, default: null },
  phoneVerificationCodeHash: { type: String, default: null },
  phoneVerificationExpiresAt: { type: Date, default: null },
  phoneVerificationSentAt: { type: Date, default: null },
  signupVerificationCodeHash: { type: String, default: null },
  signupVerificationExpiresAt: { type: Date, default: null },
  signupVerificationSentAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { collection: 'pending_signups', timestamps: true });

export default mongoose.models.PendingSignup || mongoose.model('PendingSignup', PendingSignupSchema);