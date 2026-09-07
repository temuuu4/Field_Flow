import mongoose from 'mongoose';
import { objectId, pointSchema } from './common.js';

export const COLLECTION_LOCATION_TYPES = Object.freeze({
  HOSPITAL: 'HOSPITAL',
  LAB: 'LAB',
  CLINIC: 'CLINIC',
  OTHER: 'OTHER',
});

const collectionLocationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    type: { type: String, enum: Object.values(COLLECTION_LOCATION_TYPES), default: COLLECTION_LOCATION_TYPES.HOSPITAL },
    location: { type: pointSchema, required: true },
    address: { type: String, trim: true, maxlength: 500 },
    description: { type: String, trim: true, maxlength: 2000 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

collectionLocationSchema.index({ name: 1 });
collectionLocationSchema.index({ active: 1 });
collectionLocationSchema.index({ location: '2dsphere' });

export const CollectionLocation = mongoose.model('CollectionLocation', collectionLocationSchema);
