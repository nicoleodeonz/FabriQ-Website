import mongoose from 'mongoose';

const ReviewSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CustomerAccount',
    required: true,
    index: true,
  },
  customerEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  customerName: {
    type: String,
    required: true,
    trim: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductDetail',
    required: true,
    index: true,
  },
  rentalId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RentalDetail',
    required: true,
    unique: true,
    index: true,
  },
  gownName: {
    type: String,
    required: true,
    trim: true,
  },
  score: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  comment: {
    type: String,
    required: true,
    trim: true,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

ReviewSchema.pre('save', function saveHook(next) {
  this.updatedAt = Date.now();
  next();
});

ReviewSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Review', ReviewSchema, 'reviews');