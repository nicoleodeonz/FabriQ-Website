import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { loadEnvironment } from './config/loadEnv.js';

loadEnvironment();

const OLD_ID = '69dfcb5bcf40c5b2e48c9ff9';
const OLD_OBJECT_ID = new mongoose.Types.ObjectId(OLD_ID);
const EXPECTED_COUNTS = {
  'admin_history.targetUserId': 43,
  'appointment_details.customerId': 6,
  'chats.customerId': 35,
  'chats.uid': 35,
  'color_anal.customerId': 26,
  'custom_orders.customerId': 5,
  'customer_notifications.customerId': 57,
  'customer_notifications.metadata.customerId': 55,
  'rental_details.customerId': 18,
  'rental_details.userId': 7,
  'reviews.customerId': 2,
};

const REFERENCE_SPECS = [
  { collection: 'appointment_details', field: 'customerId', oldValue: OLD_OBJECT_ID, newValue: (id) => id },
  { collection: 'color_anal', field: 'customerId', oldValue: OLD_OBJECT_ID, newValue: (id) => id },
  { collection: 'custom_orders', field: 'customerId', oldValue: OLD_OBJECT_ID, newValue: (id) => id },
  { collection: 'rental_details', field: 'customerId', oldValue: OLD_OBJECT_ID, newValue: (id) => id },
  { collection: 'rental_details', field: 'userId', oldValue: OLD_OBJECT_ID, newValue: (id) => id },
  { collection: 'reviews', field: 'customerId', oldValue: OLD_OBJECT_ID, newValue: (id) => id },
  { collection: 'admin_history', field: 'targetUserId', oldValue: OLD_ID, newValue: (id) => id.toHexString() },
  { collection: 'chats', field: 'customerId', oldValue: OLD_ID, newValue: (id) => id.toHexString() },
  { collection: 'chats', field: 'uid', oldValue: OLD_ID, newValue: (id) => id.toHexString() },
  { collection: 'customer_notifications', field: 'customerId', oldValue: OLD_ID, newValue: (id) => id.toHexString() },
  { collection: 'customer_notifications', field: 'metadata.customerId', oldValue: OLD_ID, newValue: (id) => id.toHexString() },
];

function getOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function expectedCount(spec) {
  return EXPECTED_COUNTS[`${spec.collection}.${spec.field}`];
}

function formatValue(value) {
  return value instanceof mongoose.Types.ObjectId ? `ObjectId("${value.toHexString()}")` : JSON.stringify(value);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function referenceFilter(spec, value = spec.oldValue) {
  return { [spec.field]: value };
}

function requiredSnapshotPath() {
  const requested = getOption('--snapshot-path');
  assert(requested && !requested.startsWith('--'), 'Writes require --snapshot-path <path>.');
  return path.resolve(requested);
}

async function writeSnapshot(filePath, snapshot) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, EJSON.stringify(snapshot, null, 2), 'utf8');
}

async function readSnapshot(filePath) {
  return EJSON.parse(await fs.readFile(filePath, 'utf8'));
}

function printPlan(newId, snapshotPath) {
  console.log('DRY RUN: no MongoDB writes will be executed.');
  console.log(`Old customer _id: ${formatValue(OLD_ID)}`);
  console.log(`Proposed new customer _id: ${formatValue(newId)}`);
  console.log(`Snapshot path: ${snapshotPath}`);
  console.log('Planned operations:');
  console.log('  insertOne customer_accounts: 1 replacement document');
  for (const spec of REFERENCE_SPECS) {
    console.log(`  updateMany ${spec.collection}.${spec.field}: ${expectedCount(spec)} documents -> ${formatValue(spec.newValue(newId))}`);
  }
  console.log('  deleteOne customer_accounts: 1 legacy document');
}

