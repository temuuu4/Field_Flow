import crypto from 'node:crypto';
import { Assignment } from '../models/Assignment.js';
import { AssignmentStop } from '../models/AssignmentStop.js';
import { Journey } from '../models/Journey.js';
import { Sample } from '../models/Sample.js';
import { User } from '../models/User.js';
import { ASSIGNMENT_STATUSES, ASSIGNMENT_TYPES, ASSIGNMENT_STOP_STATUSES, AUDIT_ENTITY_TYPES, JOURNEY_STATUSES, SAMPLE_STATUSES, USER_ROLES } from '../models/constants.js';
import { ApiError } from '../errors/ApiError.js';
import { recordAudit } from '../services/auditLogService.js';
import { safeCreateNotification } from '../services/notificationService.js';
import { assertOperatorRole, assertUserRole } from '../services/operationRules.js';
import {
  parseSampleCreatePayload,
  parseSampleFilters,
  parseSampleUpdatePayload,
  sampleDeleteFields,
  sampleRejectFields,
  sampleReviewFields,
  sampleSubmitFields,
} from '../utils/sampleValidation.js';
import { parseObjectId, parseRequiredString, rejectUnknownFields } from '../utils/operationValidation.js';

const serialize = (document) => {
  const serialized = document?.toObject ? document.toObject({ virtuals: true }) : document;
  if (serialized) delete serialized.__v;
  return serialized;
};

const safeUserFields = 'firstName lastName email role status';

// Resolve the acting driver id used for ownership checks. Drivers may only
// act on their own samples — any client-supplied `driverId` is overridden
// with the server-validated caller id. Operators/admins can act on behalf
// of any driver (validated separately) so their `body.driverId` is
// honored.
function resolveActorDriverId(caller, requestedDriverId) {
  if (caller?.role === USER_ROLES.DRIVER) {
    if (requestedDriverId && String(requestedDriverId) !== String(caller.userId)) {
      throw new ApiError(403, 'Drivers may only act on their own samples');
    }
    return caller.userId;
  }
  return requestedDriverId;
}

async function getSampleOrFail(sampleId) {
  const sample = await Sample.findOne({ _id: sampleId, deletedAt: { $exists: false } })
    .populate('driverId', safeUserFields)
    .populate('reviewedBy', safeUserFields)
    .populate('deletedBy', safeUserFields)
    .populate('assignmentId', 'assignmentType title status driverId routeId scheduledStartAt')
    .populate('journeyId', 'driverId assignmentId status startedAt endedAt')
    .populate('routeId', 'name version status')
    .populate('assignmentStopId', 'assignmentId routeId name sequence status');
  if (!sample) throw new ApiError(404, 'Sample not found');
  return sample;
}

async function getActiveDriver(driverId, field = 'driver') {
  const driver = await User.findById(driverId);
  assertUserRole(driver, 'DRIVER', field);
  return driver;
}

async function getAssignmentContext({ assignmentId, driverId, journeyId, routeId, assignmentStopId }) {
  const assignment = await Assignment.findById(assignmentId);
  if (!assignment) throw new ApiError(404, 'Assignment not found');
  if (String(assignment.driverId) !== String(driverId)) {
    throw new ApiError(403, 'The assignment is not assigned to this driver');
  }
  if (![ASSIGNMENT_STATUSES.ASSIGNED, ASSIGNMENT_STATUSES.IN_PROGRESS].includes(assignment.status)) {
    throw new ApiError(409, `Samples cannot be collected for an assignment in ${assignment.status} status`);
  }

  let journey;
  if (journeyId) {
    journey = await Journey.findById(journeyId);
    if (!journey) throw new ApiError(404, 'Journey not found');
    if (String(journey.driverId) !== String(driverId) || String(journey.assignmentId) !== String(assignmentId)) {
      throw new ApiError(400, 'Journey must belong to the supplied driver and assignment');
    }
    if (journey.status !== JOURNEY_STATUSES.IN_PROGRESS) {
      throw new ApiError(409, 'Samples require an in-progress journey');
    }
  }

  if (assignment.assignmentType === ASSIGNMENT_TYPES.LANDMARK_ROUTE) {
    if (!assignment.routeId) throw new ApiError(400, 'Route assignment is missing its route');
    if (routeId && String(routeId) !== String(assignment.routeId)) {
      throw new ApiError(400, 'routeId does not match the assignment route');
    }
    if (!assignmentStopId) throw new ApiError(400, 'Route samples require assignmentStopId');
    const assignmentStop = await AssignmentStop.findById(assignmentStopId);
    if (!assignmentStop) throw new ApiError(404, 'Assignment stop not found');
    if (String(assignmentStop.assignmentId) !== String(assignmentId) || String(assignmentStop.routeId) !== String(assignment.routeId)) {
      throw new ApiError(400, 'Assignment stop does not belong to the assignment');
    }
    if (assignmentStop.status !== ASSIGNMENT_STOP_STATUSES.IN_PROGRESS) {
      throw new ApiError(409, 'Samples must be attached to the current in-progress assignment stop');
    }
  } else if (routeId || assignmentStopId) {
    throw new ApiError(400, 'Specific-location samples cannot reference a route stop');
  }

  return { assignment, journey };
}

