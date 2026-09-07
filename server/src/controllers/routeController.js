import { Route } from '../models/Route.js';
import { RouteStop } from '../models/RouteStop.js';
import { CollectionLocation } from '../models/CollectionLocation.js';
import { Assignment } from '../models/Assignment.js';
import { User } from '../models/User.js';
import { ApiError } from '../errors/ApiError.js';
import { assertOperatorRole } from '../services/operationRules.js';
import { parseFlatLocation, parseObjectId, parseOptionalString, parseRequiredString, parseRouteStatus, parseRouteStopStatus, rejectUnknownFields } from '../utils/operationValidation.js';

const routeFields = new Set(['name', 'description', 'createdBy', 'status']);
const stopFields = new Set(['name', 'description', 'latitude', 'longitude', 'address', 'sequence', 'sampleType', 'status', 'collectionLocationId']);

async function resolveStopFromCollectionLocation(collectionLocationId) {
  const location = await CollectionLocation.findById(parseObjectId(collectionLocationId, 'collectionLocationId'));
  if (!location) {
    throw new ApiError(404, 'Collection location not found');
  }
  return { name: location.name, location: location.location, address: location.address };
}

const serialize = (document) => {
  const serialized = document?.toObject ? document.toObject({ virtuals: true }) : document;
  if (serialized) delete serialized.__v;
  return serialized;
};

async function getRouteOrFail(routeId) {
  const route = await Route.findById(routeId).populate('createdBy', 'firstName lastName email role status');
  if (!route) {
    throw new ApiError(404, 'Route not found');
  }
  return route;
}

async function bumpRouteVersion(routeId) {
  await Route.updateOne({ _id: routeId }, { $inc: { version: 1 } });
}

async function validateRouteStopPayload(payload, { requireSequence = true } = {}) {
  rejectUnknownFields(payload, stopFields, 'route stop');
  let name;
  let location;
  let address;
  if (payload.collectionLocationId !== undefined) {
    const resolved = await resolveStopFromCollectionLocation(payload.collectionLocationId);
    name = resolved.name;
    location = resolved.location;
    address = resolved.address;
  } else {
    const flat = parseFlatLocation(payload, 'route stop location', { required: true });
    name = parseRequiredString(payload.name, 'name', 160);
    location = flat.point;
    address = flat.address;
  }
  const sequence = payload.sequence;
  if (requireSequence && (!Number.isInteger(sequence) || sequence < 1)) {
    throw new ApiError(400, 'sequence must be a positive integer');
  }
  return {
    name,
    description: parseOptionalString(payload.description, 'description', 1000),
    location,
    address,
    sequence,
    sampleType: parseOptionalString(payload.sampleType, 'sampleType', 120),
    status: parseRouteStopStatus(payload.status),
  };
}

export async function createRoute(request, response) {
  rejectUnknownFields(request.body, routeFields, 'route');
  const creatorId = parseObjectId(request.body.createdBy, 'createdBy');
  const creator = await User.findById(creatorId);
  assertOperatorRole(creator);
  const route = await Route.create({
    name: parseRequiredString(request.body.name, 'name', 160),
    description: parseOptionalString(request.body.description, 'description', 2000),
    createdBy: creatorId,
    status: parseRouteStatus(request.body.status),
  });
  response.status(201).json({ success: true, data: { route: serialize(route), stops: [] } });
}

export async function getRoutes(request, response) {
  const filter = {};
  if (request.query.status !== undefined) {
    filter.status = parseRouteStatus(request.query.status);
  }
  if (request.query.createdBy !== undefined) {
    filter.createdBy = parseObjectId(request.query.createdBy, 'createdBy');
  }
  const routes = await Route.find(filter)
    .sort({ createdAt: -1 })
    .populate('createdBy', 'firstName lastName email role status');
  response.json({ success: true, data: { routes: routes.map(serialize) } });
}

export async function getRoute(request, response) {
  const routeId = parseObjectId(request.params.id, 'route id');
  const route = await getRouteOrFail(routeId);
  const stops = await RouteStop.find({ routeId }).sort({ sequence: 1 });
  response.json({ success: true, data: { route: serialize(route), stops: stops.map(serialize) } });
}

