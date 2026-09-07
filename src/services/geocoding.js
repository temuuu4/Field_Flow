const NOMINATIM = 'https://nominatim.openstreetmap.org';

export async function reverseGeocode(lat, lng) {
  try {
    const url = `${NOMINATIM}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.display_name === 'string' ? data.display_name : null;
  } catch {
    return null;
  }
}

export async function searchPlaces(query) {
  const q = (query || '').trim();
  if (!q) return [];
  try {
    const url = `${NOMINATIM}/search?format=jsonv2&limit=5&addressdetails=0&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];
    return data.map((r) => ({
      name: r.name || r.display_name,
      address: r.display_name || '',
      lat: Number(r.lat),
      lng: Number(r.lon),
    }));
  } catch {
    return [];
  }
}

export function searchLocalCollectionLocations(locations, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return [];
  return (locations || [])
    .filter((loc) => (loc.name || '').toLowerCase().includes(q) || (loc.address || '').toLowerCase().includes(q))
    .slice(0, 8)
    .map((loc) => ({
      id: loc.id || loc._id,
      name: loc.name,
      address: loc.address || '',
      lat: loc.location?.coordinates?.[1],
      lng: loc.location?.coordinates?.[0],
    }));
}
