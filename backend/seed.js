import mongoose from 'mongoose';
import AdminAccount from './models/Admin.js';
import CustomerAccount from './models/Customer.js';
import CustomerDetail from './models/CustomerDetail.js';
import { loadEnvironment } from './config/loadEnv.js';

loadEnvironment();

const seedDatabase = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fabriQ');
    console.log('MongoDB connected');

    // Clear existing data
    await AdminAccount.deleteMany({});
    await CustomerAccount.deleteMany({});
    await CustomerDetail.deleteMany({});
    console.log('Cleared existing accounts and details');

    // Create sample admin
    const sampleAdmin = new AdminAccount({
      email: 'admin@example.com',
      password: 'Admin123!'
    });
    await sampleAdmin.save();
    console.log('Sample admin created:', sampleAdmin._id);

    // Create sample customer account
    const sampleCustomerAccount = new CustomerAccount({
      email: 'sarah.johnson@email.com',
      password: 'Customer123!'
    });
    await sampleCustomerAccount.save();
    console.log('Sample customer account created:', sampleCustomerAccount._id);

    // Create sample customer details
    const sampleCustomerDetail = new CustomerDetail({
      firstName: 'Sarah',
      lastName: 'Johnson',
      phoneNumber: '+639123456789',
      address: '',
      email: 'sarah.johnson@email.com'
    });
    await sampleCustomerDetail.save();
    console.log('Sample customer details created:', sampleCustomerDetail._id);

    console.log('Database seeding completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
};

seedDatabase();
