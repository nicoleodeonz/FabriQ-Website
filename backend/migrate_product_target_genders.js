import mongoose from 'mongoose';
import ProductDetail from './models/ProductDetail.js';
import { loadEnvironment } from './config/loadEnv.js';

loadEnvironment();

function classifyProduct(product) {
  const searchableText = `${product.name || ''} ${product.category || ''}`.toLowerCase();
  if (/\b(gown|dress|bridal|womenswear|women's)\b/.test(searchableText)) return 'women';
  if (/\b(suit|blazer|barong|menswear|men's)\b/.test(searchableText)) return 'men';
  return null;
}

async function migrateProductTargetGenders() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/FabriQ';
  await mongoose.connect(mongoUri, { dbName: process.env.MONGODB_DB_NAME || 'FabriQ' });

  const products = await ProductDetail.find({}).select('_id name category targetGender').lean();
  const operations = products.map((product) => ({
    updateOne: {
      filter: { _id: product._id },
      update: { $set: { targetGender: classifyProduct(product) } },
    },
  }));

  if (operations.length > 0) await ProductDetail.bulkWrite(operations);

  const counts = products.reduce((summary, product) => {
    const classification = classifyProduct(product) || 'unclassified';
    summary[classification] += 1;
    return summary;
  }, { men: 0, women: 0, unclassified: 0 });
  console.log('Product targetGender migration complete:', counts);
}

migrateProductTargetGenders()
  .catch((error) => {
    console.error('Product targetGender migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });