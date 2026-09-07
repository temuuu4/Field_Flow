import mongoose from 'mongoose';
import { environment } from '../config/env.js';

mongoose.set('strictQuery', true);

export async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(environment.mongodbUri, {
    dbName: environment.mongodbDbName,
    serverSelectionTimeoutMS: 10000,
  });

  return mongoose.connection;
}

export async function disconnectFromDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}
