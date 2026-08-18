import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import ProductDetail from './models/ProductDetail.js';
import { loadEnvironment } from './config/loadEnv.js';
import { isCloudinaryEnabled, storeAssetFromLocalPath } from './services/mediaStorageService.js';

loadEnvironment();

const uploadsDir = path.resolve(process.cwd(), 'uploads');

function isCloudinaryUrl(value) {
  return typeof value === 'string' && /res\.cloudinary\.com/i.test(value);
}

function extractUploadRelativePath(modelValue) {
  if (typeof modelValue !== 'string') {
    return null;
  }

  const trimmed = modelValue.trim();
  if (!trimmed) {
    return null;
  }

  let pathname = trimmed;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      pathname = new URL(trimmed).pathname;
    } catch {
      return null;
    }
  }

  const normalized = pathname.replace(/\\/g, '/');
  const uploadsIndex = normalized.toLowerCase().indexOf('/uploads/');
  if (uploadsIndex >= 0) {
    return normalized.slice(uploadsIndex + '/uploads/'.length);
  }

  if (normalized.toLowerCase().startsWith('uploads/')) {
    return normalized.slice('uploads/'.length);
  }

  return null;
}

function resolveLocalModelPath(modelValue) {
  const relativeUploadPath = extractUploadRelativePath(modelValue);
  if (!relativeUploadPath) {
    return null;
  }

  const candidate = path.resolve(uploadsDir, relativeUploadPath);
  if (!candidate.startsWith(uploadsDir)) {
    return null;
  }

  return candidate;
}

async function migrateProductModels() {
  if (!isCloudinaryEnabled()) {
    throw new Error('Cloudinary is not configured. Set UPLOAD_BACKEND=cloudinary and the Cloudinary env vars before running this script.');
  }

  const mongoUri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB_NAME || 'FabriQ';

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not configured.');
  }

  await mongoose.connect(mongoUri, { dbName });

  try {
    const products = await ProductDetail.find({ model3dUrl: { $type: 'string', $ne: '' } }).select('_id name model3dUrl');

    let updated = 0;
    let alreadyCloudinary = 0;
    let missingLocalFile = 0;
    let unsupportedFormat = 0;
    const failures = [];

    for (const product of products) {
      const currentModelUrl = product.model3dUrl?.trim();

      if (!currentModelUrl) {
        unsupportedFormat += 1;
        continue;
      }

      if (isCloudinaryUrl(currentModelUrl)) {
        alreadyCloudinary += 1;
        continue;
      }

      const localModelPath = resolveLocalModelPath(currentModelUrl);
      if (!localModelPath) {
        unsupportedFormat += 1;
        continue;
      }

      if (!fs.existsSync(localModelPath)) {
        missingLocalFile += 1;
        failures.push({
          id: String(product._id),
          name: product.name,
          reason: `Missing local file: ${localModelPath}`,
        });
        continue;
      }

      try {
        const stored = await storeAssetFromLocalPath(localModelPath, { folder: 'products/models', resourceType: 'raw' });
        product.model3dUrl = stored.url;
        await product.save();
        updated += 1;
      } catch (error) {
        failures.push({
          id: String(product._id),
          name: product.name,
          reason: error instanceof Error ? error.message : 'Unknown upload failure',
        });
      }
    }

    console.log(JSON.stringify({
      collection: 'product_details',
      database: dbName,
      totalProductsWithModels: products.length,
      updated,
      alreadyCloudinary,
      missingLocalFile,
      unsupportedFormat,
      failures,
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

migrateProductModels().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
