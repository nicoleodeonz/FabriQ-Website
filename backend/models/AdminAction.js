import mongoose from 'mongoose';

const AdminActionSchema = new mongoose.Schema({
  adminId: {
    type: String,
    required: true
  },
  adminEmail: {
    type: String,
    default: ''
  },
  adminLabel: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true
  },
  targetUserId: {
    type: String,
    default: ''
  },
  targetRole: {
    type: String,
    default: ''
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model('AdminAction', AdminActionSchema, 'admin_history');
