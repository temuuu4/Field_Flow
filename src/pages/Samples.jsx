import { useState } from 'react';
import { samplesApi } from '../api/fieldflow';
import { useLoad, Page, Notice, uid, fail, uname, when } from './utils';
import { Button, SectionCard, FormField, StatusBadge } from '../components/ui';
import { useToast } from '../components/Toast';

export default function Samples({ u }) {
  const toast = useToast();
  const isDriver = u.role === 'DRIVER';
  const q = useLoad(() => samplesApi.list(isDriver ? { driverId: u.id } : {}), [u.id, isDriver]);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState({});

  const review = async (s, action) => {
    setSubmitting((prev) => ({ ...prev, [uid(s)]: true }));
    try {
      if (action === 'reject' && !reason.trim()) throw Error('A rejection reason is required.');
      action === 'approve' ? await samplesApi.approve(uid(s), { reviewedBy: u.id }) : await samplesApi.reject(uid(s), { reviewedBy: u.id, rejectionReason: reason });
      setReason('');
      q.load();
      toast(action === 'approve' ? 'Sample approved.' : 'Sample rejected.');
    } catch (e) {
      setError(fail(e));
    } finally {
      setSubmitting((prev) => ({ ...prev, [uid(s)]: false }));
    }
  };

  return (
    <Page title={isDriver ? 'My samples' : 'Sample review'} u={u}>
      <SectionCard title={isDriver ? 'Collected samples' : 'Submitted samples awaiting review'}>
        <Notice error={error || q.error} />
        {!isDriver && (
          <FormField label="Rejection reason" style={{ marginBottom: 'var(--space-4)' }} className="form-standalone">
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Required only when rejecting" />
          </FormField>
        )}
        {q.loading ? (
          <div className="loading-overlay">
            <div className="spinner" />
            <p className="loading-text">Loading samples…</p>
          </div>
        ) : q.data.length ? (
          <div className="list">
            {q.data.map((s) => (
              <div className="sample-list-item" key={uid(s)}>
                <div className="list-main">
                  <b>{s.sampleNumber}</b>
                  <small>
                    {s.barcodeValue} · {s.sampleType} · {uname(s.driverId)} · {when(s.collectedAt)}
                  </small>
                </div>
                <div className="list-actions">
                  <StatusBadge status={s.status} />
                  {isDriver && s.status === 'PENDING' && (
                    <Button variant="success" size="sm" loading={submitting[uid(s)]} onClick={async () => { try { await samplesApi.submit(uid(s), { driverId: u.id }); q.load(); toast('Sample submitted.'); } catch (e) { setError(fail(e)); } }}>
                      Submit
                    </Button>
                  )}
                  {!isDriver && s.status === 'SUBMITTED' && (
                    <>
                      <Button variant="success" size="sm" loading={submitting[uid(s)]} onClick={() => review(s, 'approve')}>Approve</Button>
                      <Button variant="danger" size="sm" loading={submitting[uid(s)]} onClick={() => review(s, 'reject')}>Reject</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
            <div className="empty-state-icon">🧪</div>
            <p className="empty-state-title">{isDriver ? 'No samples collected yet' : 'No samples awaiting review'}</p>
            <p className="empty-state-description">{isDriver ? 'Scan and collect samples to see them here.' : 'Submitted samples will appear here for review.'}</p>
          </div>
        )}
      </SectionCard>
    </Page>
  );
}
