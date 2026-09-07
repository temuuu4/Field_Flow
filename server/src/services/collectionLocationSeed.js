import { CollectionLocation } from '../models/CollectionLocation.js';

const HOSPITALS = [
  { name: "St. Paul's Hospital Millennium Medical College", type: 'HOSPITAL', latitude: 9.0158, longitude: 38.7475 },
  { name: 'Tikur Anbessa (Black Lion) Specialized Hospital', type: 'HOSPITAL', latitude: 9.0558, longitude: 38.7297 },
  { name: 'Yekatit 12 Hospital', type: 'HOSPITAL', latitude: 9.0438, longitude: 38.7612 },
  { name: 'ALERT Comprehensive Specialized Hospital', type: 'HOSPITAL', latitude: 8.9856, longitude: 38.7104 },
  { name: "St. Peter's Specialized Hospital", type: 'HOSPITAL', latitude: 9.0715, longitude: 38.7470 },
  { name: 'Zewditu Memorial Hospital', type: 'HOSPITAL', latitude: 9.0175, longitude: 38.7618 },
  { name: 'Minilik II Referral Hospital', type: 'HOSPITAL', latitude: 9.0345, longitude: 38.7629 },
  { name: 'Tirunesh Beijing General Hospital', type: 'HOSPITAL', latitude: 8.8851, longitude: 38.7844 },
  { name: 'Gandhi Memorial Hospital', type: 'HOSPITAL', latitude: 9.0135, longitude: 38.7512 },
  { name: 'Ras Desta Damtew General Hospital', type: 'HOSPITAL', latitude: 9.0385, longitude: 38.7468 },
];

export async function seedCollectionLocations() {
  const operations = HOSPITALS.map((hospital) => ({
    updateOne: {
      filter: { name: hospital.name },
      update: {
        $setOnInsert: {
          name: hospital.name,
          type: hospital.type,
          location: { type: 'Point', coordinates: [hospital.longitude, hospital.latitude] },
          address: '',
          active: true,
        },
      },
      upsert: true,
    },
  }));

  const result = await CollectionLocation.bulkWrite(operations);
  return result.upsertedCount;
}
