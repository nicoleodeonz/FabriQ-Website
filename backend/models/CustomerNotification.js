import mongoose from 'mongoose';

const CustomerNotificationSchema = new mongoose.Schema({
  customerId: {
    type: String,
    default: '',
    index: true,
  },
  customerEmail: {
    type: String,
    default: '',
    index: true,
  },
  type: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    default: '',
  },
  title: {
    type: String,
    required: true,
  },
  message: {
    type: String,
    required: true,
  },
  itemLabel: {
    type: String,
    default: '',
  },
  date: {
    type: String,
    default: '',
  },
  dateType: {
    type: String,
    default: '',
  },
  time: {
    type: String,
    default: '',
  },
  location: {
    type: String,
    default: '',
  },
  readAt: {
    type: Date,
    default: null,
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

export default mongoose.model('CustomerNotification', CustomerNotificationSchema, 'customer_notifications');