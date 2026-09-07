import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { assignmentsApi, collectionLocationsApi, journeysApi, routesApi } from '../api/fieldflow';
import { getCurrentPosition } from '../services/geolocation';
import { reverseGeocode, searchLocalCollectionLocations, searchPlaces } from '../services/geocoding';
import { getRoadRoute } from '../services/routing';

const id = (value) => value?._id || value?.id || value;
const asArray = (value) => Array.isArray(value) ? value : [];
const point = (geojson) => (geojson?.coordinates?.length === 2 ? [geojson.coordinates[1], geojson.coordinates[0]] : null);
const statusColor = (status) => ({ ASSIGNED: '#004CB3', IN_PROGRESS: '#d69a3d', COMPLETED: '#27a875', CANCELLED: '#bf5557' }[status] || '#717480');
const pin = (color) => L.divIcon({ className: 'map-marker-wrap', html: `<span class="map-marker" style="--marker:${color}">●</span>`, iconSize: [30, 30], iconAnchor: [15, 30] });
const hospitalPin = () => L.divIcon({ className: 'map-marker-wrap', html: '<span class="hospital-marker">✚</span>', iconSize: [26, 26], iconAnchor: [13, 26] });
const myLocationPin = (role) => L.divIcon({ className: 'map-marker-wrap', html: `<span class="my-location-marker">${role === 'DRIVER' ? '🛵' : '◎'}</span>`, iconSize: [30, 30], iconAnchor: [15, 30] });
const DEFAULT_CENTER = [9.0192, 38.7524];
const POLL_INTERVAL = 5000;

const driverName = (driver) => (driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || 'Driver' : 'Driver');
const assignmentTitle = (assignment) => assignment?.title || id(assignment) || 'assignment';

function journeyLabel(journey) {
  const name = driverName(journey?.driverId);
  const title = assignmentTitle(journey?.assignmentId);
  if (journey?.status === 'IN_PROGRESS') return `Active journey · ${name} — ${title}`;
  if (journey?.status === 'COMPLETED') return `Completed journey · ${name} — ${title}`;
  return `${journey?.status || 'UNKNOWN'} · ${name} — ${title}`;
}

function MapController({ focus, follow, flyTarget }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [map]);
  useEffect(() => {
    if (follow && focus && focus.length === 2) {
      map.setView(focus, Math.max(map.getZoom(), 14), { animate: true });
    }
  }, [map, focus, follow]);
  useEffect(() => {
    if (flyTarget && flyTarget.length === 2) {
      map.setView(flyTarget, Math.max(map.getZoom(), 15), { animate: true });
    }
  }, [map, flyTarget]);
  return null;
}

export default function OperationalMap({ user, selectedUser, users }) {
  const currentUser = user ?? selectedUser ?? null;
  const currentUserId = currentUser ? (currentUser.id || currentUser._id || null) : null;
  const currentRole = currentUser?.role || '';

  const [assignments, setAssignments] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [journeys, setJourneys] = useState([]);
  const [presences, setPresences] = useState([]);
  const [history, setHistory] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState('');
  const [trackDriverId, setTrackDriverId] = useState('');
  const [follow, setFollow] = useState(true);
  const [show, setShow] = useState({ assignments: true, routes: true, presence: true, history: true, hospitals: true });
  const [loading, setLoading] = useState(Boolean(currentUserId));
  const [error, setError] = useState('');
  const [stale, setStale] = useState('');
  const [myLocation, setMyLocation] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [query, setQuery] = useState('');
  const [mapResults, setMapResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [driverAddress, setDriverAddress] = useState('');
  const [driverRoutePath, setDriverRoutePath] = useState([]);

  const drivers = useMemo(() => (currentRole === 'DRIVER' ? [currentUser] : asArray(users).filter((candidate) => candidate?.role === 'DRIVER')), [currentRole, users, currentUser]);

  const fetchStatic = async () => {
    const filters = currentRole === 'DRIVER' ? { driverId: currentUserId } : {};
    const [assignmentList, routeList, hospitalList] = await Promise.all([
      assignmentsApi.list(filters).catch(() => []),
      routesApi.list().catch(() => []),
      collectionLocationsApi.list({ active: true }).catch(() => []),
    ]);
    setAssignments(asArray(assignmentList));
    setRoutes(asArray(routeList));
    setHospitals(asArray(hospitalList));
  };

  const fetchLive = async () => {
    const jFilters = currentRole === 'DRIVER' ? { driverId: currentUserId } : {};
    const [journeyList, presenceList] = await Promise.all([
      journeysApi.list(jFilters).catch(() => []),
      Promise.all(drivers.map(async (driver) => {
        const driverId = driver?.id || driver?._id || null;
        if (!driverId) return null;
        try { return await journeysApi.presence(driverId); } catch { return null; }
      })),
    ]);
    setJourneys(asArray(journeyList));
    setPresences(asArray(presenceList.filter(Boolean)));
  };

  const fetchHistory = async (journeyId) => {
    if (!journeyId) { setHistory([]); return; }
    const points = await journeysApi.history(journeyId).catch(() => []);
    setHistory(asArray(points));
  };

  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }
    let live = true;
    (async () => {
      setLoading(true); setError(''); setStale('');
      try {
        await Promise.all([fetchStatic(), fetchLive()]);
        if (selectedJourneyId) await fetchHistory(selectedJourneyId);
      } catch (requestError) {
        if (live) setError(requestError?.message || 'Unable to load map data.');
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [currentUserId, currentRole, users]);

  useEffect(() => {
    if (!currentUser) return undefined;
    let cancelled = false;
    const tick = async () => {
      try {
        await fetchLive();
        if (selectedJourneyId) await fetchHistory(selectedJourneyId);
        if (!cancelled) setStale('');
      } catch (requestError) {
        if (!cancelled) setStale(requestError?.message || 'Live updates paused.');
      }
    };
    const interval = setInterval(tick, POLL_INTERVAL);
    return () => { cancelled = true; clearInterval(interval); };
  }, [currentUserId, currentRole, users, selectedJourneyId]);

  useEffect(() => {
    fetchHistory(selectedJourneyId);
  }, [selectedJourneyId]);

  useEffect(() => {
    if (trackDriverId) return;
    const active = asArray(presences).find((presence) => presence?.active);
    if (active) setTrackDriverId(id(active.driver));
  }, [presences, trackDriverId]);

  const selectedJourney = asArray(journeys).find((journey) => id(journey) === selectedJourneyId) || null;
  const historyPath = asArray(history).map((entry) => point(entry?.location)).filter(Boolean);
  const historyCompleted = selectedJourney?.status === 'COMPLETED';

  const trackedPresence = asArray(presences).find((presence) => id(presence?.driver) === trackDriverId)
    || asArray(presences).find((presence) => presence?.active)
    || null;
  const trackedRecordedAt = trackedPresence?.latestLocation?.recordedAt;
  const focus = useMemo(() => point(trackedPresence?.latestLocation?.location) || DEFAULT_CENTER, [trackedRecordedAt, trackDriverId]);

  const localResults = useMemo(() => searchLocalCollectionLocations(hospitals, query), [hospitals, query]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!trackDriverId) { if (!cancelled) setDriverAddress(''); return; }
      const p = asArray(presences).find((x) => id(x?.driver) === trackDriverId);
      const loc = p?.latestLocation?.location;
      if (!loc) { if (!cancelled) setDriverAddress(''); return; }
      const addr = await reverseGeocode(loc.coordinates[1], loc.coordinates[0]);
      if (!cancelled) setDriverAddress(addr || '');
    };
    load();
    return () => { cancelled = true; };
  }, [trackDriverId, presences]);

  // Build a real road route from the driver's current location through
  // their active assignment stops, in sequence order. Falls back to an
  // empty array if OSRM is unreachable or the driver has no active trip.
  useEffect(() => {
    let cancelled = false;
    const compute = async () => {
      if (!currentUser || currentRole !== 'DRIVER' || !currentUserId) {
        if (!cancelled) setDriverRoutePath([]);
        return;
      }
      const activeAssignment = asArray(assignments).find((a) =>
        a?.status === 'ASSIGNED' || a?.status === 'IN_PROGRESS',
      );
      if (!activeAssignment?.stops?.length) {
        if (!cancelled) setDriverRoutePath([]);
        return;
      }
      const sortedStops = [...activeAssignment.stops].sort(
        (a, b) => (a?.sequence || 0) - (b?.sequence || 0),
      );
      const stopCoords = sortedStops
        .map((s) => s?.location?.coordinates)
        .filter((c) => Array.isArray(c) && c.length === 2);

      const driverLoc = myLocation
        ? [myLocation.lng, myLocation.lat]
        : asArray(presences)
            .find((p) => id(p?.driver) === currentUserId)
            ?.latestLocation?.location?.coordinates;

      const allCoords = driverLoc && stopCoords.length
        ? [driverLoc, ...stopCoords]
        : stopCoords;
      if (!allCoords.length) {
        if (!cancelled) setDriverRoutePath([]);
        return;
      }
      const route = await getRoadRoute(allCoords);
      if (!cancelled) setDriverRoutePath(route.path || []);
    };
    compute();
    return () => { cancelled = true; };
  }, [currentUser, currentRole, currentUserId, assignments, myLocation, presences]);

  if (!currentUser) {
    return <section className="card operational-map"><h2>Operational map</h2><p>No development user selected.</p></section>;
  }

  const locateMe = async () => {
    try {
      const pos = await getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
      const address = await reverseGeocode(pos.lat, pos.lng);
      setMyLocation({ lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, address, role: currentRole });
      setFlyTarget([pos.lat, pos.lng]);
      setFollow(false);
    } catch (e) {
      const msg = e?.code === 1 ? 'Location permission denied.' : e?.code === 2 ? 'Location unavailable.' : e?.code === 3 ? 'Location request timed out.' : e?.message || 'Could not get your location.';
      setMyLocation({ error: msg, role: currentRole });
    }
  };

  const onSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    try {
      const results = await searchPlaces(query);
      setMapResults(results);
    } finally {
      setSearching(false);
    }
  };

  const selectResult = (r) => {
    setFlyTarget([r.lat, r.lng]);
    setQuery(r.name || r.address);
    setMapResults([]);
  };

  const selectLocal = (loc) => {
    setFlyTarget([loc.lat, loc.lng]);
    setQuery(loc.name);
    setLocalResults([]);
    setMapResults([]);
  };

  return (
    <section className="card operational-map">
      <div className="sectiontitle"><div><h2>Operational map</h2><p>Real driver locations, presence, assignment geometry, and stored journey history.</p></div></div>

      <div className="map-wrap">
        <MapContainer center={focus} zoom={12} className="leaflet-map" scrollWheelZoom>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <MapController focus={focus} follow={follow} flyTarget={flyTarget} />

          {show.hospitals && asArray(hospitals).map((hospital) => {
            const position = point(hospital?.location);
            return position && <Marker key={id(hospital)} position={position} icon={hospitalPin()} eventHandlers={{ click: () => selectLocal({ id: hospital.id || hospital._id, name: hospital.name, address: hospital.address || '', lat: position[0], lng: position[1] }) }}><Popup><b>{hospital?.name || 'Hospital'}</b><br />{hospital?.type || 'HOSPITAL'}{hospital?.address ? ` · ${hospital.address}` : ''}</Popup></Marker>;
          })}

          {show.assignments && asArray(assignments).filter((assignment) => assignment?.assignmentType === 'SPECIFIC_LOCATION').map((assignment) => {
            const position = point(assignment?.targetLocation);
            return position && <Marker key={id(assignment)} position={position} icon={pin(statusColor(assignment?.status))}><Popup><b>{assignment?.title || 'Assignment'}</b><br />{assignment?.status || 'UNKNOWN'}</Popup></Marker>;
          })}

          {show.routes && asArray(routes).map((route) => <RouteLayer key={id(route)} route={route} />)}

          {show.assignments && asArray(assignments).filter((assignment) => assignment?.assignmentType === 'LANDMARK_ROUTE').map((assignment) => <AssignmentRouteLayer key={id(assignment)} assignment={assignment} />)}

          {currentRole === 'DRIVER' && driverRoutePath.length > 1 && (
            <Polyline positions={driverRoutePath} pathOptions={{ color: '#27a875', weight: 5, opacity: 0.9 }} />
          )}

          {show.presence && asArray(presences).map((presence) => {
            const position = point(presence?.latestLocation?.location);
            return position && (
              <CircleMarker key={id(presence.driver)} center={position} radius={9} pathOptions={{ color: presence?.active ? '#27a875' : '#717480', fillColor: presence?.active ? '#27a875' : '#717480', fillOpacity: 0.9 }} eventHandlers={{ click: () => setTrackDriverId(id(presence.driver)) }}>
                <Popup>
                  <b>{driverName(presence.driver)}</b><br />
                  {presence?.active ? 'Active journey' : 'Last known location'}
                  {presence?.currentAssignment ? ` · ${assignmentTitle(presence.currentAssignment)}` : ''}<br />
                  {presence?.latestLocation?.recordedAt ? new Date(presence.latestLocation.recordedAt).toLocaleString() : 'No timestamp'}
                  {presence?.latestLocation?.accuracy ? ` · ±${Math.round(presence.latestLocation.accuracy)}m` : ''}
                </Popup>
              </CircleMarker>
            );
          })}

          {show.history && historyPath.length > 1 && <Polyline positions={historyPath} pathOptions={{ color: '#004CB3', weight: 4 }} />}
          {show.history && historyPath.map((position, index) => {
            const isStart = index === 0;
            const isEnd = index === historyPath.length - 1;
            const color = isStart ? '#27a875' : (isEnd ? (historyCompleted ? '#bf5557' : '#004CB3') : '#004CB3');
            return (
              <CircleMarker key={`history-${index}`} center={position} radius={isStart || isEnd ? 6 : 3} pathOptions={{ color, fillColor: color, fillOpacity: 1 }}>
                <Popup>{isStart ? 'Start' : isEnd ? (historyCompleted ? 'End' : 'Latest') : `Point ${index + 1}`}<br />{new Date(asArray(history)[index]?.recordedAt || Date.now()).toLocaleString()}</Popup>
              </CircleMarker>
            );
          })}

          {myLocation && myLocation.lat != null && <Marker position={[myLocation.lat, myLocation.lng]} icon={myLocationPin(currentRole)}>
            <Popup><b>You are here</b><br />Role: {currentRole || 'User'}{myLocation.address ? <><br />{myLocation.address}</> : null}<br />Accuracy: ±{Math.round(myLocation.accuracy || 0)}m</Popup>
          </Marker>}
        </MapContainer>

        <div className="map-overlay map-search">
          <input
            placeholder="Search hospitals or map locations…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setMapResults([]); }}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
          />
          {localResults.length > 0 && (
            <div className="search-results">
              {localResults.map((r) => <button key={r.id} type="button" className="search-item" onClick={() => selectLocal(r)}><b>{r.name}</b><small>{r.address}</small></button>)}
            </div>
          )}
          {searching && <div className="search-results"><div className="search-item">Searching…</div></div>}
          {!searching && mapResults.length > 0 && (
            <div className="search-results">
              <div className="search-hint">Map results</div>
              {mapResults.map((r, i) => <button key={i} type="button" className="search-item" onClick={() => selectResult(r)}><b>{r.name}</b><small>{r.address}</small></button>)}
            </div>
          )}
        </div>

        <div className="map-overlay map-layers">
          <label><input type="checkbox" checked={show.hospitals} onChange={(e) => setShow({ ...show, hospitals: e.target.checked })} /> Hospitals</label>
          <label><input type="checkbox" checked={show.assignments} onChange={(e) => setShow({ ...show, assignments: e.target.checked })} /> Assignments</label>
          <label><input type="checkbox" checked={show.routes} onChange={(e) => setShow({ ...show, routes: e.target.checked })} /> Routes</label>
          <label><input type="checkbox" checked={show.presence} onChange={(e) => setShow({ ...show, presence: e.target.checked })} /> Drivers</label>
          <label><input type="checkbox" checked={show.history} onChange={(e) => setShow({ ...show, history: e.target.checked })} /> History</label>
          <select value={trackDriverId} onChange={(e) => setTrackDriverId(e.target.value)}>
            <option value="">Track driver</option>
            {asArray(presences).map((presence) => <option key={id(presence.driver)} value={id(presence.driver)}>{driverName(presence.driver)}{presence?.active ? ' (active)' : ''}</option>)}
          </select>
          <label><input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow</label>
          <select value={selectedJourneyId} onChange={(e) => setSelectedJourneyId(e.target.value)}>
            <option value="">Journey history</option>
            {asArray(journeys).map((journey) => <option key={id(journey)} value={id(journey)}>{journeyLabel(journey)}</option>)}
          </select>
        </div>

        <button type="button" className="map-mylocation" onClick={locateMe}>◎ My Location</button>

        {trackDriverId && trackedPresence && (
          <div className="map-driver-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <h4>{driverName(trackedPresence.driver)} {trackedPresence.driver?.role && <span className="badge gray">{trackedPresence.driver.role}</span>}</h4>
                <p>{trackedPresence?.active ? 'Active journey' : 'Last known location'}{trackedPresence?.currentAssignment ? ` · ${assignmentTitle(trackedPresence.currentAssignment)}` : ''}</p>
                <p>{trackedPresence?.latestLocation?.recordedAt ? `Updated ${new Date(trackedPresence.latestLocation.recordedAt).toLocaleString()}` : 'No position yet'}{trackedPresence?.latestLocation?.accuracy ? ` · ±${Math.round(trackedPresence.latestLocation.accuracy)}m` : ''}</p>
                {driverAddress && <p><small>Address: {driverAddress}</small></p>}
                {trackedPresence?.latestLocation?.location && <p><small>Lat: {trackedPresence.latestLocation.location.coordinates[1].toFixed(6)}, Lng: {trackedPresence.latestLocation.location.coordinates[0].toFixed(6)}</small></p>}
              </div>
              <button className="small" onClick={() => setFollow((f) => !f)}>{follow ? 'Unfollow' : 'Follow'}</button>
            </div>
          </div>
        )}

        {myLocation && myLocation.error && <div className="map-driver-card"><p className="form-error">My Location: {myLocation.error}</p></div>}
      </div>

      {loading && <p className="map-loading">Loading operational data…</p>}
      {error && <p className="form-error">{error}</p>}
      {!loading && !error && !asArray(assignments).length && !asArray(presences).length && <p className="map-loading">No mapped operational records are available.</p>}
    </section>
  );
}

