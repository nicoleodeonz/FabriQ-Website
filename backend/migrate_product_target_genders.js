import mongoose from 'mongoose';
import ProductDetail from './models/ProductDetail.js';
import { loadEnvironment } from './config/loadEnv.js';

loadEnvironment();

function classifyProduct(product) {
  const searchableText = `${product.name || ''} ${product.category || ''}`.toLowerCase();

  if (/\b(unisex|gender[- ]neutral|all[- ]gender|universal)\b/.test(searchableText)) {
    return { targetGender: 'unisex', reason: 'Name or category explicitly identifies the item as gender-neutral.' };
  }

  if (/\b(tuxedo|suit|blazer|barong|menswear|men's|men\s+formal|male)\b/.test(searchableText)) {
    return { targetGender: 'men', reason: 'Name or category identifies the item as menswear.' };
  }

  if (/\b(gown|dress|bridal|wedding|cocktail|ball gown|evening gown|womenswear|women's|debutante|prom dress)\b/.test(searchableText)) {
    return { targetGender: 'women', reason: 'Name or category identifies the item as womenswear formalwear.' };
  }

  return null;
}

async function migrateProductTargetGenders() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI or MONGODB_URI must be configured. Migration aborted before any database operation.');
  }

  await mongoose.connect(mongoUri, { dbName: process.env.MONGODB_DB_NAME || 'FabriQ' });

  const products = await ProductDetail.find({}).select('_id sku name category color targetGender').lean();
  const classifications = products.map((product) => ({
    product,
    classification: classifyProduct(product),
  }));
  const unclassified = classifications.filter(({ classification }) => !classification);

  console.log('Product targetGender migration dry run:');
  console.table(classifications.map(({ product, classification }) => ({
    _id: String(product._id),
    name: product.name,
    category: product.category,
    color: product.color,
    currentTargetGender: product.targetGender || '(missing)',
    proposedTargetGender: classification?.targetGender || '(ambiguous)',
    reason: classification?.reason || 'No safe classification evidence in name or category.',
  })));

  if (unclassified.length > 0) {
    console.error('Cannot classify every product. No records were changed:', unclassified.map(({ product }) => ({
      _id: String(product._id),
      sku: product.sku,
      name: product.name,
      category: product.category,
    })));
    throw new Error(`Unclassified products: ${unclassified.length}`);
  }

  if (!process.argv.includes('--apply')) {
    console.log('Dry run complete. No database writes were performed. Re-run with --apply to update targetGender only.');
    return;
  }

  const operations = classifications.map(({ product, classification }) => ({
    updateOne: {
      filter: { _id: product._id },
      update: { $set: { targetGender: classification.targetGender } },
    },
  }));

  if (operations.length > 0) await ProductDetail.bulkWrite(operations);

  const counts = classifications.reduce((summary, { classification }) => {
    summary[classification.targetGender] += 1;
    return summary;
  }, { men: 0, women: 0, unisex: 0 });
  console.log('Product targetGender migration applied:', counts);
  console.log('Classified products:', classifications.map(({ product, classification }) => ({
    sku: product.sku,
    name: product.name,
    category: product.category,
    targetGender: classification.targetGender,
  })));
}

migrateProductTargetGenders()
  .catch((error) => {
    console.error('Product targetGender migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });