import { useState, useRef, useEffect } from 'react';
import { routesApi, collectionLocationsApi } from '../api/fieldflow';
import { useLoad, Page, Notice, uid, fail } from './utils';
import { Button, SectionCard, FormField } from '../components/ui';
import { RouteEdit } from '../components/EditControls';
import CreateRouteModal from '../components/CreateRouteModal';
import { useToast } from '../components/Toast';

export default function RoutesPage({ u }) {
  const toast = useToast();
  const q = useLoad(() => routesApi.list());
  const cl = useLoad(() => collectionLocationsApi.list({ active: true }));
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [stopSubmitting, setStopSubmitting] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragNode = useRef(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const [createName, setCreateName] = useState('');
  const [createRouteError, setCreateRouteError] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createStep, setCreateStep] = useState('');
  const [pendingDestinations, setPendingDestinations] = useState([]);
  const [destinationForm, setDestinationForm] = useState({ name: '', collectionLocationId: '', sampleType: '' });
  const createFormRef = useRef(null);
  const destinationFormRef = useRef(null);

  const [editingStopId, setEditingStopId] = useState(null);
  const [editingForm, setEditingForm] = useState(null);
  const [editingError, setEditingError] = useState('');
  const [editingSubmitting, setEditingSubmitting] = useState(false);
  const editFormRef = useRef(null);

  useEffect(() => {
    if (selected && destinationFormRef.current) {
      destinationFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [selected]);

  useEffect(() => {
    if (editingStopId && editFormRef.current) {
      editFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [editingStopId]);

  const activeHospitals = cl.data || [];
  const open = async (r) => {
    try {
      setSelected(await routesApi.get(uid(r)));
      setEditingStopId(null);
      setEditingForm(null);
      setEditingError('');
    } catch (e) {
      setError(fail(e));
    }
  };

  const updateSelectedStops = (updater) => {
    setSelected((prev) => {
      if (!prev) return prev;
      const next = typeof updater === 'function' ? updater(prev.stops) : updater;
      return { ...prev, stops: next };
    });
  };

  const onDragStart = (index) => {
    setDragIndex(index);
    dragNode.current = null;
  };

  const onDragEnter = (e, index) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const onDragOver = (e) => {
    e.preventDefault();
    if (dragNode.current !== e.currentTarget) {
      dragNode.current = e.currentTarget;
    }
  };

  const onDrop = async (e) => {
    e.preventDefault();
    if (dragIndex === null || dragOverIndex === null || dragIndex === dragOverIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const routeId = uid(selected.route);
    const reordered = [...selected.stops];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dragOverIndex, 0, moved);
    updateSelectedStops(reordered);
    setDragIndex(null);
    setDragOverIndex(null);
    setReordering(true);
    try {
      await Promise.all(
        reordered.map((s, idx) =>
          routesApi.updateStop(routeId, uid(s), { sequence: idx + 1 }).catch((e) => {
            console.error('Failed to update destination order', e);
          })
        )
      );
      toast('Destination order updated successfully.');
    } catch (e) {
      setError(fail(e));
    } finally {
      setReordering(false);
    }
  };

  const onDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
    dragNode.current = null;
  };

  const startEditing = (stop) => {
    setEditingStopId(uid(stop));
    setEditingForm({
      name: stop.name,
      description: stop.description || '',
      sequence: stop.sequence,
      latitude: stop.location?.coordinates?.[1] ?? '',
      longitude: stop.location?.coordinates?.[0] ?? '',
      address: stop.address || '',
      sampleType: stop.sampleType || '',
      status: stop.status,
    });
    setEditingError('');
  };

  const cancelEditing = () => {
    setEditingStopId(null);
    setEditingForm(null);
    setEditingError('');
  };

  const saveEditing = async (e) => {
    e.preventDefault();
    if (!editingForm || !selected) return;
    setEditingSubmitting(true);
    setEditingError('');
    try {
      await routesApi.updateStop(uid(selected.route), editingStopId, {
        name: editingForm.name,
        collectionLocationId: editingForm.collectionLocationId || undefined,
        sequence: Number(editingForm.sequence),
        latitude: Number(editingForm.latitude),
        longitude: Number(editingForm.longitude),
        address: editingForm.address || undefined,
        sampleType: editingForm.sampleType || undefined,
        status: editingForm.status,
      });
      updateSelectedStops((stops) =>
        stops.map((s) => uid(s) === editingStopId ? { ...s, ...editingForm } : s)
      );
      cancelEditing();
      toast('Destination updated successfully.');
    } catch (x) {
      setEditingError(fail(x));
    } finally {
      setEditingSubmitting(false);
    }
  };

  const deleteDestination = async (stop) => {
    setDeleteSubmitting(true);
    try {
      await routesApi.removeStop(uid(selected.route), uid(stop));
      if (editingStopId === uid(stop)) cancelEditing();
      updateSelectedStops((stops) => stops.filter((item) => uid(item) !== uid(stop)));
      toast('Destination deleted successfully.');
    } catch (e) {
      setError(fail(e));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const addDestination = async (e) => {
    e.preventDefault();
    setStopSubmitting(true);
    try {
      const seq = (selected.stops || []).length + 1;
      const created = await routesApi.addStop(uid(selected.route), {
        name: destinationForm.name,
        collectionLocationId: destinationForm.collectionLocationId || undefined,
        sequence: seq,
        sampleType: destinationForm.sampleType || undefined,
      });
      setDestinationForm({ name: '', collectionLocationId: '', sampleType: '' });
      updateSelectedStops((stops) => [
        ...stops,
        created?.stop || {
          name: destinationForm.name,
          collectionLocationId: destinationForm.collectionLocationId,
          sequence: seq,
          sampleType: destinationForm.sampleType,
          location: { coordinates: [0, 0] },
          status: 'ACTIVE',
        },
      ]);
      toast('Destination added successfully.');
      setTimeout(() => {
        destinationFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    } catch (x) {
      setError(fail(x));
    } finally {
      setStopSubmitting(false);
    }
  };

  const handleRowClick = (stop, e) => {
    if (e.target.closest('.drag-handle')) return;
    if (e.target.closest('button')) return;
    startEditing(stop);
  };

  const addPendingDestination = (e) => {
    e.preventDefault();
    if (!destinationForm.name.trim()) {
      setCreateRouteError('Destination name is required.');
      return;
    }
    setPendingDestinations((prev) => [
      ...prev,
      { ...destinationForm, tempId: Date.now() },
    ]);
    setDestinationForm({ name: '', collectionLocationId: '', sampleType: '' });
    setCreateRouteError('');
  };

  const removePendingDestination = (tempId) => {
    setPendingDestinations((prev) => prev.filter((d) => d.tempId !== tempId));
  };

  const handleCreateRoute = async (e) => {
    e.preventDefault();
    setCreateRouteError('');
    if (!createName.trim()) {
      setCreateRouteError('Route name is required.');
      return;
    }
    if (createSubmitting) return;
    setCreateSubmitting(true);
    try {
      setCreateStep('Creating route...');
      const created = await routesApi.create({ name: createName.trim(), createdBy: u.id });
      const routeId = created?.route?.id || created?.id;
      if (!routeId) {
        throw new Error('Route creation did not return an id.');
      }

      if (pendingDestinations.length > 0) {
        setCreateStep(`Adding ${pendingDestinations.length} destination${pendingDestinations.length > 1 ? 's' : ''}...`);
        await Promise.all(
          pendingDestinations.map((d, idx) =>
            routesApi.addStop(routeId, {
              name: d.name.trim(),
              collectionLocationId: d.collectionLocationId || undefined,
              sequence: idx + 1,
              sampleType: d.sampleType || undefined,
            })
          )
        );
      }

      setCreateName('');
      setPendingDestinations([]);
      setDestinationForm({ name: '', collectionLocationId: '', sampleType: '' });
      await q.load();
      const fresh = await routesApi.get(routeId);
      setSelected(fresh);
      toast(`Route created successfully${pendingDestinations.length > 0 ? ` with ${pendingDestinations.length} destination${pendingDestinations.length > 1 ? 's' : ''}` : ''}.`);
      setTimeout(() => {
        createFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (x) {
      setCreateRouteError(fail(x));
    } finally {
      setCreateSubmitting(false);
      setCreateStep('');
    }
  };

  return (
    <Page title="Routes" u={u}>
      <SectionCard
        title="Reusable routes"
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            Create route
          </Button>
        }
      >
        <Notice error={error || q.error} />
        {q.loading ? (
          <div className="loading-overlay">
            <div className="spinner" />
            <p className="loading-text">Loading routes…</p>
          </div>
        ) : q.data.length ? (
          <div className="list">
            {q.data.map((x) => (
              <div className="driver-list-item" key={uid(x)}>
                <div className="list-main">
                  <b>{x.name}</b>
                  <small>
                    {x.status} · version {x.version}
                  </small>
                </div>
                <div className="list-actions">
                  <Button variant="secondary" size="sm" onClick={() => open(x)}>
                    Destinations
                  </Button>
                  <RouteEdit route={x} onSaved={() => q.load()} />
                  <Button
                    variant="danger"
                    size="sm"
                    loading={submitting}
                    onClick={async () => {
                      try {
                        await routesApi.archive(uid(x));
                        q.load();
                        toast('Route archived successfully.');
                      } catch (e) {
                        setError(fail(e));
                      }
                    }}
                  >
                    Archive
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <div className="empty-state-icon">🗺️</div>
            <p className="empty-state-title">No routes created yet</p>
            <p className="empty-state-description">Create a reusable route and add destinations to get started.</p>
          </div>
        )}
      </SectionCard>

      {selected && (
        <SectionCard title={`${selected.route.name} — Destinations`}>
          {selected.stops.length ? (
            <div className="list">
              {selected.stops.map((s, idx) => (
                <>
                  <div
                    key={uid(s)}
                    className={`driver-list-item ${editingStopId === uid(s) ? 'editing' : ''}`}
                    style={{
                      opacity: dragIndex === idx ? 0.4 : 1,
                      transform: dragOverIndex === idx && dragIndex !== idx ? 'translateY(2px)' : undefined,
                    }}
                    onClick={(e) => handleRowClick(s, e)}
                    onDragEnter={(e) => onDragEnter(e, idx)}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onDragEnd={onDragEnd}
                  >
                    <div className="list-main">
                      <span
                        draggable
                        onDragStart={() => onDragStart(idx)}
                        className="drag-handle"
                        title="Drag to reorder"
                      >
                        ⋮⋮
                      </span>
                      <div>
                        <b>
                          {idx + 1}. {s.name}
                          {editingStopId === uid(s) && (
                            <span className="badge badge-info" style={{ marginLeft: 'var(--space-2)' }}>Editing</span>
                          )}
                        </b>
                        <small>
                          {s.address || `${s.location?.coordinates?.[1] || ''}, ${s.location?.coordinates?.[0] || ''}`}
                        </small>
                      </div>
                    </div>
                    <div className="list-actions">
                      <Button variant="ghost" size="sm" onClick={() => startEditing(s)}>Edit</Button>
                      <Button
                        variant="danger"
                        size="sm"
                        loading={deleteSubmitting}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteDestination(s);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {editingStopId === uid(s) && editingForm && (
                    <div ref={editFormRef} className="edit-form-wrapper">
                      <form onSubmit={saveEditing} className="form-grid">
                        <FormField label="Destination name">
                          <input required value={editingForm.name} onChange={(e) => setEditingForm({ ...editingForm, name: e.target.value })} />
                        </FormField>
                        <FormField label="Collection location">
                          <select value={editingForm.collectionLocationId || ''} onChange={(e) => setEditingForm({ ...editingForm, collectionLocationId: e.target.value })}>
                            <option value="">Select hospital / location</option>
                            {activeHospitals.map((x) => (
                              <option key={uid(x)} value={uid(x)}>
                                {x.name}
                              </option>
                            ))}
                          </select>
                        </FormField>
                        <FormField label="Sample type">
                          <input value={editingForm.sampleType} onChange={(e) => setEditingForm({ ...editingForm, sampleType: e.target.value })} />
                        </FormField>
                        <FormField label="Order">
                          <input type="number" min="1" value={editingForm.sequence} onChange={(e) => setEditingForm({ ...editingForm, sequence: e.target.value })} />
                        </FormField>
                        <FormField label="Latitude">
                          <input type="number" step="any" value={editingForm.latitude} onChange={(e) => setEditingForm({ ...editingForm, latitude: e.target.value })} />
                        </FormField>
                        <FormField label="Longitude">
                          <input type="number" step="any" value={editingForm.longitude} onChange={(e) => setEditingForm({ ...editingForm, longitude: e.target.value })} />
                        </FormField>
                        <FormField label="Address">
                          <input value={editingForm.address} onChange={(e) => setEditingForm({ ...editingForm, address: e.target.value })} />
                        </FormField>
                        <FormField label="Status">
                          <select value={editingForm.status} onChange={(e) => setEditingForm({ ...editingForm, status: e.target.value })}>
                            <option>ACTIVE</option>
                            <option>INACTIVE</option>
                          </select>
                        </FormField>
                        {editingError && <div style={{ gridColumn: '1 / -1' }} className="form-error">{editingError}</div>}
                        <div className="form-actions">
                          <Button variant="secondary" type="button" onClick={cancelEditing}>Cancel</Button>
                          <Button variant="primary" type="submit" loading={editingSubmitting}>Save destination</Button>
                        </div>
                      </form>
                    </div>
                  )}
                </>
              ))}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
              <div className="empty-state-icon">📍</div>
              <p className="empty-state-title">No destinations yet</p>
              <p className="empty-state-description">Add destinations to build this route.</p>
            </div>
          )}
          <form
            ref={destinationFormRef}
            className="form-grid"
            onSubmit={addDestination}
          >
            <FormField label="Destination name">
              <input required value={destinationForm.name} onChange={(e) => setDestinationForm({ ...destinationForm, name: e.target.value })} placeholder="e.g. Main hospital entrance" />
            </FormField>
            <FormField label="Collection location">
              <select
                value={destinationForm.collectionLocationId}
                onChange={(e) => setDestinationForm({ ...destinationForm, collectionLocationId: e.target.value })}
              >
                <option value="">Select hospital / location</option>
                {activeHospitals.map((x) => (
                  <option key={uid(x)} value={uid(x)}>
                    {x.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Sample type">
              <input
                value={destinationForm.sampleType}
                onChange={(e) => setDestinationForm({ ...destinationForm, sampleType: e.target.value })}
              />
            </FormField>
            <div className="form-actions">
              <Button variant="primary" type="submit" loading={stopSubmitting || reordering}>
                {stopSubmitting ? 'Adding...' : 'Add destination'}
              </Button>
            </div>
          </form>
          {reordering && (
            <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
              Updating destination order...
            </p>
          )}
        </SectionCard>
      )}

      <SectionCard title="Create route" ref={createFormRef}>
        <Notice error={createRouteError} />
        {createStep && (
          <div style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--info-light)', border: '1px solid var(--info)', borderRadius: 'var(--radius-md)', color: 'var(--info)', fontSize: 'var(--text-sm)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span>⏳</span>
            <span>{createStep}</span>
          </div>
        )}
        <form className="form-grid" onSubmit={handleCreateRoute}>
          <FormField label="Route name">
            <input value={createName} onChange={(e) => { setCreateName(e.target.value); setCreateRouteError(''); }} placeholder="Enter route name" />
          </FormField>

          <div style={{ gridColumn: '1 / -1' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-3)' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-md)', fontWeight: 600 }}>Destinations</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--muted)' }}>
                {pendingDestinations.length} added
              </span>
            </div>
            {pendingDestinations.length > 0 && (
              <div className="list" style={{ marginBottom: 'var(--space-4)' }}>
                {pendingDestinations.map((d, idx) => (
                  <div className="list-item" key={d.tempId}>
                    <div className="list-item-content">
                      <b>{idx + 1}. {d.name}</b>
                      <small>
                        {d.collectionLocationId ? activeHospitals.find((h) => uid(h) === d.collectionLocationId)?.name || 'Selected location' : 'No location selected'}
                        {d.sampleType ? ` · ${d.sampleType}` : ''}
                      </small>
                    </div>
                    <div className="list-item-actions">
                      <Button variant="ghost" size="sm" onClick={() => removePendingDestination(d.tempId)}>Remove</Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <form className="form-grid" onSubmit={addPendingDestination}>
              <FormField label="Destination name">
                <input value={destinationForm.name} onChange={(e) => setDestinationForm({ ...destinationForm, name: e.target.value })} placeholder="e.g. Main hospital entrance" />
              </FormField>
              <FormField label="Collection location">
                <select
                  value={destinationForm.collectionLocationId}
                  onChange={(e) => setDestinationForm({ ...destinationForm, collectionLocationId: e.target.value })}
                >
                  <option value="">Optional</option>
                  {activeHospitals.map((x) => (
                    <option key={uid(x)} value={uid(x)}>
                      {x.name}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField label="Sample type">
                <input value={destinationForm.sampleType} onChange={(e) => setDestinationForm({ ...destinationForm, sampleType: e.target.value })} placeholder="Optional" />
              </FormField>
              <div className="form-actions">
                <Button variant="secondary" type="submit" disabled={createSubmitting}>
                  {pendingDestinations.length > 0 ? 'Add another destination' : 'Add destination'}
                </Button>
              </div>
            </form>
          </div>

          <div className="form-actions">
            <Button variant="primary" type="submit" loading={createSubmitting}>
              {createSubmitting ? (createStep || 'Creating...') : 'Create route'}
            </Button>
          </div>
        </form>
      </SectionCard>

      {showCreateModal && (
        <CreateRouteModal
          onClose={() => setShowCreateModal(false)}
          onCreated={async () => {
            await q.load();
            toast('Route created successfully.');
          }}
          locations={cl.data || []}
          createdBy={u.id}
        />
      )}
    </Page>
  );
}
