import mongoose from 'mongoose';

const CustomerMeasurementSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CustomerAccount',
    required: true,
    unique: true,
  },
  height: { type: Number, default: null },
  shoulderWidth: { type: Number, default: null },
  chest: { type: Number, default: null },
  waist: { type: Number, default: null },
  hips: { type: Number, default: null },
  armLength: { type: Number, default: null },
  inseam: { type: Number, default: null },
  torsoLength: { type: Number, default: null },
  neck: { type: Number, default: null },
  measuredAt: { type: Date, default: null },
}, { timestamps: true });

export default mongoose.model('CustomerMeasurement', CustomerMeasurementSchema, 'customer_measurements');
