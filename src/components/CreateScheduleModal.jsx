/**
 * CreateScheduleModal
 *
 * Modal for creating a recurring schedule.
 * Uses the shared AdminModal shell for consistent chrome.
 *
 * Props:
 *   onClose     {fn}       – close the modal
 *   onCreated   {fn}       – called after successful creation
 *   locations   {array}    – active collection locations
 *   routes      {array}    – active routes (for LANDMARK_ROUTE type)
 *   drivers     {array}    – available drivers
 *   createdBy   {string}   – user id of the creator
 */
import { useState } from 'react';
import AdminModal from './AdminModal';
import { Button, FormField } from './ui';
import { schedulesApi } from '../api/fieldflow';
import { fail, uid } from '../pages/utils';

const todayIso = new Date().toISOString().slice(0, 10);
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const blank = {
  name: '',
  driverId: '',
  assignmentType: 'SPECIFIC_LOCATION',
  frequency: 'DAILY',
  timeOfDay: '',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  startDate: '',
  collectionLocationId: '',
  sampleType: '',
  routeId: '',
  daysOfWeek: [],
  dayOfMonth: '',
};

export default function CreateScheduleModal({ onClose, onCreated, locations = [], routes = [], drivers = [], createdBy }) {
  const [form, setForm] = useState(blank);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const isSpecificLocation = form.assignmentType === 'SPECIFIC_LOCATION';

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const toggleDay = (day) => {
    const days = form.daysOfWeek.includes(day)
      ? form.daysOfWeek.filter((d) => d !== day)
      : [...form.daysOfWeek, day].sort((a, b) => a - b);
    set('daysOfWeek', days);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    // Client-side validation
    const errors = {};
    if (!form.name.trim()) errors.name = 'Name is required.';
    if (!form.startDate) errors.startDate = 'Start date is required.';
    if (!form.timeOfDay) errors.timeOfDay = 'Time of day is required.';
    if (isSpecificLocation) {
      if (!form.collectionLocationId) errors.collectionLocationId = 'Select a collection location.';
      if (!form.sampleType.trim()) errors.sampleType = 'Sample type is required for specific-location schedules.';
    } else {
      if (!form.routeId) errors.routeId = 'Select a route.';
    }
    if (form.frequency === 'WEEKLY' && form.daysOfWeek.length === 0) {
      errors.daysOfWeek = 'Select at least one day for a weekly schedule.';
    }
    if (form.frequency === 'MONTHLY' && !form.dayOfMonth) {
      errors.dayOfMonth = 'Day of month is required for monthly schedules.';
    }

    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setError('Please fix the highlighted fields.');
      return;
    }

    setSubmitting(true);
    try {
      // Build the correct location payload for SPECIFIC_LOCATION
      let targetLocation;
      if (isSpecificLocation && form.collectionLocationId) {
        const selectedLocation = locations.find((loc) => uid(loc) === form.collectionLocationId);
        const coords = selectedLocation?.location?.coordinates;
        if (coords) {
          targetLocation = { latitude: coords[1], longitude: coords[0] };
        }
      }

      const body = {
        name: form.name.trim(),
        createdBy,
        driverId: form.driverId || undefined,
        assignmentType: form.assignmentType,
        frequency: form.frequency,
        timeOfDay: form.timeOfDay,
        timezone: form.timezone,
        startDate: new Date(form.startDate).toISOString(),
        daysOfWeek: form.frequency === 'WEEKLY' ? form.daysOfWeek : [],
        ...(form.frequency === 'MONTHLY' && { dayOfMonth: Number(form.dayOfMonth) }),
        ...(isSpecificLocation
          ? { targetLocation, sampleType: form.sampleType.trim() }
          : { routeId: form.routeId }),
      };

      await schedulesApi.create(body);
      onCreated?.();
      onClose();
    } catch (x) {
      setError(fail(x));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AdminModal title="Create recurring schedule" onClose={onClose} error={error} labelId="create-schedule-title">
      <form className="modal-form-grid" onSubmit={handleSubmit}>
        {/* Name */}
        <div className="modal-full-row">
          <FormField label="Schedule name" error={fieldErrors.name}>
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Morning hospital collection"
              autoFocus
            />
          </FormField>
        </div>

        {/* Assignment type + Driver */}
        <FormField label="Assignment type">
          <select
            value={form.assignmentType}
            onChange={(e) => {
              set('assignmentType', e.target.value);
              set('collectionLocationId', '');
              set('routeId', '');
              set('sampleType', '');
            }}
          >
            <option value="SPECIFIC_LOCATION">Specific location</option>
            <option value="LANDMARK_ROUTE">Landmark route</option>
          </select>
        </FormField>

        <FormField label="Driver (optional)">
          <select value={form.driverId} onChange={(e) => set('driverId', e.target.value)}>
            <option value="">Unassigned</option>
            {drivers.map((x) => (
              <option key={x.id} value={x.id}>{x.name}</option>
            ))}
          </select>
        </FormField>

        {/* Conditional: collection location (SPECIFIC_LOCATION) or route (LANDMARK_ROUTE) */}
        {isSpecificLocation ? (
          <>
            <FormField label="Collection location" error={fieldErrors.collectionLocationId}>
              <select
                value={form.collectionLocationId}
                onChange={(e) => set('collectionLocationId', e.target.value)}
              >
                <option value="">Select a location</option>
                {locations.map((x) => (
                  <option key={uid(x)} value={uid(x)}>{x.name}</option>
                ))}
              </select>
            </FormField>
            <FormField label="Sample type" error={fieldErrors.sampleType}>
              <input
                value={form.sampleType}
                onChange={(e) => set('sampleType', e.target.value)}
                placeholder="e.g. Blood, Urine"
              />
            </FormField>
          </>
        ) : (
          <FormField label="Route" error={fieldErrors.routeId}>
            <select value={form.routeId} onChange={(e) => set('routeId', e.target.value)}>
              <option value="">Select a route</option>
              {routes.map((x) => (
                <option key={uid(x)} value={uid(x)}>{x.name}</option>
              ))}
            </select>
          </FormField>
        )}

        {/* Frequency */}
        <FormField label="Frequency">
          <select value={form.frequency} onChange={(e) => {
            set('frequency', e.target.value);
            set('daysOfWeek', []);
            set('dayOfMonth', '');
          }}>
            <option value="DAILY">Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </FormField>

        {/* Time of day */}
        <FormField label="Time of day" error={fieldErrors.timeOfDay}>
          <input
            type="time"
            value={form.timeOfDay}
            onChange={(e) => set('timeOfDay', e.target.value)}
          />
        </FormField>

        {/* Start date */}
        <FormField label="Start date" error={fieldErrors.startDate}>
          <input
            type="date"
            value={form.startDate}
            onChange={(e) => set('startDate', e.target.value)}
            min={todayIso}
          />
        </FormField>

        {/* Weekly: day-of-week picker */}
        {form.frequency === 'WEEKLY' && (
          <div className="modal-full-row">
            <FormField label="Days of week" error={fieldErrors.daysOfWeek}>
              <div className="day-picker">
                {DAY_NAMES.map((name, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`day-btn${form.daysOfWeek.includes(idx) ? ' day-btn-active' : ''}`}
                    onClick={() => toggleDay(idx)}
                    aria-pressed={form.daysOfWeek.includes(idx)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </FormField>
          </div>
        )}

        {/* Monthly: day-of-month */}
        {form.frequency === 'MONTHLY' && (
          <FormField label="Day of month (1–31)" error={fieldErrors.dayOfMonth}>
            <input
              type="number"
              min="1"
              max="31"
              value={form.dayOfMonth}
              onChange={(e) => set('dayOfMonth', e.target.value)}
              placeholder="e.g. 15"
            />
          </FormField>
        )}

        {/* Footer */}
        <div className="modal-footer modal-full-row">
          <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={submitting}>
            {submitting ? 'Creating…' : 'Create schedule'}
          </Button>
        </div>
      </form>
    </AdminModal>
  );
}
