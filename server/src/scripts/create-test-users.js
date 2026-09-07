import 'dotenv/config';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { User } from '../models/User.js';
import { environment } from '../config/env.js';

const users = [
  {
    firstName: 'Admin',
    lastName: 'Admin',
    email: 'admin@fieldflow.com',
    password: 'Admin@123',
    role: 'IT_ADMIN',
  },
  {
    firstName: 'operator',
    lastName: 'operator',
    email: 'operator@fieldflow.test',
    password: 'Operator@123',
    role: 'OPERATOR',
  },
];

try {
  await mongoose.connect(environment.mongodbUri, {
    dbName: environment.mongodbDbName,
  });

  for (const data of users) {
    const passwordHash = await bcrypt.hash(
      data.password,
      environment.auth.bcryptRounds,
    );

    await User.findOneAndUpdate(
      { email: data.email },
      {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        passwordHash,
        role: data.role,
        status: 'ACTIVE',
        failedLoginAttempts: 0,
        tokenVersion: 0,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    console.log(`Created/updated ${data.role}: ${data.email}`);
  }
} finally {
  await mongoose.disconnect();
}
