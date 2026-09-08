import app from './app.js';
import { environment } from './config/env.js';
import { connectToDatabase, disconnectFromDatabase } from './db/mongoose.js';
import { seedCollectionLocations } from './services/collectionLocationSeed.js';
import { startRecurringScheduler, stopRecurringScheduler } from './services/recurringScheduler.js';
import './models/index.js';

let httpServer;
let shuttingDown = false;

const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
  }
  stopRecurringScheduler();
  await disconnectFromDatabase();
  console.log(`FieldFlow backend stopped after ${signal}`);
};

// Last-line-of-defence logging for uncaught errors. We do NOT swallow them;
// after logging we let the process exit with a non-zero code so an
// orchestrator (systemd, Docker, k8s) can restart us. In production these
// handlers also ensure the error reaches the server log instead of silently
// terminating the process.
process.on('unhandledRejection', (reason) => {
  // Serialize the message/stack separately so an attacker-controlled payload
  // cannot influence downstream log parsers.
  const message = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  console.error(`[unhandledRejection] ${message}`);
  if (stack && process.env.NODE_ENV !== 'production') console.error(stack);
});

process.on('uncaughtException', (error) => {
  console.error(`[uncaughtException] ${error.message}`);
  if (process.env.NODE_ENV !== 'production') console.error(error.stack);
  shutdown('uncaughtException').finally(() => {
    process.exit(1);
  });
});

try {
  await connectToDatabase();
  try {
    const seeded = await seedCollectionLocations();
    if (seeded > 0) console.log(`Seeded ${seeded} collection location(s).`);
  } catch (seedError) {
    console.error(`Collection location seed failed: ${seedError.message}`);
  }
  httpServer = app.listen(environment.port, () => {
    console.log(`FieldFlow backend listening on port ${environment.port}`);
  });
  startRecurringScheduler(environment.recurringSchedulerIntervalSeconds * 1000);
} catch (error) {
  console.error(`Unable to start FieldFlow backend: ${error.message}`);
  process.exitCode = 1;
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
