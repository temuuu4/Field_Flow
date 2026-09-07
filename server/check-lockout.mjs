import { connectToDatabase, disconnectFromDatabase } from './src/db/mongoose.js';
import { User } from './src/models/User.js';

try {
  await connectToDatabase();
  const user = await User.findOne({ email: 'audit-admin@fieldflow.local' }).select('+passwordHash');
  console.log('User state:');
  console.log('  failedLoginAttempts:', user.failedLoginAttempts);
  console.log('  lockedUntil:', user.lockedUntil);
  console.log('  isLocked (now):', user.isLocked);
  console.log('  tokenVersion:', user.tokenVersion);
  // Reset for next test
  await User.updateOne(
    { _id: user._id },
    { $set: { failedLoginAttempts: 0, lockedUntil: null } }
  );
  console.log('Reset failure state for further tests.');
  await disconnectFromDatabase();
  process.exit(0);
} catch (err) {
  console.error('Check failed:', err);
  process.exit(1);
}
