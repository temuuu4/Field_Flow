export function StatusBadge({ status, className = '' }) {
  const normalized = String(status || '').toUpperCase().replace(/[^A-Z0-9]/g, '_');
  const mapping = {
    ACTIVE: 'success',
    ASSIGNED: 'info',
    IN_PROGRESS: 'warning',
    COMPLETED: 'success',
    APPROVED: 'success',
    REJECTED: 'danger',
    CANCELLED: 'danger',
    PENDING: 'warning',
    INACTIVE: 'muted',
    UNKNOWN: 'muted',
    SUBMITTED: 'info',
  };
  const tone = mapping[normalized] || 'purple';
  return <span className={`badge badge-${tone} ${className}`}>{status}</span>;
}

export function RoleBadge({ role }) {
  return <span className="badge badge-muted">{role}</span>;
}
