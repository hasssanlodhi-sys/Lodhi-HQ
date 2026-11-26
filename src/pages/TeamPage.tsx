import { useState } from 'react';
import { useApp } from '../context/AppContext';
import { TAG_LIST } from '../lib/tags';
import type { Member, TagId } from '../types';
import { OWNER_ID } from '../types';
import { uid } from '../lib/utils';
import { Button, Modal, PageHeader, TagPill } from '../components/ui';

const EMPTY: Member = {
  id: '',
  name: '',
  role: '',
  businessTags: [],
  contact: '',
  email: '',
  active: true,
};

export function TeamPage() {
  const { state, saveMember, setMemberActive, currentUser } = useApp();
  const [draft, setDraft] = useState<Member | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const canManage = currentUser.owner;

  function openNew() {
    setError('');
    setPassword('');
    setDraft({ ...EMPTY, id: uid('member'), businessTags: [] });
  }

  function openEdit(member: Member) {
    setError('');
    setPassword('');
    setDraft(member);
  }

  function toggleTag(tag: TagId) {
    if (!draft || !canManage) return;
    const has = draft.businessTags.includes(tag);
    setDraft({
      ...draft,
      businessTags: has ? draft.businessTags.filter((item) => item !== tag) : [...draft.businessTags, tag],
    });
  }

  async function save() {
    if (!draft || !canManage) return;
    const isNew = !state.members.some((member) => member.id === draft.id);
    if (!draft.name.trim() || !draft.role.trim()) {
      setError('Name and role are required.');
      return;
    }
    if (!draft.email?.trim()) {
      setError('Email is required.');
      return;
    }
    if (isNew && password.length < 8) {
      setError('Set a temporary password of at least 8 characters.');
      return;
    }
    if (!isNew && password !== '' && password.length < 8) {
      setError('A new password needs at least 8 characters.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveMember(
        {
          ...draft,
          name: draft.name.trim(),
          role: draft.role.trim(),
          contact: draft.contact.trim(),
          email: draft.email.trim(),
          owner: draft.id === OWNER_ID,
          active: draft.active !== false,
        },
        password || undefined,
      );
      setDraft(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the account.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle={
          canManage
            ? 'Who carries each business. Staff see tasks assigned to them, plus every task in the businesses you check.'
            : 'You see tasks assigned to you, plus tasks in the businesses on your card.'
        }
        actions={canManage ? <Button onClick={openNew}>Add member</Button> : undefined}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {state.members.map((member) => {
          const open = state.tasks.filter((task) => task.assigneeId === member.id && task.status !== 'Done').length;
          const done = state.tasks.filter((task) => task.assigneeId === member.id && task.status === 'Done').length;
          return (
            <article key={member.id} className={member.active === false ? 'card p-4 opacity-70' : 'card p-4'}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl leading-tight">{member.name}</h2>
                  <p className="text-sm text-stone-500">{member.role}</p>
                </div>
                <div className="flex gap-1">
                  {member.id === currentUser.id ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">You</span> : null}
                  {member.owner && member.id !== currentUser.id ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">Owner</span>
                  ) : null}
                  {member.active === false ? <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700">Inactive</span> : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {member.businessTags.map((tag) => (
                  <TagPill key={tag} tag={tag} />
                ))}
              </div>
              {member.email ? <p className="mt-3 text-sm text-stone-600">{member.email}</p> : null}
              <p className="mt-1 text-sm text-stone-600">{member.contact || 'No contact yet'}</p>
              <p className="mt-1 text-xs text-stone-500">
                {open} open · {done} completed
              </p>
              {canManage ? (
                <div className="mt-3">
                  <Button variant="ghost" onClick={() => openEdit(member)}>
                    Edit
                  </Button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      {draft && canManage ? (
        <Modal title={state.members.some((member) => member.id === draft.id) ? 'Edit member' : 'New member'} onClose={() => setDraft(null)}>
          <div className="space-y-3">
            <label className="block">
              <span className="field-label">Name</span>
              <input className="field" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Role</span>
              <input className="field" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Email</span>
              <input className="field" type="email" autoComplete="off" value={draft.email ?? ''} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Contact</span>
              <input className="field" value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} placeholder="Phone" />
            </label>
            {draft.id !== OWNER_ID ? (
              <label className="block">
                <span className="field-label">{state.members.some((member) => member.id === draft.id) ? 'New temporary password' : 'Temporary password'}</span>
                <input
                  className="field"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={state.members.some((member) => member.id === draft.id) ? 'Leave blank to keep the current password' : 'At least 8 characters'}
                />
                <span className="mt-1 block text-xs normal-case tracking-normal text-stone-500">
                  They must change it the next time they sign in.
                </span>
              </label>
            ) : null}
            <div>
              <span className="field-label">Businesses</span>
              <p className="mb-2 text-xs text-stone-500">Checked businesses are visible to this person, along with anything assigned to them.</p>
              <div className="flex flex-wrap gap-2">
                {TAG_LIST.map((tag) => {
                  const active = draft.businessTags.includes(tag.id);
                  return (
                    <button key={tag.id} type="button" onClick={() => toggleTag(tag.id)} className={active ? '' : 'opacity-50'}>
                      <TagPill tag={tag.id} />
                    </button>
                  );
                })}
              </div>
            </div>
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
            <div className="flex flex-wrap justify-between gap-2">
              {draft.id !== OWNER_ID && state.members.some((member) => member.id === draft.id) ? (
                <Button
                  variant={draft.active === false ? 'soft' : 'danger'}
                  disabled={saving}
                  onClick={() => {
                    const next = draft.active === false;
                    setSaving(true);
                    void setMemberActive(draft.id, next)
                      .then(() => setDraft(null))
                      .catch((err: unknown) => {
                        setError(err instanceof Error ? err.message : 'Could not update the account.');
                      })
                      .finally(() => setSaving(false));
                  }}
                >
                  {draft.active === false ? 'Reactivate' : 'Deactivate'}
                </Button>
              ) : (
                <span />
              )}
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? 'Saving…' : 'Save member'}
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