async function collectPreflight(db, newId) {
  const customers = db.collection('customer_accounts');
  const oldCustomer = await customers.findOne({ _id: OLD_ID });
  assert(oldCustomer, `Pre-flight failed: customer_accounts _id ${formatValue(OLD_ID)} was not found.`);
  assert(!(await customers.findOne({ _id: newId })), `Pre-flight failed: proposed ObjectId ${newId} already exists.`);
  const sameEmailCount = await customers.countDocuments({ email: oldCustomer.email });
  assert(sameEmailCount === 1, `Pre-flight failed: expected one account for ${oldCustomer.email}, found ${sameEmailCount}.`);

  const affectedDocuments = new Map();
  const counts = {};
  for (const spec of REFERENCE_SPECS) {
    const count = await db.collection(spec.collection).countDocuments(referenceFilter(spec));
    const key = `${spec.collection}.${spec.field}`;
    counts[key] = count;
    assert(count === expectedCount(spec), `Pre-flight failed: ${key} expected ${expectedCount(spec)} but found ${count}.`);

    const documents = await db.collection(spec.collection).find(referenceFilter(spec)).toArray();
    for (const document of documents) {
      const documentKey = `${spec.collection}:${EJSON.stringify(document._id)}`;
      if (!affectedDocuments.has(documentKey)) affectedDocuments.set(documentKey, { collection: spec.collection, document });
    }
  }

  return { oldCustomer, counts, affectedDocuments: [...affectedDocuments.values()] };
}

async function verifyMigration(db, newId) {
  const customers = db.collection('customer_accounts');
  assert(!(await customers.findOne({ _id: OLD_ID })), 'Post-verification failed: old String customer still exists.');
  assert(await customers.findOne({ _id: newId }), 'Post-verification failed: replacement ObjectId customer is missing.');

  for (const spec of REFERENCE_SPECS) {
    const newValue = spec.newValue(newId);
    const oldCount = await db.collection(spec.collection).countDocuments(referenceFilter(spec));
    const newCount = await db.collection(spec.collection).countDocuments(referenceFilter(spec, newValue));
    assert(oldCount === 0, `Post-verification failed: ${spec.collection}.${spec.field} still has ${oldCount} old references.`);
    assert(newCount === expectedCount(spec), `Post-verification failed: ${spec.collection}.${spec.field} expected ${expectedCount(spec)} new references but found ${newCount}.`);
  }

  const authLookup = await customers.findOne({ _id: newId });
  assert(authLookup && String(authLookup.email || '').toLowerCase() === 'agazon20emman@gmail.com', 'Post-verification failed: authentication lookup did not resolve the migrated customer.');
  console.log(`Post-verification passed: authentication lookup resolves ${authLookup.email} at ObjectId ${newId}.`);
}

async function runDryRun(db) {
  const newId = new mongoose.Types.ObjectId();
  const preflight = await collectPreflight(db, newId);

  printPlan(newId, getOption('--snapshot-path') ? path.resolve(getOption('--snapshot-path')) : '(not written in dry run)');
  console.log(`Pre-flight passed: ${preflight.affectedDocuments.length} unique dependent documents captured.`);
  console.log('A dry run does not write the snapshot. Supply --execute --snapshot-path <path> to perform the guarded migration.');
}

async function runMigration(db) {
  const newId = new mongoose.Types.ObjectId();
  const snapshotPath = requiredSnapshotPath();
  const preflight = await collectPreflight(db, newId);
  const snapshot = {
    version: 1,
    createdAt: new Date(),
    oldId: OLD_ID,
    oldObjectId: OLD_OBJECT_ID,
    newId,
    expectedCounts: EXPECTED_COUNTS,
    oldCustomer: preflight.oldCustomer,
    affectedDocuments: preflight.affectedDocuments,
  };

  await writeSnapshot(snapshotPath, snapshot);
  console.log(`Snapshot written before writes: ${snapshotPath}`);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const customers = db.collection('customer_accounts');
      for (const spec of REFERENCE_SPECS) {
        const result = await db.collection(spec.collection).updateMany(
          referenceFilter(spec),
          { $set: { [spec.field]: spec.newValue(newId) } },
          { session },
        );
        assert(result.matchedCount === expectedCount(spec), `Migration aborted: ${spec.collection}.${spec.field} matched ${result.matchedCount}, expected ${expectedCount(spec)}.`);
        console.log(`Updated ${spec.collection}.${spec.field}: ${result.modifiedCount} documents.`);
      }

      const deleteResult = await customers.deleteOne({ _id: OLD_ID }, { session });
      assert(deleteResult.deletedCount === 1, 'Migration aborted: legacy String customer was not deleted.');

      // The unique email index prevents inserting the replacement while the legacy document exists.
      // Both operations are inside the same transaction, so no external reader can observe the gap.
      const replacement = { ...preflight.oldCustomer, _id: newId };
      const insertResult = await customers.insertOne(replacement, { session });
      assert(insertResult.insertedId.equals(newId), 'Migration failed: replacement customer was not inserted with the planned ObjectId.');
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await session.endSession();
  }

  await verifyMigration(db, newId);
  console.log(`Migration committed successfully. Snapshot retained at ${snapshotPath}.`);
}

