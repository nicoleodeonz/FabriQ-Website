import mongoose from 'mongoose';
import CustomerAccount from './models/Customer.js';
import CustomerDetail from './models/CustomerDetail.js';
import { loadEnvironment } from './config/loadEnv.js';

loadEnvironment();

const resetCustomerData = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fabriQ');
    console.log('MongoDB connected');

    // Clear customer data only
    await CustomerAccount.deleteMany({});
    await CustomerDetail.deleteMany({});
    console.log('Cleared all customer accounts and details');

    console.log('Customer data reset completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error resetting customer data:', error);
    process.exit(1);
  }
};

resetCustomerData();