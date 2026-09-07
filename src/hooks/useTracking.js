import { useState, useEffect } from 'react';
import { isTracking, onTrackingEvent, startTracking, stopTracking, getCurrentJourneyId } from '../services/trackingService';

export function useTracking() {
  const [tracking, setTracking] = useState(isTracking());
  const [lastLocation, setLastLocation] = useState(null);
  const [lastError, setLastError] = useState('');
  const [trackingJourneyId, setTrackingJourneyId] = useState(getCurrentJourneyId);

  useEffect(() => {
    const unsubscribe = onTrackingEvent((event, data) => {
      switch (event) {
        case 'started':
          setTracking(true);
          setTrackingJourneyId(data?.journeyId ?? getCurrentJourneyId());
          setLastError('');
          break;
        case 'stopped':
          setTracking(false);
          setLastLocation(null);
          setTrackingJourneyId(null);
          break;
        case 'location':
          setLastLocation(data);
          setLastError('');
          break;
        case 'sent':
          break;
        case 'error':
          setLastError(data?.message || 'Location error');
          break;
        default:
          break;
      }
    });
    return unsubscribe;
  }, []);

  return {
    tracking,
    lastLocation,
    lastError,
    trackingJourneyId,
    startTracking,
    stopTracking,
    getCurrentJourneyId,
    isTracking,
  };
}
