import mongoose from 'mongoose';

const CustomerBehaviorSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CustomerAccount',
    default: null
  },
  gownId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ProductDetail',
    required: true
  },
  gownName: {
    type: String,
    required: true
  },
  gownBranch: {
    type: String,
    required: true
  },
  customerBranchPreference: {
    type: String,
    default: null
  },
  action: {
    type: String,
    enum: ['click', 'view'],
    default: 'click'
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

CustomerBehaviorSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

export default mongoose.model('CustomerBehavior', CustomerBehaviorSchema, 'customer_behaviors');
