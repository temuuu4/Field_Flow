import { environment } from '../config/env.js';

const EARTH_RADIUS_METERS = 6371000;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

export function distanceBetweenPoints(previousPoint, currentPoint) {
  const [previousLongitude, previousLatitude] = previousPoint.coordinates;
  const [currentLongitude, currentLatitude] = currentPoint.coordinates;
  const latitudeDelta = toRadians(currentLatitude - previousLatitude);
  const longitudeDelta = toRadians(currentLongitude - previousLongitude);
  const previousLatitudeRadians = toRadians(previousLatitude);
  const currentLatitudeRadians = toRadians(currentLatitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(previousLatitudeRadians)
    * Math.cos(currentLatitudeRadians)
    * Math.sin(longitudeDelta / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(haversine));
}

export function shouldPersistLocationPoint(previousPresence, currentUpdate, isImportantEvent = false) {
  if (isImportantEvent || !previousPresence) {
    return true;
  }

  const elapsedMilliseconds = new Date(currentUpdate.recordedAt).getTime()
    - new Date(previousPresence.recordedAt).getTime();
  const distanceMeters = distanceBetweenPoints(previousPresence.location, currentUpdate.location);

  return elapsedMilliseconds >= environment.locationSampleIntervalSeconds * 1000
    || distanceMeters >= environment.locationSampleMinDistanceMeters;
}
