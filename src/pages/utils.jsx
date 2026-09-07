import { useState, useEffect, useRef, useCallback } from 'react';

export const labels = { DRIVER: 'Driver', OPERATOR: 'Operations Admin', IT_ADMIN: 'IT Administrator' };
export const colors = ['#ed8354', '#665bd7', '#2da779', '#d69a3d', '#4384c8'];

export const uid = (x) => x?._id || x?.id || x;

export const normalizeUserId = (value) => {
  const next = uid(value);
  if (next === null || next === undefined || next === '') return '';
  return String(next).trim();
};

export const uname = (x) => x?.displayName || `${x?.firstName || ''} ${x?.lastName || ''}`.trim() || '—';

export const present = (x, i = 0) => {
  if (!x || typeof x !== 'object') return null;
  const nextId = normalizeUserId(x);
  if (!nextId) return null;
  return {
    ...x,
    id: nextId,
    _id: x._id || nextId,
    name: x.displayName || uname(x),
    initials: `${x.firstName?.[0] || ''}${x.lastName?.[0] || ''}`,
    color: colors[i % 5],
    roleLabel: labels[x.role] || x.role,
    status: (x.status || 'unknown').toLowerCase(),
  };
};

export const when = (x) => x ? new Date(x).toLocaleString() : '—';

export const fail = (e) => e?.message || 'Unable to complete the request.';

export const Badge = ({ children, tone = 'purple' }) => <span className={`badge ${tone}`}>{children}</span>;

export const Avatar = ({ u }) => (
  <span className="avatar" style={{ background: u?.color || '#665bd7' }}>
    {u?.initials || '?'}
  </span>
);

export const Notice = ({ error, message }) =>
  error ? <p className="form-error">{error}</p> : message ? <p className="success">{message}</p> : null;

export const Page = ({ title, u, children }) => (
  <>
    <header>
      <div>
        <small>FIELD OPERATIONS</small>
        <h1>{title}</h1>
      </div>
      <Avatar u={u} />
    </header>
    <article>{children}</article>
  </>
);

export const useLoad = (fn, deps = []) => {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fn());
    } catch (e) {
      setError(fail(e));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, deps);
  return { data, setData, loading, error, setError, load };
};
