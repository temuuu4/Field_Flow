export function getCurrentPosition(options = {}) {
  const { enableHighAccuracy = true, timeout = 15000, maximumAge = 0 } = options;
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(Object.assign(new Error('Geolocation is not supported on this device or browser.'), { code: 'UNSUPPORTED' }));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, ts: pos.timestamp }),
      (err) => reject(err),
      { enableHighAccuracy, timeout, maximumAge },
    );
  });
}
