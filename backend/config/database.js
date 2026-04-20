import mongoose from 'mongoose';
import { loadEnvironment } from './loadEnv.js';

loadEnvironment();

async function ensureCustomerPhoneNumberIndex() {
  const collection = mongoose.connection.db.collection('customer_accounts');
  const indexes = await collection.indexes();
  const phoneIndex = indexes.find((index) => index.name === 'phoneNumber_1');
  const hasExpectedPartialFilter = Boolean(
    phoneIndex?.partialFilterExpression?.phoneNumber?.$type === 'string'
  );

  if (phoneIndex && !hasExpectedPartialFilter) {
    await collection.dropIndex('phoneNumber_1');
  }

  if (!phoneIndex || !hasExpectedPartialFilter) {
    await collection.createIndex(
      { phoneNumber: 1 },
      {
        name: 'phoneNumber_1',
        unique: true,
        partialFilterExpression: {
          phoneNumber: { $type: 'string' }
        }
      }
    );
  }
}

export const connectDB = async () => {
  try {
    await mongoose.connect(
      process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/FabriQ',
      {
      dbName: process.env.MONGODB_DB_NAME || 'FabriQ'
      }
    );
    await ensureCustomerPhoneNumberIndex();
    console.log(`MongoDB connected successfully (${mongoose.connection.name})`);
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};
