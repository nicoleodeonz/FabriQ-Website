import mongoose from 'mongoose';

const RentalDetailSchema = new mongoose.Schema({
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
    index: true,
  },
  customerName: {
    type: String,
    required: true,
    trim: true,
  },
  contactNumber: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductDetail',
    required: true,
    index: true,
  },
  gownName: {
    type: String,
    required: true,
    trim: true,
  },
  sku: {
    type: String,
    required: true,
    uppercase: true,
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
  startDate: {
    type: Date,
    required: true,
  },
  endDate: {
    type: Date,
    required: true,
  },
  branch: {
    type: String,
    required: true,
    trim: true,
  },
  eventType: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'for_payment', 'paid_for_confirmation', 'for_pickup', 'active', 'completed', 'cancelled'],
    default: 'pending',
  },
  totalPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  downpayment: {
    type: Number,
    required: true,
    min: 0,
  },
  paymentSubmittedAt: {
    type: Date,
    default: null,
  },
  paymentAmountPaid: {
    type: Number,
    min: 0,
    default: null,
  },
  paymentReferenceNumber: {
    type: String,
    trim: true,
    default: null,
  },
  paymentReceiptUrl: {
    type: String,
    trim: true,
    default: null,
  },
  paymentReceiptFilename: {
    type: String,
    trim: true,
    default: null,
  },
  rejectionReason: {
    type: String,
    trim: true,
    default: null,
  },
  rejectedAt: {
    type: Date,
    default: null,
  },
  pickupScheduleDate: {
    type: Date,
    default: null,
  },
  pickupScheduleTime: {
    type: String,
    trim: true,
    default: null,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

RentalDetailSchema.pre('save', function saveHook(next) {
  this.updatedAt = Date.now();
  next();
});

RentalDetailSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('RentalDetail', RentalDetailSchema, 'rental_details');
