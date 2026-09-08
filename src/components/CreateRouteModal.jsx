/**
 * CreateRouteModal
 *
 * Modal for creating a new route (and optionally pre-adding destinations).
 * Uses the shared AdminModal shell for consistent chrome.
 *
 * Props:
 *   onClose     {fn}       – close the modal
 *   onCreated   {fn}       – called with the created route after success
 *   locations   {array}    – active collection locations for destination picker
 *   createdBy   {string}   – user id of the creator
 */
import { useState } from 'react';
import AdminModal from './AdminModal';
import { Button, FormField } from './ui';
import { routesApi } from '../api/fieldflow';
import { fail, uid } from '../pages/utils';

export default function CreateRouteModal({ onClose, onCreated, locations = [], createdBy }) {
  const [name, setName] = useState('');
  const [destinations, setDestinations] = useState([]);
  const [destForm, setDestForm] = useState({ name: '', collectionLocationId: '', sampleType: '' });
  const [destError, setDestError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const addDestination = (e) => {
    e.preventDefault();
    if (!destForm.name.trim()) {
      setDestError('Destination name is required.');
      return;
    }
    setDestinations((prev) => [...prev, { ...destForm, tempId: Date.now() }]);
    setDestForm({ name: '', collectionLocationId: '', sampleType: '' });
    setDestError('');
  };

  const removeDestination = (tempId) => {
    setDestinations((prev) => prev.filter((d) => d.tempId !== tempId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const errors = {};
    if (!name.trim()) errors.name = 'Route name is required.';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError('Please fix the highlighted fields.');
      return;
    }

    if (submitting) return;
    setSubmitting(true);

    try {
      setStep('Creating route…');
      const created = await routesApi.create({ name: name.trim(), createdBy });
      const routeId = created?.route?.id || created?.id;
      if (!routeId) throw new Error('Route creation did not return an id.');

      if (destinations.length > 0) {
        setStep(`Adding ${destinations.length} destination${destinations.length > 1 ? 's' : ''}…`);
        await Promise.all(
          destinations.map((d, idx) =>
            routesApi.addStop(routeId, {
              name: d.name.trim(),
              collectionLocationId: d.collectionLocationId || undefined,
              sequence: idx + 1,
              sampleType: d.sampleType || undefined,
            })
          )
        );
      }

      onCreated?.();
      onClose();
    } catch (x) {
      setError(fail(x));
    } finally {
      setSubmitting(false);
      setStep('');
    }
  };

  return (
    <AdminModal title="Create route" onClose={onClose} error={error} labelId="create-route-title">
      <form className="modal-form-grid" onSubmit={handleSubmit}>
        {/* Route name */}
        <div className="modal-full-row">
          <FormField label="Route name" error={fieldErrors.name}>
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setFieldErrors((f) => ({ ...f, name: '' })); }}
              placeholder="e.g. Morning hospital run"
              autoFocus
            />
          </FormField>
        </div>

        {/* Destinations section */}
        <div className="modal-full-row">
          <div className="modal-subsection-header">
            <span className="modal-subsection-title">Destinations</span>
            <span className="modal-subsection-count">
              {destinations.length} added
            </span>
          </div>

          {destinations.length > 0 && (
            <div className="modal-dest-list">
              {destinations.map((d, idx) => (
                <div className="modal-dest-item" key={d.tempId}>
                  <div className="modal-dest-info">
                    <b>{idx + 1}. {d.name}</b>
                    <small>
                      {d.collectionLocationId
                        ? (locations.find((h) => uid(h) === d.collectionLocationId)?.name || 'Selected location')
                        : 'No location linked'}
                      {d.sampleType ? ` · ${d.sampleType}` : ''}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="modal-dest-remove"
                    onClick={() => removeDestination(d.tempId)}
                    aria-label={`Remove destination ${d.name}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add destination sub-form */}
          <div className="modal-subform">
            <FormField label="Destination name" error={destError}>
              <input
                value={destForm.name}
                onChange={(e) => { setDestForm({ ...destForm, name: e.target.value }); setDestError(''); }}
                placeholder="e.g. Main hospital entrance"
              />
            </FormField>
            <FormField label="Collection location">
              <select
                value={destForm.collectionLocationId}
                onChange={(e) => setDestForm({ ...destForm, collectionLocationId: e.target.value })}
              >
                <option value="">Optional</option>
                {locations.map((x) => (
                  <option key={uid(x)} value={uid(x)}>{x.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Sample type">
              <input
                value={destForm.sampleType}
                onChange={(e) => setDestForm({ ...destForm, sampleType: e.target.value })}
                placeholder="Optional"
              />
            </FormField>
            <div>
              <Button variant="secondary" type="button" size="sm" onClick={addDestination}>
                {destinations.length > 0 ? 'Add another destination' : 'Add destination'}
              </Button>
            </div>
          </div>
        </div>

        {/* Progress indicator */}
        {step && (
          <div className="modal-full-row modal-progress">
            <span>⏳</span>
            <span>{step}</span>
          </div>
        )}

        {/* Footer */}
        <div className="modal-footer modal-full-row">
          <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            {submitting ? (step || 'Creating…') : 'Create route'}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
