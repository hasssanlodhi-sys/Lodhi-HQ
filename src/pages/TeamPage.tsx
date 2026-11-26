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
};

export function TeamPage() {
  const { state, saveMember, deleteMember } = useApp();
  const [draft, setDraft] = useState<Member | null>(null);
  const [error, setError] = useState('');

  function openNew() {
    setError('');
    setDraft({ ...EMPTY, id: uid('member'), businessTags: [] });
  }

  function toggleTag(tag: TagId) {
    if (!draft) return;
    const has = draft.businessTags.includes(tag);
    setDraft({
      ...draft,
      businessTags: has ? draft.businessTags.filter((item) => item !== tag) : [...draft.businessTags, tag],
    });
  }

  function save() {
    if (!draft) return;
    if (!draft.name.trim() || !draft.role.trim()) {
      setError('Name and role are required.');
      return;
    }
    saveMember({
      ...draft,
      name: draft.name.trim(),
      role: draft.role.trim(),
      contact: draft.contact.trim(),
      owner: draft.id === OWNER_ID,
    });
    setDraft(null);
  }

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Who carries each business."
        actions={<Button onClick={openNew}>Add member</Button>}
      />
      <div className="grid gap-3 md:grid-cols-2">
        {state.members.map((member) => {
          const open = state.tasks.filter((task) => task.assigneeId === member.id && task.status !== 'Done').length;
          const done = state.tasks.filter((task) => task.assigneeId === member.id && task.status === 'Done').length;
          return (
            <article key={member.id} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-serif text-2xl leading-tight">{member.name}</h2>
                  <p className="text-sm text-stone-500">{member.role}</p>
                </div>
                {member.owner ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">You</span> : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {member.businessTags.map((tag) => (
                  <TagPill key={tag} tag={tag} />
                ))}
              </div>
              <p className="mt-3 text-sm text-stone-600">{member.contact || 'No contact yet'}</p>
              <p className="mt-1 text-xs text-stone-500">
                {open} open · {done} completed
              </p>
              <div className="mt-3">
                <Button variant="ghost" onClick={() => { setError(''); setDraft(member); }}>
                  Edit
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {draft ? (
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
              <span className="field-label">Contact</span>
              <input className="field" value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} placeholder="Phone or email" />
            </label>
            <div>
              <span className="field-label">Businesses</span>
              <div className="flex flex-wrap gap-2">
                {TAG_LIST.map((tag) => {
                  const active = draft.businessTags.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleTag(tag.id)}
                      className={active ? '' : 'opacity-50'}
                    >
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
                  variant="danger"
                  onClick={() => {
                    deleteMember(draft.id);
                    setDraft(null);
                  }}
                >
                  Remove
                </Button>
              ) : (
                <span />
              )}
              <Button onClick={save}>Save member</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
