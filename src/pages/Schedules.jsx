import { useEffect, useState } from 'react';
import { schedulesApi, collectionLocationsApi } from '../api/fieldflow';
import { getUsers } from '../api/users';
import { useLoad, Page, Notice, uid, fail, present } from './utils';
import { Button, SectionCard, FormField } from '../components/ui';
import { useToast } from '../components/Toast';

const todayIso = new Date().toISOString().slice(0, 10);

export default function Schedules({ u }) {
  const toast = useToast();
  const q = useLoad(() => schedulesApi.list());
  const cl = useLoad(() => collectionLocationsApi.list({ active: true }));
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  // Drivers list is loaded lazily. With real auth, operators/admins hit
  // `/api/users?role=DRIVER` (admins/operators only). The page remains
  // usable without it if the backend refuses the listing.
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const list = await getUsers({ role: 'DRIVER' });
        if (live) setDrivers((list || []).map((user, index) => present(user, index)).filter(Boolean));
      } catch (e) {
        // ignore — the dropdown will simply be empty
      }
    })();
    return () => { live = false; };
  }, []);
  const [actionLoading, setActionLoading] = useState({});

  const [form, setForm] = useState({
    name: '',
    driverId: '',
    assignmentType: 'SPECIFIC_LOCATION',
    sampleType: '',
    frequency: 'DAILY',
    timeOfDay: '',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    startDate: '',
    collectionLocationId: '',
  });

  const activeHospitals = cl.data || [];

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      if (!form.name.trim()) {
        setFormError('Name is required.');
        return;
      }
      if (!form.collectionLocationId) {
        setFormError('Select a collection location.');
        return;
      }
      if (!form.startDate) {
        setFormError('Select a start date.');
        return;
      }
      if (!form.timeOfDay) {
        setFormError('Select a time of day.');
        return;
      }

      const selectedLocation = activeHospitals.find((loc) => uid(loc) === form.collectionLocationId);
      const coords = selectedLocation?.location?.coordinates;
      const targetLocation = coords
        ? { latitude: coords[1], longitude: coords[0] }
        : undefined;

      const body = {
        name: form.name.trim(),
        createdBy: u.id,
        driverId: form.driverId || undefined,
        assignmentType: form.assignmentType,
        sampleType: form.sampleType || undefined,
        frequency: form.frequency,
        timeOfDay: form.timeOfDay,
        timezone: form.timezone,
        startDate: new Date(form.startDate).toISOString(),
        daysOfWeek: [],
        targetLocation,
      };

      await schedulesApi.create(body);
      setForm({
        name: '',
        driverId: '',
        assignmentType: 'SPECIFIC_LOCATION',
        sampleType: '',
        frequency: 'DAILY',
        timeOfDay: '',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        startDate: '',
        collectionLocationId: '',
      });
      q.load();
      toast('Recurring schedule created successfully.');
    } catch (x) {
      const msg = fail(x);
      setFormError(msg);
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page title="Recurring schedules" u={u}>
      <SectionCard title="Schedules">
        <Notice error={error || q.error} />
        {q.loading ? (
          <div className="loading-overlay">
            <div className="spinner" />
            <p className="loading-text">Loading schedules…</p>
          </div>
        ) : q.data.length ? (
          <div className="list">
            {q.data.map((s) => (
              <div className="driver-list-item" key={uid(s)}>
                <div className="list-main">
                  <b>{s.name}</b>
                  <small>{s.frequency} · {s.status} · next {new Date(s.nextOccurrenceAt).toLocaleString()}</small>
                </div>
                <div className="list-actions">
                  <Button variant="secondary" size="sm" loading={actionLoading[uid(s)]} onClick={async () => { setActionLoading((prev) => ({ ...prev, [uid(s)]: true })); try { await schedulesApi.generate(uid(s)); q.load(); toast('Schedule generated.'); } catch (e) { setError(fail(e)); } finally { setActionLoading((prev) => ({ ...prev, [uid(s)]: false })); } }}>
                    Generate
                  </Button>
                  {s.status === 'ACTIVE' && (
                    <Button variant="danger" size="sm" loading={actionLoading[uid(s)]} onClick={async () => { setActionLoading((prev) => ({ ...prev, [uid(s)]: true })); try { await schedulesApi.end(uid(s), { actorId: u.id }); q.load(); toast('Schedule ended.'); } catch (e) { setError(fail(e)); } finally { setActionLoading((prev) => ({ ...prev, [uid(s)]: false })); } }}>
                      End
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <div className="empty-state-icon">📅</div>
            <p className="empty-state-title">No schedules found</p>
            <p className="empty-state-description">Create a recurring schedule to automate assignments.</p>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Create recurring schedule">
        <Notice error={formError} />
        {formError && (
          <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span>⚠</span>
            <span>{formError}</span>
          </div>
        )}
        <form className="form-grid" onSubmit={submit}>
          <FormField label="Name">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning collection route" />
          </FormField>

          <FormField label="Driver">
            <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
              <option value="">Optional</option>
              {drivers.map((x) => (
                <option key={x.id} value={x.id}>{x.name}</option>
              ))}
            </select>
          </FormField>

          <FormField label="Frequency">
            <select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>
              <option>DAILY</option>
              <option>WEEKLY</option>
              <option>MONTHLY</option>
            </select>
          </FormField>

          <FormField label="Time of day">
            <input type="time" value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })} />
          </FormField>

          <FormField label="Start date">
            <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} min={todayIso} />
          </FormField>

          <FormField label="Collection location">
            <select
              value={form.collectionLocationId}
              onChange={(e) => setForm({ ...form, collectionLocationId: e.target.value })}
            >
              <option value="">Select a collection location</option>
              {activeHospitals.map((x) => (
                <option key={uid(x)} value={uid(x)}>
                  {x.name}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Sample type">
            <input value={form.sampleType} onChange={(e) => setForm({ ...form, sampleType: e.target.value })} placeholder="Optional" />
          </FormField>

          <div className="form-actions">
            <Button variant="primary" type="submit" loading={submitting}>
              {submitting ? 'Creating...' : 'Create schedule'}
            </Button>
          </div>
        </form>
      </SectionCard>
    </Page>
  );
}
