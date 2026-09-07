import { useEffect, useMemo, useState } from 'react';
import { assignmentsApi, collectionLocationsApi, routesApi } from '../api/fieldflow';
import { getUsers } from '../api/users';
import { useLoad, Page, Notice, uid, fail, uname, when, present } from './utils';
import { Button, SectionCard, FormField } from '../components/ui';
import { StatusBadge } from '../components/ui/Badge';
import { useToast } from '../components/Toast';

export default function Assignments({ u }) {
  const toast = useToast();
  const q = useLoad(() => assignmentsApi.list());
  // Drivers list is loaded lazily here. The previous dev-user selector used
  // to ship this list with every page render; with real auth we ask the
  // backend directly. Admins/operators can list drivers; drivers cannot
  // (the backend enforces the role check).
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    if (u.role === 'DRIVER') return undefined;
    let live = true;
    (async () => {
      try {
        const list = await getUsers({ role: 'DRIVER' });
        if (live) setDrivers((list || []).map((user, index) => present(user, index)).filter(Boolean));
      } catch (e) {
        // Silently ignore — driver list is optional for the create UI; the
        // page remains usable without it.
      }
    })();
    return () => { live = false; };
  }, [u.role]);
  const r = useLoad(() => routesApi.list({ status: 'ACTIVE' }));
  const cl = useLoad(() => collectionLocationsApi.list({ active: true }));
  const [type, setType] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [showTimeSelector, setShowTimeSelector] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formError, setFormError] = useState('');
  const [assignmentPage, setAssignmentPage] = useState(1);
  const PAGE_SIZE = 12;
  const [fieldErrors, setFieldErrors] = useState({});
  const [form, setForm] = useState({
    title: '',
    driverId: '',
    routeId: '',
    collectionLocationId: '',
  });

  if (u.role === 'DRIVER') return <Page title="Assignments" u={u}></Page>;

  // `drivers` is already filtered server-side via `getUsers({ role: 'DRIVER' })`.
  const activeHospitals = cl.data || [];
  const term = search.trim().toLowerCase();
  const sortedAssignments = useMemo(() => {
    return [...(q.data || [])].sort((left, right) => {
      const leftDate = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightDate = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
      if (leftDate !== rightDate) return rightDate - leftDate;
      const leftScheduled = left?.scheduledStartAt ? new Date(left.scheduledStartAt).getTime() : 0;
      const rightScheduled = right?.scheduledStartAt ? new Date(right.scheduledStartAt).getTime() : 0;
      return rightScheduled - leftScheduled;
    });
  }, [q.data]);

  const filtered = useMemo(() => {
    const data = sortedAssignments;
    if (!term && !statusFilter) return data;
    return data.filter((a) => {
      const matchesStatus = !statusFilter || a.status === statusFilter;
      const matchesSearch = !term || [
        a.title,
        a.description,
        a.assignmentType,
        a.address,
        typeof a.driverId === 'object' ? (a.driverId?.displayName || `${a.driverId?.firstName || ''} ${a.driverId?.lastName || ''}`.trim()) : a.driverId,
      ].some((value) => String(value || '').toLowerCase().includes(term));
      return matchesStatus && matchesSearch;
    });
  }, [sortedAssignments, statusFilter, term]);

  const today = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new Date().toISOString().slice(0, 10);
  }, []);

  const getDefaultTimeValue = () => {
    const now = new Date();
    const rounded = new Date(Math.ceil(now.getTime() / (15 * 60 * 1000)) * (15 * 60 * 1000));
    return `${String(rounded.getHours()).padStart(2, '0')}:${String(rounded.getMinutes()).padStart(2, '0')}`;
  };

  const timeValueDisplay = (value) => {
    if (!value || !/^\d{2}:\d{2}$/.test(value)) return '09:30 AM';
    const [hourValue, minuteValue] = value.split(':').map(Number);
    const period = hourValue >= 12 ? 'PM' : 'AM';
    const hour12 = hourValue % 12 === 0 ? 12 : hourValue % 12;
    return `${String(hour12)}:${String(minuteValue).padStart(2, '0')} ${period}`;
  };

  useEffect(() => {
    if (!showCreateModal) return;
    if (!scheduledTime) setScheduledTime(getDefaultTimeValue());
  }, [showCreateModal, scheduledTime]);

  useEffect(() => {
    setAssignmentPage(1);
  }, [search, statusFilter]);

  const assignmentPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageAssignments = filtered.slice((assignmentPage - 1) * PAGE_SIZE, assignmentPage * PAGE_SIZE);

  const requiresCollectionLocation = type === 'SPECIFIC_LOCATION';

  const updateTimeFromParts = (nextHour, nextMinute, nextPeriod) => {
    let hour24 = Number(nextHour);
    if (nextPeriod === 'AM' && hour24 === 12) hour24 = 0;
    if (nextPeriod === 'PM' && hour24 !== 12) hour24 += 12;
    const padded = `${String(hour24).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
    setScheduledTime(padded);
  };

  const timePickerTime = (() => {
    if (!scheduledTime || !/^\d{2}:\d{2}$/.test(scheduledTime)) {
      return { hour: '9', minute: '30', period: 'AM' };
    }
    const [hourValue, minuteValue] = scheduledTime.split(':').map(Number);
    const period = hourValue >= 12 ? 'PM' : 'AM';
    const hour12 = hourValue % 12 === 0 ? 12 : hourValue % 12;
    return { hour: String(hour12), minute: String(minuteValue).padStart(2, '0'), period };
  })();

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError('');
    setFieldErrors({});
    try {
      const errors = {};
      if (!form.title.trim()) errors.title = 'Purpose is required.';
      if (!type) errors.type = 'Assignment type is required.';
      if (requiresCollectionLocation && !form.collectionLocationId) {
        errors.collectionLocationId = 'Select a collection location.';
      }
      if (!form.driverId) errors.driverId = 'Driver is required.';
      if (!scheduledDate) errors.scheduledDate = 'Scheduled date is required.';
      if (scheduledDate < today) errors.scheduledDate = 'Scheduled date cannot be in the past.';
      if (!scheduledTime) errors.scheduledTime = 'Scheduled time is required.';
      if (!requiresCollectionLocation && !form.routeId) errors.routeId = 'Select a route.';

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        throw Error('Please fix the highlighted fields.');
      }

      const scheduledStartAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
      const body = {
        assignmentType: type,
        createdBy: u.id,
        driverId: form.driverId,
        title: form.title,
        scheduledStartAt,
        ...(requiresCollectionLocation ? { collectionLocationId: form.collectionLocationId } : { routeId: form.routeId }),
      };

      await assignmentsApi.create(body);
      setMessage('Assignment created successfully.');
      toast('Assignment created successfully.');
      setShowCreateModal(false);
      setForm({ title: '', driverId: '', routeId: '', collectionLocationId: '' });
      setType('');
      setScheduledDate('');
      setScheduledTime('');
      setFieldErrors({});
      q.load();
    } catch (x) {
      const msg = fail(x);
      setFormError(msg);
      q.setError('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page title="Assignments" u={u}>
      <SectionCard title="Operational assignments">
        <Notice error={q.error} message={message} />
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginBottom: 'var(--space-4)', alignItems: 'flex-end' }}>
          <div style={{ flex: '0 1 260px', minWidth: 180, maxWidth: 300 }}>
            <FormField label="Search">
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assignments..." />
            </FormField>
          </div>
          <div style={{ flex: '0 0 auto' }}>
            <FormField label="Status">
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="ASSIGNED">Assigned</option>
                <option value="DECLINED">Declined</option>
                <option value="IN_PROGRESS">In Progress</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </FormField>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            Create Assignment
          </Button>
          {(search || statusFilter) && (
            <Button variant="secondary" size="sm" onClick={() => { setSearch(''); setStatusFilter(''); }}>
              Clear filters
            </Button>
          )}
        </div>
        {!q.loading && (
          <p style={{ margin: '0 0 var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
            {filtered.length} assignment{filtered.length === 1 ? '' : 's'} found
          </p>
        )}
        {q.loading ? (
          <div className="loading-overlay">
            <div className="spinner" />
            <p className="loading-text">Loading assignments…</p>
          </div>
        ) : filtered.length ? (
          <>
            <div className="list">
              {pageAssignments.map((a) => (
                <div className="sample-list-item" key={uid(a)}>
                  <div className="list-main">
                    <b>{a.title}</b>
                    <small>
                      {a.assignmentType} · {a.driverId ? uname(a.driverId) : 'Unassigned'} · {when(a.scheduledStartAt)}
                    </small>
                  </div>
                  <div className="list-actions">
                    <StatusBadge status={a.status} />
                    {a.status === 'DECLINED' && a.declineReason && (
                      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.declineReason}>
                        Reason: {a.declineReason}
                      </span>
                    )}
                    {a.status !== 'DECLINED' && a.status !== 'COMPLETED' && a.status !== 'CANCELLED' && (
                      <Button
                        variant="danger"
                        size="sm"
                        loading={submitting}
                        onClick={async () => {
                          try {
                            await assignmentsApi.cancel(uid(a));
                            q.load();
                            toast('Assignment cancelled successfully.');
                          } catch (e) {
                            q.setError(fail(e));
                          }
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {assignmentPages > 1 && (
              <div className="assignment-pagination" aria-label="Assignment pagination">
                <button type="button" className="pagination-button" onClick={() => setAssignmentPage((page) => Math.max(1, page - 1))} disabled={assignmentPage === 1} aria-label="Previous page">
                  &lt;
                </button>
                <span>{assignmentPage} of {assignmentPages}</span>
                <button type="button" className="pagination-button" onClick={() => setAssignmentPage((page) => Math.min(assignmentPages, page + 1))} disabled={assignmentPage === assignmentPages} aria-label="Next page">
                  &gt;
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <div className="empty-state-icon">📋</div>
            <p className="empty-state-title">No assignments found</p>
            <p className="empty-state-description">Try changing your search or filter.</p>
          </div>
        )}
      </SectionCard>
      {showCreateModal && (
        <div className="modal-overlay" onClick={(event) => {
          if (event.target === event.currentTarget) setShowCreateModal(false);
        }}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="create-assignment-title">
            <div className="modal-header">
              <h2 id="create-assignment-title">Create assignment</h2>
              <button type="button" className="modal-close" aria-label="Close create assignment modal" onClick={() => setShowCreateModal(false)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <form className="form-grid compact-assignment-form" onSubmit={submit}>
                {formError && (
                  <div className="auth-form-error" style={{ gridColumn: '1 / -1' }} role="alert">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <span>{formError}</span>
                  </div>
                )}

                <div style={{ gridColumn: '1 / -1' }}>
                  <FormField label="Purpose" error={fieldErrors.title}>
                    <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Daily hospital collection" />
                  </FormField>
                </div>

                <div>
                  <FormField label="Assignment type" error={fieldErrors.type}>
                    <select value={type} onChange={(e) => {
                      const nextType = e.target.value;
                      setType(nextType);
                      setForm((current) => ({ ...current, routeId: '', collectionLocationId: '' }));
                    }}>
                      <option value="">Select type</option>
                      <option value="SPECIFIC_LOCATION">Specific location</option>
                      <option value="LANDMARK_ROUTE">Landmark route</option>
                    </select>
                  </FormField>
                </div>

                {requiresCollectionLocation && (
                  <div>
                    <FormField label="Collection location" error={fieldErrors.collectionLocationId}>
                      <select
                        value={form.collectionLocationId}
                        onChange={(e) => setForm({ ...form, collectionLocationId: e.target.value })}
                      >
                        <option value="">Select hospital / location</option>
                        {activeHospitals.map((x) => (
                          <option key={uid(x)} value={uid(x)}>
                            {x.name}
                          </option>
                        ))}
                      </select>
                    </FormField>
                  </div>
                )}

                <div>
                  <FormField label="Driver" error={fieldErrors.driverId}>
                    <select value={form.driverId} onChange={(e) => setForm({ ...form, driverId: e.target.value })}>
                      <option value="">Select driver</option>
                      {drivers.map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.name}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </div>

                <div>
                  <FormField label="Assignment date" error={fieldErrors.scheduledDate}>
                    <input type="date" required value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} min={today} />
                  </FormField>
                </div>

                <div className="time-selector-wrap">
                  <FormField label="Assignment time" error={fieldErrors.scheduledTime}>
                    <button
                      type="button"
                      className="time-selector-button"
                      onClick={() => setShowTimeSelector((value) => !value)}
                      aria-label="Open assignment time selector"
                    >
                      {timeValueDisplay(scheduledTime)}
                    </button>
                    {showTimeSelector && (
                      <div className="time-selector-popover" role="dialog" aria-label="Assignment time selector">
                        <div className="time-selector-column">
                          <label>Hour</label>
                          <select value={timePickerTime.hour} onChange={(e) => {
                            const nextHour = e.target.value;
                            updateTimeFromParts(nextHour, timePickerTime.minute, timePickerTime.period);
                          }}>
                            {Array.from({ length: 12 }, (_, index) => (
                              <option key={index + 1} value={String(index + 1)}>{String(index + 1).padStart(2, '0')}</option>
                            ))}
                          </select>
                        </div>
                        <div className="time-selector-column">
                          <label>Minute</label>
                          <select value={timePickerTime.minute} onChange={(e) => {
                            const nextMinute = e.target.value;
                            updateTimeFromParts(timePickerTime.hour, nextMinute, timePickerTime.period);
                          }}>
                            {Array.from({ length: 60 }, (_, index) => (
                              <option key={index} value={String(index).padStart(2, '0')}>{String(index).padStart(2, '0')}</option>
                            ))}
                          </select>
                        </div>
                        <div className="time-selector-column">
                          <label>AM/PM</label>
                          <select value={timePickerTime.period} onChange={(e) => {
                            const nextPeriod = e.target.value;
                            updateTimeFromParts(timePickerTime.hour, timePickerTime.minute, nextPeriod);
                          }}>
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </FormField>
                </div>

                {!requiresCollectionLocation && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    {r.loading ? (
                      <div className="loading-overlay compact-loading-inline">
                        <div className="spinner" />
                        <p className="loading-text">Loading routes…</p>
                      </div>
                    ) : (
                      <FormField label="Route" error={fieldErrors.routeId}>
                        <select value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })}>
                          <option value="">Select route</option>
                          {r.data.map((x) => (
                            <option key={uid(x)} value={uid(x)}>
                              {x.name}
                            </option>
                          ))}
                        </select>
                      </FormField>
                    )}
                  </div>
                )}

                <div className="modal-footer" style={{ gridColumn: '1 / -1' }}>
                  <Button variant="secondary" type="button" onClick={() => setShowCreateModal(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" type="submit" loading={submitting}>
                    {submitting ? 'Creating...' : 'Create assignment'}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </Page>
  );
}