async function runRollback(db) {
  const snapshotPath = requiredSnapshotPath();
  const snapshot = await readSnapshot(path.resolve(snapshotPath));
  const newId = new mongoose.Types.ObjectId(snapshot.newId);
  assert(snapshot.oldId === OLD_ID, 'Rollback aborted: snapshot target does not match the approved old customer ID.');
  assert(snapshot.oldCustomer?._id === OLD_ID, 'Rollback aborted: snapshot does not contain the old String customer document.');
  assert(!(await db.collection('customer_accounts').findOne({ _id: OLD_ID })), 'Rollback aborted: old customer already exists.');
  assert(await db.collection('customer_accounts').findOne({ _id: newId }), 'Rollback aborted: replacement ObjectId customer is missing.');

  for (const spec of REFERENCE_SPECS) {
    const newValue = spec.newValue(newId);
    const count = await db.collection(spec.collection).countDocuments(referenceFilter(spec, newValue));
    assert(count === expectedCount(spec), `Rollback aborted: ${spec.collection}.${spec.field} expected ${expectedCount(spec)} replacement references but found ${count}.`);
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const customers = db.collection('customer_accounts');
      const deleteResult = await customers.deleteOne({ _id: newId }, { session });
      assert(deleteResult.deletedCount === 1, 'Rollback aborted: replacement customer was not deleted.');

      const insertResult = await customers.insertOne(snapshot.oldCustomer, { session });
      assert(insertResult.insertedId === OLD_ID, 'Rollback aborted: old customer was not restored.');

      for (const spec of REFERENCE_SPECS) {
        const result = await db.collection(spec.collection).updateMany(
          referenceFilter(spec, spec.newValue(newId)),
          { $set: { [spec.field]: spec.oldValue } },
          { session },
        );
        assert(result.matchedCount === expectedCount(spec), `Rollback aborted: ${spec.collection}.${spec.field} matched ${result.matchedCount}, expected ${expectedCount(spec)}.`);
      }
    }, { readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' } });
  } finally {
    await session.endSession();
  }

  assert(await db.collection('customer_accounts').findOne({ _id: OLD_ID }), 'Rollback verification failed: old customer is missing.');
  assert(!(await db.collection('customer_accounts').findOne({ _id: newId })), 'Rollback verification failed: replacement customer still exists.');
  console.log(`Rollback committed successfully from snapshot: ${path.resolve(snapshotPath)}`);
}

async function main() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  assert(mongoUri, 'MONGO_URI or MONGODB_URI must be configured. Migration aborted before any database operation.');
  assert(!hasFlag('--execute') || !hasFlag('--rollback'), 'Choose exactly one of --execute or --rollback.');
  assert(!hasFlag('--execute') || hasFlag('--snapshot-path'), 'Production writes require both --execute and --snapshot-path <path>.');
  assert(!hasFlag('--rollback') || hasFlag('--snapshot-path'), 'Rollback requires --snapshot-path <path>.');

  await mongoose.connect(mongoUri, {
    dbName: process.env.MONGODB_DB_NAME || 'FabriQ',
    tlsAllowInvalidCertificates: true,
    readPreference: 'primary',
    serverSelectionTimeoutMS: 10000,
  });

  try {
    const db = mongoose.connection.db;
    if (hasFlag('--execute') || hasFlag('--rollback')) {
      assert(mongoose.connection.client.topology?.description?.type !== 'Single', 'Migration requires a replica set or sharded deployment with transaction support. No writes were attempted.');
    }
    if (hasFlag('--rollback')) await runRollback(db);
    else if (hasFlag('--execute')) await runMigration(db);
    else await runDryRun(db);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error(`Migration stopped: ${error.message}`);
  process.exitCode = 1;
});
