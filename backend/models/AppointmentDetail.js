import mongoose from 'mongoose';

const AppointmentDetailSchema = new mongoose.Schema({
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
  type: {
    type: String,
    enum: ['fitting', 'consultation', 'measurement', 'pickup'],
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
  time: {
    type: String,
    required: true,
    trim: true,
  },
  branch: {
    type: String,
    required: true,
    trim: true,
  },
  status: {
    type: String,
    enum: ['pending', 'scheduled', 'completed', 'cancelled'],
    default: 'pending',
  },
  notes: {
    type: String,
    default: '',
    trim: true,
  },
  cancellationReason: {
    type: String,
    default: '',
    trim: true,
  },
  rescheduleReason: {
    type: String,
    default: '',
    trim: true,
  },
  selectedGown: {
    type: String,
    default: '',
    trim: true,
  },
  selectedGownName: {
    type: String,
    default: '',
    trim: true,
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

AppointmentDetailSchema.pre('save', function saveHook(next) {
  this.updatedAt = Date.now();
  next();
});

AppointmentDetailSchema.set('toJSON', {
  transform: (doc, ret) => {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('AppointmentDetail', AppointmentDetailSchema, 'appointment_details');