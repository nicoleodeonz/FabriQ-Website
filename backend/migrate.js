import mongoose from 'mongoose';
import CustomerAccount from './models/Customer.js';
import CustomerDetail from './models/CustomerDetail.js';
import { connectDB } from './config/database.js';

const migrateData = async () => {
  try {
    await connectDB();

    // Get all customer details
    const customerDetails = await CustomerDetail.find({});

    for (const detail of customerDetails) {
      // Check if customer account already exists
      const existingAccount = await CustomerAccount.findOne({ email: detail.email });

      if (!existingAccount) {
        // Create new customer account with all data
        const newAccount = new CustomerAccount({
          firstName: detail.firstName,
          lastName: detail.lastName,
          email: detail.email,
          password: 'migrated', // Placeholder, users need to reset password
          phoneNumber: detail.phoneNumber,
          preferredBranch: 'Taguig Main - Cadena de Amor', // Default
          address: detail.address
        });

        await newAccount.save();
        console.log(`Migrated ${detail.email}`);
      } else {
        // Update existing account with missing fields
        if (!existingAccount.firstName) existingAccount.firstName = detail.firstName;
        if (!existingAccount.lastName) existingAccount.lastName = detail.lastName;
        if (!existingAccount.phoneNumber) existingAccount.phoneNumber = detail.phoneNumber;
        if (!existingAccount.address) existingAccount.address = detail.address;
        if (!existingAccount.preferredBranch) existingAccount.preferredBranch = 'Taguig Main - Cadena de Amor';

        await existingAccount.save();
        console.log(`Updated ${detail.email}`);
      }
    }

    console.log('Migration completed');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
};

migrateData();