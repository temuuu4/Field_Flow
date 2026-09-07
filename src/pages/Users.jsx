import { useState } from 'react';
import { createUser, deactivateUser, getUsers, updateUser } from '../api/users';
import { useLoad, Page, Notice, Avatar, uid, normalizeUserId, uname, present, when, fail, labels } from './utils';
import { Button, SectionCard, FormField } from '../components/ui';
import { useToast } from '../components/Toast';

export default function Users({ u, refresh }) {
  const toast = useToast();
  const [role, setRole] = useState('');
  const q = useLoad(() => getUsers(role ? { role } : {}).then((x) => x.map(present)), [role]);
  const blank = { firstName: '', lastName: '', email: '', role: 'DRIVER', status: 'ACTIVE' };
  const [form, setForm] = useState(blank);
  const [edit, setEdit] = useState(null);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  // Legacy Phase-6 prop: when the dev-user selector existed, the page
  // would refresh its parent so the selector updated. With real auth we
  // don't need that; calling `refresh?.()` keeps the prop tolerated for
  // any caller that still passes one.
  const safeRefresh = () => { if (typeof refresh === 'function') refresh(); };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!form.firstName || !form.lastName || !form.email) {
        throw Error('First name, last name, and email are required.');
      }
      edit ? await updateUser(edit, form) : await createUser(form);
      setForm(blank);
      setEdit(null);
      setMessage('User saved.');
      q.load();
      safeRefresh();
      toast(edit ? 'User updated.' : 'User created.');
    } catch (x) {
      q.setError(fail(x));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Page title="User management" u={u}>
      <SectionCard title="Team access">
        <div className="user-tools">
          <FormField label="Role">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All roles</option>
              {Object.keys(labels).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </FormField>
          <Button variant="secondary" onClick={q.load}>
            Refresh
          </Button>
        </div>
        <Notice error={q.error} message={message} />
        {q.loading ? (
          <div className="loading-overlay">
            <div className="spinner" />
            <p className="loading-text">Loading users…</p>
          </div>
        ) : q.data.length ? (
          <div className="list">
            {q.data.map((x) => (
              <div className="driver-list-item" key={x.id}>
                <Avatar u={x} />
                <div className="list-main">
                  <b>{x.name}</b>
                  <small>
                    {x.email} · {x.roleLabel} · {x.status}
                  </small>
                </div>
                <div className="list-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEdit(x.id);
                      setForm({
                        firstName: x.firstName,
                        lastName: x.lastName,
                        email: x.email,
                        phone: x.phone || '',
                        role: x.role,
                        status: x.status.toUpperCase(),
                      });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    loading={actionLoading[x.id]}
                    onClick={async () => {
                      setActionLoading((prev) => ({ ...prev, [x.id]: true }));
                      try {
                        await deactivateUser(x.id);
                        q.load();
                        safeRefresh();
                        toast('User deactivated.');
                      } catch (e) {
                        q.setError(fail(e));
                      } finally {
                        setActionLoading((prev) => ({ ...prev, [x.id]: false }));
                      }
                    }}
                  >
                    Deactivate
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No users found.</p>
        )}
      </SectionCard>
      <SectionCard title={edit ? 'Edit user' : 'Create user'}>
        <form className="form-grid" onSubmit={submit}>
          {['firstName', 'lastName', 'email', 'phone'].map((k) => (
            <FormField key={k} label={k}>
              <input
                type={k === 'email' ? 'email' : 'text'}
                value={form[k] || ''}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </FormField>
          ))}
          <FormField label="Role">
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {Object.keys(labels).map((x) => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Status">
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </FormField>
          <div className="form-actions">
            <Button variant="primary" type="submit" loading={submitting}>
              {submitting ? (edit ? 'Saving...' : 'Creating...') : (edit ? 'Save changes' : 'Create user')}
            </Button>
            {edit && (
              <Button variant="ghost" type="button" onClick={() => { setEdit(null); setForm(blank); }}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </SectionCard>
    </Page>
  );
}
