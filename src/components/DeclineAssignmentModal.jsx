import { useState, useEffect, useRef } from 'react';
import { Button } from './ui';

export function DeclineAssignmentModal({ open, assignment, onClose, onConfirm, busy }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setError('');
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open && ref.current) {
      ref.current.focus();
    }
  }, [open]);

  if (!open || !assignment) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('A decline reason is required.');
      return;
    }
    onConfirm(trimmed);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="decline-assignment-title">
        <div className="modal-header">
          <h2 id="decline-assignment-title">Decline assignment</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <p style={{ margin: '0 0 var(--space-3)', color: 'var(--muted)', fontSize: 'var(--text-sm)' }}>
              You are declining <b>{assignment.title}</b>. This cannot be undone.
            </p>
            <div className="field">
              <label>
                Reason for declining <span style={{ color: 'var(--danger)', marginLeft: '4px' }}>*</span>
              </label>
              <textarea
                ref={ref}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (error) setError('');
                }}
                placeholder="Tell the operator why you cannot accept this assignment."
                rows={4}
                maxLength={1000}
                autoFocus
              />
              {error && <p className="form-error">{error}</p>}
            </div>
          </div>
          <div className="modal-footer">
            <Button variant="secondary" type="button" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button variant="danger" type="submit" loading={busy}>Decline assignment</Button>
          </div>
        </form>
      </div>
    </div>
  );
}
