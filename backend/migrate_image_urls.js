import mongoose from 'mongoose';
import CustomerDetail from './models/CustomerDetail.js';
import ProductDetail from './models/ProductDetail.js';
import RentalDetail from './models/RentalDetail.js';
import { loadEnvironment } from './config/loadEnv.js';

loadEnvironment();

const LEGACY_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

function isLegacyLocalUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return LEGACY_LOCAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function normalizeBaseUrl() {
  const configuredBaseUrl = String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (!configuredBaseUrl) {
    throw new Error('PUBLIC_BASE_URL is required to migrate image URLs. Example: http://192.168.1.10:5000');
  }

  if (isLegacyLocalUrl(configuredBaseUrl)) {
    throw new Error('PUBLIC_BASE_URL must be reachable by external devices. Set it to your LAN IP or production domain, not localhost.');
  }

  return configuredBaseUrl;
}

function rewriteMediaUrl(baseUrl, value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) {
    return '';
  }

  if (rawValue.startsWith('data:') || rawValue.startsWith('blob:')) {
    return rawValue;
  }

  if (/^(?:https?:)?\/\//i.test(rawValue)) {
    try {
      const currentUrl = new URL(rawValue);
      if (!LEGACY_LOCAL_HOSTS.has(currentUrl.hostname.toLowerCase())) {
        return rawValue;
      }

      const nextBase = new URL(baseUrl);
      currentUrl.protocol = nextBase.protocol;
      currentUrl.username = nextBase.username;
      currentUrl.password = nextBase.password;
      currentUrl.host = nextBase.host;
      return currentUrl.toString();
    } catch {
      return rawValue;
    }
  }

  return rawValue.startsWith('/') ? `${baseUrl}${rawValue}` : `${baseUrl}/${rawValue}`;
}

async function migrateCollection(model, fieldName, baseUrl) {
  const docs = await model.find({
    [fieldName]: { $exists: true, $type: 'string', $ne: '' }
  });

  let updatedCount = 0;

  for (const doc of docs) {
    const currentValue = String(doc[fieldName] || '').trim();
    const nextValue = rewriteMediaUrl(baseUrl, currentValue);

    if (nextValue !== currentValue) {
      doc[fieldName] = nextValue;
      await doc.save();
      updatedCount += 1;
    }
  }

  return updatedCount;
}

async function migrateFavoriteGownImages(baseUrl) {
  const docs = await CustomerDetail.find({
    'favoriteGowns.image': { $exists: true, $type: 'string', $ne: '' }
  });

  let updatedCount = 0;

  for (const doc of docs) {
    let changed = false;
    const favoriteGowns = Array.isArray(doc.favoriteGowns) ? doc.favoriteGowns : [];

    for (const gown of favoriteGowns) {
      const currentValue = String(gown?.image || '').trim();
      const nextValue = rewriteMediaUrl(baseUrl, currentValue);

      if (nextValue !== currentValue) {
        gown.image = nextValue;
        changed = true;
      }
    }

    if (changed) {
      await doc.save();
      updatedCount += 1;
    }
  }

  return updatedCount;
}

async function main() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/FabriQ';
  const dbName = process.env.MONGODB_DB_NAME || 'FabriQ';
  const baseUrl = normalizeBaseUrl();

  await mongoose.connect(mongoUri, { dbName });

  const [productUpdates, rentalUpdates, favoriteGownUpdates] = await Promise.all([
    migrateCollection(ProductDetail, 'image', baseUrl),
    migrateCollection(RentalDetail, 'paymentReceiptUrl', baseUrl),
    migrateFavoriteGownImages(baseUrl)
  ]);

  console.log(`Updated ${productUpdates} product image URLs.`);
  console.log(`Updated ${rentalUpdates} rental receipt URLs.`);
  console.log(`Updated ${favoriteGownUpdates} customer favorite gown image sets.`);

  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error('Failed to migrate image URLs:', error);
  try {
    await mongoose.disconnect();
  } catch {
    // Ignore disconnect errors during failure cleanup.
  }
  process.exit(1);
});