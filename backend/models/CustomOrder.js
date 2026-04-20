import mongoose from 'mongoose';

const CustomOrderSchema = new mongoose.Schema({
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerAccount', required: true },
  customerName: { type: String, required: true },
  contactNumber: { type: String, required: true },
  email: { type: String, required: true },
  orderType: { type: String, required: true },
  eventDate: { type: String },
  preferredColors: { type: String },
  fabricPreference: { type: String },
  specialRequests: { type: String },
  budget: { type: String },
  branch: { type: String },
  consultationDate: {
    type: String,
    default: null,
    trim: true,
  },
  consultationTime: {
    type: String,
    default: null,
    trim: true,
  },
  consultationRescheduleReason: {
    type: String,
    default: null,
    trim: true,
  },
  rejectionReason: {
    type: String,
    default: null,
    trim: true,
  },
  referenceId: {
    type: String,
    uppercase: true,
    trim: true,
    minlength: 7,
    maxlength: 7,
    match: /^[A-Z0-9]{7}$/,
    unique: true,
    sparse: true,
    index: true,
  },
  status: { type: String, enum: ['inquiry', 'design-approval', 'in-progress', 'fitting', 'completed', 'rejected'], default: 'inquiry' },
  designImageUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

CustomOrderSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('CustomOrder', CustomOrderSchema, 'custom_orders');
