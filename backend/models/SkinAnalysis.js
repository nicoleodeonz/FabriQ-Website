import mongoose from 'mongoose';

const SkinAnalysisSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CustomerAccount',
    required: true,
  },
  customerName: { type: String, required: true },
  email: { type: String, required: true },
  skinTone: {
    type: String,
    enum: ['fair', 'light', 'medium', 'tan', 'deep'],
    required: true,
  },
  undertone: {
    type: String,
    enum: ['warm', 'cool', 'neutral'],
    required: true,
  },
  skinHex: { type: String, required: true },
  skinRgb: {
    r: { type: Number },
    g: { type: Number },
    b: { type: Number },
  },
  recommendedColors: [{ type: String }],
  recommendedGownIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductDetail',
  }],
  appliedToOrder: { type: Boolean, default: false },
  selectedColor: { type: String, default: null },
  insightText: { type: String, default: null },
  branch: { type: String, default: null },
  scannedAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

SkinAnalysisSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('SkinAnalysis', SkinAnalysisSchema, 'color_anal');
