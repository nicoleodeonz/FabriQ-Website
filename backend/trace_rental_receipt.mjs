import mongoose from 'mongoose';
import { loadEnvironment } from './config/loadEnv.js';
import RentalDetail from './models/RentalDetail.js';

loadEnvironment();

const needle = process.argv[2];

if (!needle) {
  console.error('Usage: node trace_rental_receipt.mjs <filename-or-fragment>');
  process.exit(1);
}

const mongoUri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'FabriQ';

if (!mongoUri) {
  console.error('MONGODB_URI is not configured.');
  process.exit(1);
}

await mongoose.connect(mongoUri, { dbName });

try {
  const docs = await RentalDetail.find({
    $or: [
      { paymentReceiptUrl: { $regex: needle, $options: 'i' } },
      { paymentReceiptFilename: { $regex: needle, $options: 'i' } },
    ],
  })
    .select('_id referenceId customerName paymentReceiptUrl paymentReceiptFilename status createdAt updatedAt')
    .lean();

  console.log(JSON.stringify(docs, null, 2));
} finally {
  await mongoose.disconnect();
}
