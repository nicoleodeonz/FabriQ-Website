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
    const configuredMongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    const isHostedEnvironment = Boolean(
      process.env.RAILWAY_PROJECT_ID ||
      process.env.RAILWAY_SERVICE_ID ||
      process.env.RAILWAY_ENVIRONMENT_NAME ||
      process.env.NODE_ENV === 'production'
    );
    const mongoUri = configuredMongoUri || (isHostedEnvironment ? null : 'mongodb://localhost:27017/FabriQ');

    if (!mongoUri) {
      throw new Error('Missing MongoDB connection string. Set MONGODB_URI or MONGO_URI in the deployment environment.');
    }

    await mongoose.connect(mongoUri, {
      dbName: process.env.MONGODB_DB_NAME || 'FabriQ'
    });
    await ensureCustomerPhoneNumberIndex();
    console.log(`MongoDB connected successfully (${mongoose.connection.name})`);
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};