function RouteLayer({ route }) {
  const [stops, setStops] = useState([]);
  const [roadPath, setRoadPath] = useState([]);
  useEffect(() => {
    if (!route) { setStops([]); setRoadPath([]); return; }
    routesApi.get(id(route)).then((value) => {
      const s = asArray(value?.stops);
      setStops(s);
      const coords = s.map((stop) => point(stop?.location)).filter(Boolean);
      if (coords.length > 1) {
        getRoadRoute(coords).then((result) => setRoadPath(result.path || [])).catch(() => setRoadPath([]));
      } else {
        setRoadPath([]);
      }
    }).catch(() => { setStops([]); setRoadPath([]); });
  }, [route]);
  const positions = asArray(stops).map((stop) => point(stop?.location)).filter(Boolean);
  const path = roadPath.length > 1 ? roadPath : positions;
  return <>{path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#004CB3', dashArray: '6 6' }} />}
    {asArray(stops).map((stop) => {
      const position = point(stop?.location);
      return position && <CircleMarker key={id(stop)} center={position} radius={6} pathOptions={{ color: '#004CB3' }}><Popup><b>{route?.name || 'Route'}</b><br />{stop?.sequence || 0}. {stop?.name || 'Stop'}</Popup></CircleMarker>;
    })}</>;
}

function AssignmentRouteLayer({ assignment }) {
  const [stops, setStops] = useState([]);
  const [roadPath, setRoadPath] = useState([]);
  useEffect(() => {
    if (!assignment) { setStops([]); setRoadPath([]); return; }
    assignmentsApi.get(id(assignment)).then((value) => {
      const s = asArray(value?.stops);
      setStops(s);
      const coords = s.map((stop) => point(stop?.location)).filter(Boolean);
      if (coords.length > 1) {
        getRoadRoute(coords).then((result) => setRoadPath(result.path || [])).catch(() => setRoadPath([]));
      } else {
        setRoadPath([]);
      }
    }).catch(() => { setStops([]); setRoadPath([]); });
  }, [assignment]);
  const positions = asArray(stops).map((stop) => point(stop?.location)).filter(Boolean);
  const path = roadPath.length > 1 ? roadPath : positions;
  return <>{path.length > 1 && <Polyline positions={path} pathOptions={{ color: statusColor(assignment?.status), weight: 4 }} />}
    {asArray(stops).map((stop) => {
      const position = point(stop?.location);
      return position && <CircleMarker key={id(stop)} center={position} radius={7} pathOptions={{ color: statusColor(assignment?.status) }}><Popup><b>{assignment?.title || 'Assignment'}</b><br />{stop?.sequence || 0}. {stop?.name || 'Stop'}<br />{stop?.status || 'UNKNOWN'}</Popup></CircleMarker>;
    })}</>;
}
