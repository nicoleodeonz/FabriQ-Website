import mongoose from 'mongoose';
import AdminAccount from '../models/Admin.js';
import StaffAccount from '../models/Staff.js';
import { loadEnvironment } from '../config/loadEnv.js';

loadEnvironment();

const adminAccounts = [
  {
    firstName: 'Hannah',
    lastName: 'Cayaban',
    email: 'hannahcayaban@gmail.com',
    password: 'Admin123!',
    createdAt: new Date(Date.UTC(2026, 8, 10)),
  },
  {
    firstName: 'Vivian',
    lastName: 'Cayaban',
    email: 'vivianlamielcabayan@gmail.com',
    password: 'Admin123!',
    createdAt: new Date(Date.UTC(2026, 8, 10)),
  },
];

const staffAccounts = [
  {
    firstName: 'Paolo',
    lastName: 'Cayaban',
    email: 'pao.cayaban@gmail.com',
    password: 'Staff123!',
    preferredBranch: 'BGC Branch',
    createdAt: new Date(Date.UTC(2026, 8, 7)),
  },
  {
    firstName: 'Anne',
    lastName: 'Cayaban',
    email: 'cayabanannemarie@gmail.com',
    password: 'Staff123!',
    preferredBranch: 'Makati Branch',
    createdAt: new Date(Date.UTC(2026, 8, 11)),
  },
  {
    firstName: 'Edward',
    lastName: 'Cayaban',
    email: 'edwardcayaban@gmail.com',
    password: 'Staff123!',
    preferredBranch: 'Quezon Branch',
    createdAt: new Date(Date.UTC(2026, 8, 13)),
  },
];

async function createIfMissing(Model, role, account) {
  const email = account.email.toLowerCase();
  const [existingAdmin, existingStaff] = await Promise.all([
    AdminAccount.exists({ email }),
    StaffAccount.exists({ email }),
  ]);

  if (existingAdmin || existingStaff) {
    console.log(`Skipped existing account: ${email}`);
    return;
  }

  await Model.create({
    ...account,
    email,
    mustChangePassword: true,
    status: 'active',
  });
  console.log(`Created ${role} account: ${email}`);
}

async function seedAccounts() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required');
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    dbName: process.env.MONGODB_DB_NAME || 'FabriQ',
  });

  try {
    for (const account of adminAccounts) {
      await createIfMissing(AdminAccount, 'admin', account);
    }
    for (const account of staffAccounts) {
      await createIfMissing(StaffAccount, 'staff', account);
    }
  } finally {
    await mongoose.disconnect();
  }
}

seedAccounts().catch((error) => {
  console.error(`Account bootstrap failed (${error?.name || 'Error'}).`);
  process.exitCode = 1;
});