export async function updateRoute(request, response) {
  rejectUnknownFields(request.body, new Set(['name', 'description', 'status']), 'route');
  const route = await Route.findById(parseObjectId(request.params.id, 'route id'));
  if (!route) {
    throw new ApiError(404, 'Route not found');
  }
  if (request.body.name !== undefined) route.name = parseRequiredString(request.body.name, 'name', 160);
  if (request.body.description !== undefined) route.description = parseOptionalString(request.body.description, 'description', 2000);
  if (request.body.status !== undefined) route.status = parseRouteStatus(request.body.status);
  await route.save();
  response.json({ success: true, data: { route: serialize(route) } });
}

export async function deleteRoute(request, response) {
  const routeId = parseObjectId(request.params.id, 'route id');
  const route = await Route.findById(routeId);
  if (!route) {
    throw new ApiError(404, 'Route not found');
  }
  const activeAssignments = await Assignment.countDocuments({
    routeId,
    status: { $nin: ['COMPLETED', 'CANCELLED', 'EXPIRED'] },
  });
  if (activeAssignments > 0) {
    throw new ApiError(409, 'Route cannot be archived while active assignments reference it');
  }
  route.status = 'ARCHIVED';
  await route.save();
  response.json({ success: true, data: { route: serialize(route) } });
}

export async function createRouteStop(request, response) {
  const routeId = parseObjectId(request.params.routeId, 'route id');
  const route = await Route.findById(routeId);
  if (!route) {
    throw new ApiError(404, 'Route not found');
  }
  if (route.status !== 'ACTIVE') {
    throw new ApiError(409, 'Stops cannot be added to an archived route');
  }
  const stop = await RouteStop.create({ routeId, ...(await validateRouteStopPayload(request.body)) });
  await bumpRouteVersion(routeId);
  response.status(201).json({ success: true, data: { stop: serialize(stop) } });
}

export async function getRouteStops(request, response) {
  const routeId = parseObjectId(request.params.routeId, 'route id');
  await getRouteOrFail(routeId);
  const stops = await RouteStop.find({ routeId }).sort({ sequence: 1 });
  response.json({ success: true, data: { stops: stops.map(serialize) } });
}

export async function updateRouteStop(request, response) {
  const routeId = parseObjectId(request.params.routeId, 'route id');
  const stopId = parseObjectId(request.params.stopId, 'stop id');
  await getRouteOrFail(routeId);
  const stop = await RouteStop.findOne({ _id: stopId, routeId });
  if (!stop) {
    throw new ApiError(404, 'Route stop not found');
  }
  rejectUnknownFields(request.body, stopFields, 'route stop');
  if (request.body.name !== undefined) stop.name = parseRequiredString(request.body.name, 'name', 160);
  if (request.body.description !== undefined) stop.description = parseOptionalString(request.body.description, 'description', 1000);
  if (request.body.collectionLocationId !== undefined) {
    const resolved = await resolveStopFromCollectionLocation(request.body.collectionLocationId);
    stop.name = resolved.name;
    stop.location = resolved.location;
    stop.address = resolved.address;
  } else if (request.body.latitude !== undefined || request.body.longitude !== undefined || request.body.address !== undefined) {
    const location = parseFlatLocation(request.body, 'route stop location', { required: true });
    stop.location = location.point;
    stop.address = location.address;
  }
  if (request.body.sequence !== undefined) {
    if (!Number.isInteger(request.body.sequence) || request.body.sequence < 1) {
      throw new ApiError(400, 'sequence must be a positive integer');
    }
    stop.sequence = request.body.sequence;
  }
  if (request.body.sampleType !== undefined) stop.sampleType = parseOptionalString(request.body.sampleType, 'sampleType', 120);
  if (request.body.status !== undefined) stop.status = parseRouteStopStatus(request.body.status);
  await stop.save();
  await bumpRouteVersion(routeId);
  response.json({ success: true, data: { stop: serialize(stop) } });
}

export async function deleteRouteStop(request, response) {
  const routeId = parseObjectId(request.params.routeId, 'route id');
  const stopId = parseObjectId(request.params.stopId, 'stop id');
  await getRouteOrFail(routeId);
  const stop = await RouteStop.findOne({ _id: stopId, routeId });
  if (!stop) {
    throw new ApiError(404, 'Route stop not found');
  }
  const referenced = await Assignment.exists({ routeId, status: { $nin: ['COMPLETED', 'CANCELLED', 'EXPIRED'] } });
  if (referenced) {
    throw new ApiError(409, 'Route stops cannot be deleted while the route has active assignments');
  }
  await stop.deleteOne();
  await bumpRouteVersion(routeId);
  response.json({ success: true, data: { deleted: true, stopId } });
}
