import { CollectionLocation } from '../models/CollectionLocation.js';
import { COLLECTION_LOCATION_TYPES } from '../models/CollectionLocation.js';
import { ApiError } from '../errors/ApiError.js';
import { parseEnum, parseObjectId, parseOptionalString, parseRequiredString, parseFlatLocation, rejectUnknownFields } from '../utils/operationValidation.js';

const createFields = new Set(['name', 'type', 'latitude', 'longitude', 'address', 'description']);

const serialize = (document) => {
  const serialized = document?.toObject ? document.toObject({ virtuals: true }) : document;
  if (serialized) delete serialized.__v;
  return serialized;
};

export async function listCollectionLocations(request, response) {
  const filter = {};
  if (request.query.active !== undefined) {
    filter.active = request.query.active === 'true' || request.query.active === '1';
  }
  if (request.query.type !== undefined) {
    filter.type = parseEnum(request.query.type, 'type', Object.values(COLLECTION_LOCATION_TYPES), { required: true });
  }
  const locations = await CollectionLocation.find(filter).sort({ name: 1 });
  response.json({ success: true, data: { collectionLocations: locations.map(serialize) } });
}

export async function createCollectionLocation(request, response) {
  rejectUnknownFields(request.body, createFields, 'collection location');
  const name = parseRequiredString(request.body.name, 'name', 200);
  const type = parseEnum(request.body.type, 'type', Object.values(COLLECTION_LOCATION_TYPES)) || COLLECTION_LOCATION_TYPES.HOSPITAL;
  const location = parseFlatLocation(request.body, 'location', { required: true });
  const document = await CollectionLocation.create({
    name,
    type,
    location: location.point,
    address: location.address,
    description: parseOptionalString(request.body.description, 'description', 2000),
    active: true,
  });
  response.status(201).json({ success: true, data: { collectionLocation: serialize(document) } });
}

export async function getCollectionLocation(request, response) {
  const locationId = parseObjectId(request.params.id, 'collection location id');
  const document = await CollectionLocation.findById(locationId);
  if (!document) {
    throw new ApiError(404, 'Collection location not found');
  }
  response.json({ success: true, data: { collectionLocation: serialize(document) } });
}
