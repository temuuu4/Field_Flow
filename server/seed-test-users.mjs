import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { User } from '/home/temu/Downloads/Barcode Scanner and Location Tracker Web Application/server/src/models/User.js';
import { connectToDatabase, disconnectFromDatabase } from '/home/temu/Downloads/Barcode Scanner and Location Tracker Web Application/server/src/db/mongoose.js';
import { environment } from '/home/temu/Downloads/Barcode Scanner and Location Tracker Web Application/server/src/config/env.js';

try {
  await connectToDatabase();
  const rounds = environment.auth.bcryptRounds;
  const adminHash = await bcrypt.hash('AdminPass123!', rounds);
  const driverHash = await bcrypt.hash('DriverPass123!', rounds);

  // Use upsert to make idempotent
  const admin = await User.findOneAndUpdate(
    { email: 'audit-admin@fieldflow.local' },
    {
      $set: {
        firstName: 'Audit',
        lastName: 'Admin',
        email: 'audit-admin@fieldflow.local',
        passwordHash: adminHash,
        role: 'IT_ADMIN',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: 0,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log('Admin user:', admin.email, 'role:', admin.role, 'status:', admin.status);

  const driver = await User.findOneAndUpdate(
    { email: 'audit-driver@fieldflow.local' },
    {
      $set: {
        firstName: 'Audit',
        lastName: 'Driver',
        email: 'audit-driver@fieldflow.local',
        passwordHash: driverHash,
        role: 'DRIVER',
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        lockedUntil: null,
        tokenVersion: 0,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  console.log('Driver user:', driver.email, 'role:', driver.role, 'status:', driver.status);
  await disconnectFromDatabase();
  process.exit(0);
} catch (err) {
  console.error('Seed failed:', err);
  process.exit(1);
}
