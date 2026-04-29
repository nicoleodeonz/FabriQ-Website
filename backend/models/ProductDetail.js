import mongoose from 'mongoose';

const ProductRatingSchema = new mongoose.Schema({
  reviewerName: {
    type: String,
    trim: true,
    default: 'Anonymous Customer'
  },
  score: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  comment: {
    type: String,
    trim: true,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const ProductDetailSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  color: {
    type: String,
    required: true,
    trim: true
  },
  size: {
    type: [String],
    default: []
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  branch: {
    type: String,
    required: true,
    enum: ['Taguig Main', 'BGC Branch', 'Makati Branch', 'Quezon City']
  },
  status: {
    type: String,
    required: true,
    enum: ['available', 'rented', 'reserved', 'maintenance', 'archived'],
    default: 'available'
  },
  lastRented: {
    type: Date,
    default: null
  },
  description: {
    type: String,
    default: ''
  },
  image: {
    type: String,
    default: ''
  },
  rating: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  ratings: {
    type: [ProductRatingSchema],
    default: []
  },
  stock: {
    type: Number,
    min: 0,
    default: 1
  },
  deletedAt: {
    type: Date,
    default: null
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

ProductDetailSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

ProductDetailSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('ProductDetail', ProductDetailSchema, 'product_details');
