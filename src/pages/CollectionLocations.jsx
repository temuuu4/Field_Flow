import { useState } from 'react';
import { collectionLocationsApi } from '../api/fieldflow';
import { useLoad, Page, Notice, uid, fail } from './utils';
import { Button, SectionCard, FormField, StatusBadge } from '../components/ui';
import { useToast } from '../components/Toast';

export default function CollectionLocations({ u }) {
  const toast = useToast();
  const q = useLoad(() => collectionLocationsApi.list());
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'HOSPITAL', latitude: '', longitude: '', address: '', description: '' });

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!form.name || form.latitude === '' || form.longitude === '') throw Error('Name and coordinates are required.');
      await collectionLocationsApi.create({
        name: form.name,
        type: form.type,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        address: form.address || undefined,
        description: form.description || undefined,
      });
      setMessage('Collection location added.');
      toast('Collection location added.');
      setForm({ name: '', type: 'HOSPITAL', latitude: '', longitude: '', address: '', description: '' });
      q.load();
    } catch (x) {
      q.setError(fail(x));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page title="Collection locations" u={u}>
      <SectionCard title="Predefined collection locations">
        <Notice error={q.error} message={message} />
        {q.loading ? (
          <div className="loading-overlay">
            <div className="spinner" />
            <p className="loading-text">Loading…</p>
          </div>
        ) : q.data.length ? (
          <div className="list">
            {q.data.map((x) => (
              <div className="driver-list-item" key={uid(x)}>
                <div className="list-main">
                  <b>{x.name}</b>
                  <small>{x.type} · {x.location?.coordinates ? `${x.location.coordinates[1]}, ${x.location.coordinates[0]}` : ''}</small>
                </div>
                <StatusBadge status={x.status || 'ACTIVE'} />
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <div className="empty-state-icon">📍</div>
            <p className="empty-state-title">No collection locations yet</p>
            <p className="empty-state-description">Add hospitals, labs, or clinics to use in assignments.</p>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Add collection location">
        <form className="form-grid" onSubmit={submit}>
          <FormField label="Name">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </FormField>
          <FormField label="Type">
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option>HOSPITAL</option>
              <option>LAB</option>
              <option>CLINIC</option>
              <option>OTHER</option>
            </select>
          </FormField>
          <FormField label="Latitude">
            <input type="number" step="any" required value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
          </FormField>
          <FormField label="Longitude">
            <input type="number" step="any" required value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
          </FormField>
          <FormField label="Address">
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </FormField>
          <FormField label="Description">
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </FormField>
          <div className="form-actions">
            <Button variant="primary" type="submit" loading={submitting}>
              {submitting ? 'Adding...' : 'Add location'}
            </Button>
          </div>
        </form>
      </SectionCard>
    </Page>
  );
}
