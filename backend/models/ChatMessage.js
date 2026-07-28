import mongoose from 'mongoose';

const ChatMessageSchema = new mongoose.Schema({
  conversationId: {
    type: String,
    required: true,
    index: true,
  },
  customerId: {
    type: String,
    default: '',
    index: true,
  },
  customerName: {
    type: String,
    default: 'Guest Customer',
  },
  customerEmail: {
    type: String,
    default: '',
    index: true,
  },
  customerPhone: {
    type: String,
    default: '',
  },
  sender: {
    type: String,
    required: true,
    enum: ['customer', 'admin', 'system'],
  },
  adminId: {
    type: String,
    default: '',
  },
  adminName: {
    type: String,
    default: '',
  },
  uid: {
    type: String,
    default: '',
    index: true,
  },
  name: {
    type: String,
    default: '',
  },
  chat: {
    type: String,
    default: '',
  },
  time: {
    type: String,
    default: '',
  },
  date: {
    type: String,
    default: '',
  },
  text: {
    type: String,
    default: '',
  },
  read: {
    type: Boolean,
    default: false,
    index: true,
  },
  readAt: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

export default mongoose.model('ChatMessage', ChatMessageSchema, 'chats');
