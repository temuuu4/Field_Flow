import mongoose from 'mongoose';
import { ASSIGNMENT_TYPES, SAMPLE_STATUSES } from '../models/constants.js';
import { Assignment, AssignmentStop, AuditLog, DriverPresence, Journey, LocationPoint, Notification, PushSubscription, RecurringSchedule, Route, RouteStop, Sample, SystemSetting, User } from '../models/index.js';
import { distanceBetweenPoints, shouldPersistLocationPoint } from '../services/locationSampling.js';
import { calculateNextOccurrence } from '../services/recurringAssignmentService.js';

const driverId = new mongoose.Types.ObjectId();
const operatorId = new mongoose.Types.ObjectId();
const routeId = new mongoose.Types.ObjectId();
const assignmentId = new mongoose.Types.ObjectId();
const journeyId = new mongoose.Types.ObjectId();

const validPoint = { type: 'Point', coordinates: [38.752365, 9.019227] };

const assertValid = async (document, label) => {
  let error;
  try {
    await document.validate();
  } catch (validationError) {
    error = validationError;
  }
  if (error) {
    throw new Error(`${label} should be valid: ${error.message}`);
  }
};

const assertInvalid = async (document, label) => {
  let error;
  try {
    await document.validate();
  } catch (validationError) {
    error = validationError;
  }
  if (!error) {
    throw new Error(`${label} should be rejected by validation`);
  }
};

const user = new User({
  firstName: 'Demo',
  lastName: 'Driver',
  email: 'demo.driver@example.com',
  passwordHash: 'hashed-password-placeholder',
  role: 'DRIVER',
});

const route = new Route({ name: 'Demo Route', createdBy: operatorId });
const routeStop = new RouteStop({ routeId, name: 'Demo Stop', location: validPoint, sequence: 1 });
const assignmentStop = new AssignmentStop({ assignmentId, routeId, sourceRouteStopId: routeStop._id, name: 'Demo Stop', location: validPoint, sequence: 1 });
const specificAssignment = new Assignment({
  assignmentType: ASSIGNMENT_TYPES.SPECIFIC_LOCATION,
  driverId,
  createdBy: operatorId,
  targetLocation: validPoint,
  sampleType: 'Blood sample',
  scheduledStartAt: new Date(),
});
const invalidAssignment = new Assignment({
  assignmentType: ASSIGNMENT_TYPES.SPECIFIC_LOCATION,
  driverId,
  createdBy: operatorId,
  scheduledStartAt: new Date(),
});
const sample = new Sample({
  sampleNumber: 'SMP-VALIDATION-1',
  barcodeValue: '8901234567890',
  sampleType: 'Blood sample',
  driverId,
  assignmentId,
  collectionLocation: validPoint,
  gpsAccuracy: 8,
  collectedAt: new Date(),
  status: SAMPLE_STATUSES.PENDING,
});
const recurringSchedule = new RecurringSchedule({
  name: 'Validation weekly schedule',
  description: 'Validation schedule',
  createdBy: operatorId,
  driverId,
  assignmentType: ASSIGNMENT_TYPES.SPECIFIC_LOCATION,
  targetLocation: validPoint,
  sampleType: 'Blood sample',
  frequency: 'WEEKLY',
  daysOfWeek: [2],
  timeOfDay: '08:00',
  timezone: 'UTC',
  startDate: new Date('2030-01-01T00:00:00.000Z'),
});
const locationUpdate = {
  location: validPoint,
  recordedAt: new Date(),
};

await assertValid(user, 'User');
await assertValid(route, 'Route');
await assertValid(routeStop, 'RouteStop');
await assertValid(assignmentStop, 'AssignmentStop');
await assertValid(specificAssignment, 'specific Assignment');
await assertInvalid(invalidAssignment, 'incomplete specific Assignment');
await assertValid(sample, 'Sample');
await assertValid(recurringSchedule, 'RecurringSchedule');
const nextOccurrence = calculateNextOccurrence(recurringSchedule, new Date('2029-12-31T00:00:00.000Z'));
if (!nextOccurrence || nextOccurrence.toISOString() !== '2030-01-01T08:00:00.000Z') {
  throw new Error('Recurring schedule next-occurrence calculation failed');
}

const modelNames = [
  Assignment,
  AssignmentStop,
  AuditLog,
  DriverPresence,
  Journey,
  LocationPoint,
  Notification,
  PushSubscription,
  RecurringSchedule,
  Route,
  RouteStop,
  Sample,
  SystemSetting,
  User,
];

const missingIndexes = modelNames.filter((model) => model.schema.indexes().length === 0);
if (missingIndexes.length > 0) {
  throw new Error(`Models missing indexes: ${missingIndexes.map((model) => model.modelName).join(', ')}`);
}

const distance = distanceBetweenPoints(validPoint, { type: 'Point', coordinates: [38.753, 9.0195] });
if (!(distance > 0)) {
  throw new Error('Location distance calculation failed');
}
if (!shouldPersistLocationPoint(null, locationUpdate)) {
  throw new Error('The first GPS update must be persisted');
}

console.log(`Validated ${modelNames.length} Mongoose models and their schema indexes.`);
console.log('Validated conditional assignment and sample rules.');
console.log('Validated GPS distance and sampling behavior.');

await mongoose.disconnect();
