import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { loadEnvironment } from './config/loadEnv.js';

loadEnvironment();

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'FabriQ';

const customerSchema = new mongoose.Schema({
  firstName: String,
  lastName: String,
  email: String,
  password: String,
  phoneNumber: String,
  preferredBranch: String,
  address: String,
  tokenVersion: Number,
  status: String,
  createdAt: Date,
  updatedAt: Date
}, { collection: 'customer_accounts' });

const adminSchema = new mongoose.Schema({
  email: String,
  password: String,
  tokenVersion: Number,
  status: String,
  createdAt: Date,
  updatedAt: Date
}, { collection: 'admin_accounts' });

const Customer = mongoose.model('Customer', customerSchema);
const Admin = mongoose.model('Admin', adminSchema);

function normalizePhone(input) {
  if (!input && input !== '') return input;
  let s = String(input || '').replace(/\D/g, '');
  if (s.length === 0) return undefined;
  if (s.startsWith('0')) s = s.slice(1);
  if (s.startsWith('63')) s = s.slice(2);
  s = s.slice(-10);
  if (s.length !== 10) return undefined;
  return '+63' + s;
}

async function migrate() {
  await mongoose.connect(uri, { dbName });
  // Migrate customers
  const customers = await Customer.find({});
  for (const user of customers) {
    let updated = false;
    // Lowercase email
    if (user.email && user.email !== user.email.toLowerCase()) {
      user.email = user.email.toLowerCase();
      updated = true;
    }
    // Normalize phone
    if (user.phoneNumber) {
      const norm = normalizePhone(user.phoneNumber);
      if (norm && user.phoneNumber !== norm) {
        user.phoneNumber = norm;
        updated = true;
      }
    }
    // Hash password if not hashed
    if (user.password && !/^\$2[aby]\$/.test(user.password)) {
      user.password = await bcrypt.hash(user.password, 10);
      updated = true;
    }
    if (updated) {
      await user.save();
      console.log(`Updated customer: ${user.email}`);
    }
  }
  // Migrate admins
  const admins = await Admin.find({});
  for (const user of admins) {
    let updated = false;
    if (user.email && user.email !== user.email.toLowerCase()) {
      user.email = user.email.toLowerCase();
      updated = true;
    }
    if (user.password && !/^\$2[aby]\$/.test(user.password)) {
      user.password = await bcrypt.hash(user.password, 10);
      updated = true;
    }
    if (updated) {
      await user.save();
      console.log(`Updated admin: ${user.email}`);
    }
  }
  await mongoose.disconnect();
  console.log('Migration complete.');
}

migrate().catch(e => { console.error(e); process.exit(1); });
