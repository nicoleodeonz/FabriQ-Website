import mongoose from 'mongoose';

const FavoriteGownSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    category: { type: String, default: '' },
    color: { type: String, default: '' },
    size: { type: [String], default: [] },
    price: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['available', 'rented', 'reserved'],
      default: 'available',
    },
    branch: { type: String, default: '' },
    image: { type: String, default: '' },
    rating: { type: Number, default: 0 },
  },
  { _id: false }
);

const CustomerDetailSchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true
  },
  lastName: {
    type: String,
    required: true
  },
  phoneNumber: {
    type: String,
    required: false,
    validate: {
      validator: function(v) {
        return !v || /^\+63\d{10}$/.test(v);
      },
      message: props => `${props.value} is not a valid phone number. Expected format: +63XXXXXXXXXX`
    }
  },
  phoneVerified: {
    type: Boolean,
    default: false,
  },
  phoneVerifiedAt: {
    type: Date,
    default: null,
  },
  address: {
    type: String,
    default: ''
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  bust: { type: Number, default: null },
  waist: { type: Number, default: null },
  hips: { type: Number, default: null },
  height: { type: Number, default: null },
  shoulderWidth: { type: Number, default: null },
  sleeveLength: { type: Number, default: null },
  favoriteGowns: {
    type: [FavoriteGownSchema],
    default: [],
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Normalize phone to +63XXXXXXXXXX and update updatedAt before saving
CustomerDetailSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();

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
    }
  }

  next();
});

CustomerDetailSchema.set('toJSON', {
  transform: (doc, ret) => {
    return ret;
  }
});

export default mongoose.model('CustomerDetail', CustomerDetailSchema, 'customer_details');