function createSampleNumber() {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  return `FF-${date}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function assertSampleOwner(sample, driverId) {
  const driver = await getActiveDriver(driverId);
  if (String(sample.driverId) !== String(driver._id)) throw new ApiError(403, 'Only the assigned driver may modify this sample');
  return driver;
}

async function createSampleDocument(document) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await Sample.create({ ...document, sampleNumber: createSampleNumber() });
    } catch (error) {
      if (error.code !== 11000 || !Object.keys(error.keyPattern ?? {}).includes('sampleNumber')) throw error;
    }
  }
  throw new ApiError(500, 'Could not generate a unique sample identifier');
}

export async function createSample(request, response) {
  const payload = parseSampleCreatePayload(request.body);
  // Authorization: override any client-supplied driverId with the
  // server-validated caller id when the caller is a DRIVER.
  const effectiveDriverId = resolveActorDriverId(request.user, payload.driverId);
  const driver = await getActiveDriver(effectiveDriverId);
  // A driver's browser may suggest an assignment/stop, but an active field
  // workflow is server-derived. This prevents collecting against a stale or
  // arbitrary stop after the driver has moved on.
  if (request.user.role === USER_ROLES.DRIVER) {
    const activeJourney = await Journey.findOne({
      driverId: effectiveDriverId,
      assignmentId: payload.assignmentId,
      status: JOURNEY_STATUSES.IN_PROGRESS,
    });
    if (!activeJourney) throw new ApiError(409, 'Start the assigned journey before collecting a sample');
    if (payload.journeyId && String(payload.journeyId) !== String(activeJourney._id)) {
      throw new ApiError(403, 'Samples must belong to your current journey');
    }
    payload.journeyId = activeJourney._id;
    const workflowAssignment = await Assignment.findById(payload.assignmentId);
    if (workflowAssignment?.assignmentType === ASSIGNMENT_TYPES.SPECIFIC_LOCATION && !activeJourney.arrivedAt) {
      throw new ApiError(409, 'Confirm arrival before collecting a sample');
    }
    if (workflowAssignment?.assignmentType === ASSIGNMENT_TYPES.LANDMARK_ROUTE) {
      const activeStop = await AssignmentStop.findOne({ assignmentId: payload.assignmentId, status: ASSIGNMENT_STOP_STATUSES.IN_PROGRESS });
      if (!activeStop) throw new ApiError(409, 'There is no active route stop');
      if (!activeStop.arrivedAt) throw new ApiError(409, 'Confirm arrival before collecting a sample');
      if (payload.assignmentStopId && String(payload.assignmentStopId) !== String(activeStop._id)) {
        throw new ApiError(403, 'Samples must belong to the current active stop');
      }
      payload.assignmentStopId = activeStop._id;
      payload.routeId = workflowAssignment.routeId;
    }
  }
  const { assignment } = await getAssignmentContext({ ...payload, driverId: effectiveDriverId });
  const sampleType = payload.sampleType || assignment.sampleType || 'Route sample';
  const duplicate = await Sample.exists({ assignmentId: payload.assignmentId, barcodeValue: payload.barcodeValue, deletedAt: { $exists: false } });
  if (duplicate) throw new ApiError(409, 'This barcode has already been collected for this assignment');

  const sample = await createSampleDocument({
    ...payload,
    driverId: effectiveDriverId,
    sampleType,
    status: SAMPLE_STATUSES.PENDING,
    routeId: assignment.routeId ?? payload.routeId,
  });
  if (sample.assignmentStopId) {
    await AssignmentStop.updateOne(
      { _id: sample.assignmentStopId, status: ASSIGNMENT_STOP_STATUSES.IN_PROGRESS },
      { $set: { activeSampleId: sample._id, sampleCapturedAt: sample.collectedAt } },
    );
  } else if (sample.journeyId) {
    await Journey.updateOne(
      { _id: sample.journeyId, status: JOURNEY_STATUSES.IN_PROGRESS },
      { $set: { activeSampleId: sample._id } },
    );
  }
  await recordAudit({
    actorId: driver._id,
    action: 'SAMPLE_CREATED',
    entityType: AUDIT_ENTITY_TYPES.SAMPLE,
    entityId: sample._id,
    metadata: { assignmentId: assignment._id, barcodeValue: sample.barcodeValue },
    request,
  });
  response.status(201).json({ success: true, data: { sample: serialize(await getSampleOrFail(sample._id)) } });
}

export async function getSamples(request, response) {
  const filter = parseSampleFilters(request.query);
  if (request.user.role === USER_ROLES.DRIVER) {
    if (request.query.driverId !== undefined && String(filter.driverId) !== String(request.user.userId)) {
      throw new ApiError(403, 'You can only view your own samples');
    }
    filter.driverId = request.user.userId;
  }
  const samples = await Sample.find(filter)
    .sort({ createdAt: -1 })
    .populate('driverId', safeUserFields)
    .populate('reviewedBy', safeUserFields)
    .populate('assignmentId', 'assignmentType title status')
    .populate('journeyId', 'status startedAt endedAt')
    .populate('routeId', 'name version status')
    .populate('assignmentStopId', 'name sequence status');
  response.json({ success: true, data: { samples: samples.map(serialize) } });
}

export async function getSample(request, response) {
  const sampleId = parseObjectId(request.params.id, 'sample id');
  const sample = await getSampleOrFail(sampleId);
  if (request.user.role === USER_ROLES.DRIVER && String(sample.driverId?._id ?? sample.driverId) !== String(request.user.userId)) {
    throw new ApiError(403, 'You can only view your own samples');
  }
  response.json({ success: true, data: { sample: serialize(sample) } });
}

export async function updateSample(request, response) {
  const sampleId = parseObjectId(request.params.id, 'sample id');
  const updates = parseSampleUpdatePayload(request.body);
  const sample = await Sample.findOne({ _id: sampleId, deletedAt: { $exists: false } });
  if (!sample) throw new ApiError(404, 'Sample not found');
  if (sample.status !== SAMPLE_STATUSES.PENDING) throw new ApiError(409, 'Only pending samples can be updated');
  // Authorization: drivers may only update their own samples. The
  // server-validated caller id overrides any client-supplied driverId.
  const effectiveDriverId = resolveActorDriverId(request.user, updates.driverId);
  if (!effectiveDriverId) throw new ApiError(400, 'driverId is required to update a sample');
  await assertSampleOwner(sample, effectiveDriverId);
  delete updates.driverId;
  if (updates.barcodeValue && updates.barcodeValue !== sample.barcodeValue) {
    const duplicate = await Sample.exists({ assignmentId: sample.assignmentId, barcodeValue: updates.barcodeValue, deletedAt: { $exists: false }, _id: { $ne: sample._id } });
    if (duplicate) throw new ApiError(409, 'This barcode has already been collected for this assignment');
  }
  Object.assign(sample, updates);
  await sample.save();
  await recordAudit({ actorId: sample.driverId, action: 'SAMPLE_UPDATED', entityType: AUDIT_ENTITY_TYPES.SAMPLE, entityId: sample._id, request });
  response.json({ success: true, data: { sample: serialize(await getSampleOrFail(sample._id)) } });
}

export async function deleteSample(request, response) {
  rejectUnknownFields(request.body, sampleDeleteFields, 'sample deletion');
  const sampleId = parseObjectId(request.params.id, 'sample id');
  // Authorization: the server-validated caller id overrides body.driverId
  // for drivers so a malicious driver cannot delete another driver's
  // sample by spoofing `driverId` in the request body.
  const effectiveDriverId = resolveActorDriverId(request.user, parseObjectId(request.body.driverId, 'driverId'));
  const sample = await Sample.findOne({ _id: sampleId, deletedAt: { $exists: false } });
  if (!sample) throw new ApiError(404, 'Sample not found');
  if (sample.status !== SAMPLE_STATUSES.PENDING) throw new ApiError(409, 'Only pending samples can be deleted');
  await assertSampleOwner(sample, effectiveDriverId);
  sample.deletedAt = new Date();
  sample.deletedBy = effectiveDriverId;
  sample.deletionReason = request.body.reason ? parseRequiredString(request.body.reason, 'reason', 500) : undefined;
  await sample.save();
  await recordAudit({ actorId: effectiveDriverId, action: 'SAMPLE_DELETED', entityType: AUDIT_ENTITY_TYPES.SAMPLE, entityId: sample._id, metadata: { reason: sample.deletionReason }, request });
  response.json({ success: true, data: { sample: serialize(sample) } });
}

export async function submitSample(request, response) {
  rejectUnknownFields(request.body, sampleSubmitFields, 'sample submission');
  const sampleId = parseObjectId(request.params.id, 'sample id');
  // Authorization: the server-validated caller id overrides body.driverId
  // for drivers so a malicious driver cannot submit another driver's
  // sample by spoofing `driverId` in the request body.
  const effectiveDriverId = resolveActorDriverId(request.user, parseObjectId(request.body.driverId, 'driverId'));
  const sample = await Sample.findOne({ _id: sampleId, deletedAt: { $exists: false } });
  if (!sample) throw new ApiError(404, 'Sample not found');
  await assertSampleOwner(sample, effectiveDriverId);
  if (sample.status !== SAMPLE_STATUSES.PENDING) throw new ApiError(400, `Cannot submit a sample in ${sample.status} status`);
  sample.status = SAMPLE_STATUSES.SUBMITTED;
  sample.submittedAt = new Date();
  await sample.save();
  if (sample.assignmentStopId) {
    await AssignmentStop.updateOne(
      { _id: sample.assignmentStopId, activeSampleId: sample._id, status: ASSIGNMENT_STOP_STATUSES.IN_PROGRESS },
      { $set: { sampleSubmittedAt: sample.submittedAt } },
    );
  } else if (sample.journeyId) {
    await Journey.updateOne(
      { _id: sample.journeyId, activeSampleId: sample._id, status: JOURNEY_STATUSES.IN_PROGRESS },
      { $set: { activeSampleId: sample._id } },
    );
  }
  await recordAudit({ actorId: effectiveDriverId, action: 'SAMPLE_SUBMITTED', entityType: AUDIT_ENTITY_TYPES.SAMPLE, entityId: sample._id, request });
  const assignment = await Assignment.findById(sample.assignmentId).select('createdBy');
  if (assignment?.createdBy) {
    await safeCreateNotification({
      recipientId: assignment.createdBy,
      type: 'SAMPLE_SUBMITTED',
      message: `Sample ${sample.sampleNumber} was submitted for review`,
      assignmentId: sample.assignmentId,
      journeyId: sample.journeyId,
      sampleId: sample._id,
    });
  }
  response.json({ success: true, data: { sample: serialize(await getSampleOrFail(sample._id)) } });
}

async function getReviewer(reviewerId) {
  const reviewer = await User.findById(reviewerId);
  assertOperatorRole(reviewer, 'reviewer');
  return reviewer;
}

export async function approveSample(request, response) {
  rejectUnknownFields(request.body, sampleReviewFields, 'sample approval');
  const sampleId = parseObjectId(request.params.id, 'sample id');
  const reviewerId = request.user.userId;
  const sample = await Sample.findOne({ _id: sampleId, deletedAt: { $exists: false } });
  if (!sample) throw new ApiError(404, 'Sample not found');
  const reviewer = await getReviewer(reviewerId);
  if (sample.status !== SAMPLE_STATUSES.SUBMITTED) throw new ApiError(400, `Only submitted samples can be approved; current status is ${sample.status}`);
  sample.status = SAMPLE_STATUSES.APPROVED;
  sample.reviewedBy = reviewer._id;
  sample.reviewedAt = new Date();
  await sample.save();
  await recordAudit({ actorId: reviewer._id, action: 'SAMPLE_APPROVED', entityType: AUDIT_ENTITY_TYPES.SAMPLE, entityId: sample._id, request });
  await safeCreateNotification({
    recipientId: sample.driverId,
    type: 'SAMPLE_APPROVED',
    message: `Sample ${sample.sampleNumber} was approved`,
    assignmentId: sample.assignmentId,
    journeyId: sample.journeyId,
    sampleId: sample._id,
  });
  response.json({ success: true, data: { sample: serialize(await getSampleOrFail(sample._id)) } });
}

export async function rejectSample(request, response) {
  rejectUnknownFields(request.body, sampleRejectFields, 'sample rejection');
  const sampleId = parseObjectId(request.params.id, 'sample id');
  const reviewerId = request.user.userId;
  const rejectionReason = parseRequiredString(request.body.rejectionReason, 'rejectionReason', 1000);
  const sample = await Sample.findOne({ _id: sampleId, deletedAt: { $exists: false } });
  if (!sample) throw new ApiError(404, 'Sample not found');
  const reviewer = await getReviewer(reviewerId);
  if (sample.status !== SAMPLE_STATUSES.SUBMITTED) throw new ApiError(400, `Only submitted samples can be rejected; current status is ${sample.status}`);
  sample.status = SAMPLE_STATUSES.REJECTED;
  sample.reviewedBy = reviewer._id;
  sample.reviewedAt = new Date();
  sample.rejectionReason = rejectionReason;
  await sample.save();
  await recordAudit({ actorId: reviewer._id, action: 'SAMPLE_REJECTED', entityType: AUDIT_ENTITY_TYPES.SAMPLE, entityId: sample._id, metadata: { rejectionReason }, request });
  await safeCreateNotification({
    recipientId: sample.driverId,
    type: 'SAMPLE_REJECTED',
    message: `Sample ${sample.sampleNumber} was rejected: ${rejectionReason}`,
    assignmentId: sample.assignmentId,
    journeyId: sample.journeyId,
    sampleId: sample._id,
  });
  response.json({ success: true, data: { sample: serialize(await getSampleOrFail(sample._id)) } });
}
