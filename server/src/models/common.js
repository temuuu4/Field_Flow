import mongoose from 'mongoose';

const { Schema } = mongoose;

export const objectId = (ref, options = {}) => ({
  type: Schema.Types.ObjectId,
  ref,
  ...options,
});

export const pointSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
      required: true,
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (coordinates) => {
          if (!Array.isArray(coordinates) || coordinates.length !== 2) {
            return false;
          }
          const [longitude, latitude] = coordinates;
          return Number.isFinite(longitude)
            && Number.isFinite(latitude)
            && longitude >= -180
            && longitude <= 180
            && latitude >= -90
            && latitude <= 90;
        },
        message: 'A location must contain [longitude, latitude] within valid ranges',
      },
    },
  },
  { _id: false },
);

export const dateRangeValidator = (value) => !value || value instanceof Date;

export const uniqueNumbersValidator = (values) => {
  if (!Array.isArray(values) || values.length === 0) {
    return false;
  }
  return new Set(values).size === values.length;
};
