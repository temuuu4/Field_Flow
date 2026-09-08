import { useEffect, useState } from 'react';
import { schedulesApi, collectionLocationsApi, routesApi } from '../api/fieldflow';
import { getUsers } from '../api/users';
import { useLoad, Page, Notice, uid, fail, present } from './utils';
import { Button, SectionCard } from '../components/ui';
import CreateScheduleModal from '../components/CreateScheduleModal';
import { useToast } from '../components/Toast';

export default function Schedules({ u }) {
  const toast = useToast();
  const q = useLoad(() => schedulesApi.list());
  const cl = useLoad(() => collectionLocationsApi.list({ active: true }));
  const r = useLoad(() => routesApi.list({ status: 'ACTIVE' }));
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});
  const [showCreateModal, setShowCreateModal] = useState(false);
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

  return (
    <Page title="Recurring schedules" u={u}>
      <SectionCard
        title="Schedules"
        actions={
          <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
            Create schedule
          </Button>
        }
      >
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
                  <small>
                    {s.frequency} · {s.status} · next {new Date(s.nextOccurrenceAt).toLocaleString()}
                  </small>
                </div>
                <div className="list-actions">
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={actionLoading[uid(s)]}
                    onClick={async () => {
                      setActionLoading((prev) => ({ ...prev, [uid(s)]: true }));
                      try {
                        await schedulesApi.generate(uid(s));
                        q.load();
                        toast('Schedule generated.');
                      } catch (e) {
                        setError(fail(e));
                      } finally {
                        setActionLoading((prev) => ({ ...prev, [uid(s)]: false }));
                      }
                    }}
                  >
                    Generate
                  </Button>
                  {s.status === 'ACTIVE' && (
                    <Button
                      variant="danger"
                      size="sm"
                      loading={actionLoading[uid(s)]}
                      onClick={async () => {
                        setActionLoading((prev) => ({ ...prev, [uid(s)]: true }));
                        try {
                          await schedulesApi.end(uid(s), { actorId: u.id });
                          q.load();
                          toast('Schedule ended.');
                        } catch (e) {
                          setError(fail(e));
                        } finally {
                          setActionLoading((prev) => ({ ...prev, [uid(s)]: false }));
                        }
                      }}
                    >
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

      {showCreateModal && (
        <CreateScheduleModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            q.load();
            toast('Recurring schedule created successfully.');
          }}
          locations={cl.data || []}
          routes={r.data || []}
          drivers={drivers}
          createdBy={u.id}
        />
      )}
    </Page>
  );
}
