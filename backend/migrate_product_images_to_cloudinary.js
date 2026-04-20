import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import ProductDetail from './models/ProductDetail.js';
import { loadEnvironment } from './config/loadEnv.js';
import { isCloudinaryEnabled, storeImageFromLocalPath } from './services/mediaStorageService.js';

loadEnvironment();

const uploadsDir = path.resolve(process.cwd(), 'uploads');

function isCloudinaryUrl(value) {
  return typeof value === 'string' && /res\.cloudinary\.com/i.test(value);
}

function isPrivateOrLoopbackHost(hostname) {
  return hostname === 'localhost'
    || hostname === '127.0.0.1'
    || hostname === '0.0.0.0'
    || hostname === '[::1]'
    || hostname.startsWith('192.168.')
    || hostname.startsWith('10.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./i.test(hostname);
}

function isExternalNonLocalUrl(value) {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return !isPrivateOrLoopbackHost(parsed.hostname);
  } catch {
    return false;
  }
}

function extractUploadRelativePath(imageValue) {
  if (typeof imageValue !== 'string') {
    return null;
  }

  const trimmed = imageValue.trim();
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

function resolveLocalImagePath(imageValue) {
  const relativeUploadPath = extractUploadRelativePath(imageValue);
  if (!relativeUploadPath) {
    return null;
  }

  const candidate = path.resolve(uploadsDir, relativeUploadPath);
  if (!candidate.startsWith(uploadsDir)) {
    return null;
  }

  return candidate;
}

async function migrateProductImages() {
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
    const products = await ProductDetail.find({ image: { $type: 'string', $ne: '' } }).select('_id name image');

    let updated = 0;
    let alreadyCloudinary = 0;
    let skippedExternal = 0;
    let missingLocalFile = 0;
    let unsupportedFormat = 0;
    const failures = [];

    for (const product of products) {
      const currentImage = product.image?.trim();

      if (!currentImage) {
        unsupportedFormat += 1;
        continue;
      }

      if (isCloudinaryUrl(currentImage)) {
        alreadyCloudinary += 1;
        continue;
      }

      if (isExternalNonLocalUrl(currentImage)) {
        skippedExternal += 1;
        continue;
      }

      const localImagePath = resolveLocalImagePath(currentImage);
      if (!localImagePath) {
        unsupportedFormat += 1;
        continue;
      }

      if (!fs.existsSync(localImagePath)) {
        missingLocalFile += 1;
        failures.push({
          id: String(product._id),
          name: product.name,
          reason: `Missing local file: ${localImagePath}`,
        });
        continue;
      }

      try {
        const stored = await storeImageFromLocalPath(localImagePath, { folder: 'products' });
        product.image = stored.url;
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
      totalProductsWithImages: products.length,
      updated,
      alreadyCloudinary,
      skippedExternal,
      missingLocalFile,
      unsupportedFormat,
      failures,
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

migrateProductImages().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});