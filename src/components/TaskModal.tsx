import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { endOfDay, formatDate, fromDatetimeLocal, parseDate, toTimeInput } from '../lib/dates';
import { TAG_LIST } from '../lib/tags';
import { PRIORITIES, STATUSES, type TagId, type Task } from '../types';
import { Button } from './ui';

function fromTask(task: Task): { date: string; time: string; allDay: boolean } {
  if (!task.deadline) return { date: '', time: '', allDay: false };
  const when = new Date(task.deadline);
  return {
    date: formatDate(when),
    time: task.allDay ? '' : toTimeInput(when),
    allDay: task.allDay,
  };
}

export function TaskModal() {
  const { editing, closeEditor, saveTask, deleteTask, state } = useApp();
  const [draft, setDraft] = useState<Task | null>(editing);
  const [when, setWhen] = useState(() => (editing ? fromTask(editing) : { date: '', time: '', allDay: false }));
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft(editing);
    setWhen(editing ? fromTask(editing) : { date: '', time: '', allDay: false });
    setError('');
    setConfirmDelete(false);
  }, [editing]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeEditor();
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [editing, closeEditor]);

  if (!editing || !draft) return null;
  const isNew = !state.tasks.some((task) => task.id === editing.id);

  function save() {
    if (!draft) return;
    if (!draft.title.trim()) {
      setError('Give the task a title.');
      return;
    }
    let deadline: string | null = null;
    let allDay = false;
    if (when.date) {
      if (when.allDay || !when.time) {
        deadline = endOfDay(parseDate(when.date)).toISOString();
        allDay = true;
      } else {
        deadline = fromDatetimeLocal(`${when.date}T${when.time}`)?.toISOString() ?? null;
      }
    }
    saveTask({
      ...draft,
      deadline,
      allDay,
      helpedMemberId: draft.helpedMemberId || null,
      recurrence: draft.recurrence === 'daily' ? 'daily' : null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Close task editor" onClick={closeEditor} />
      <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-card md:max-w-lg md:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="font-serif text-2xl">{isNew ? 'New task' : 'Edit task'}</h2>
          <button type="button" onClick={closeEditor} className="rounded-full px-2 py-1 text-sm text-stone-500 hover:bg-stone-100">
            Close
          </button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="field-label">Title</span>
            <input className="field" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} autoFocus />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Business</span>
              <select className="field" value={draft.tag} onChange={(e) => setDraft({ ...draft, tag: e.target.value as TagId })}>
                {TAG_LIST.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Assignee</span>
              <select className="field" value={draft.assigneeId} onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value })}>
                {state.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Priority</span>
              <select className="field" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value as Task['priority'] })}>
                {PRIORITIES.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="field-label">Status</span>
              <select className="field" value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as Task['status'] })}>
                {STATUSES.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Deadline date</span>
              <input className="field" type="date" value={when.date} onChange={(e) => setWhen({ ...when, date: e.target.value })} />
            </label>
            <label className="block">
              <span className="field-label">Time</span>
              <input
                className="field"
                type="time"
                value={when.time}
                disabled={when.allDay || !when.date}
                onChange={(e) => setWhen({ ...when, time: e.target.value, allDay: false })}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={when.allDay}
              onChange={(e) => setWhen({ ...when, allDay: e.target.checked, time: e.target.checked ? '' : when.time })}
            />
            All day (no hour on the calendar)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="field-label">Estimate (minutes)</span>
              <input
                className="field"
                type="number"
                min={15}
                step={5}
                value={draft.estimatedTime}
                onChange={(e) => setDraft({ ...draft, estimatedTime: Number(e.target.value) })}
              />
            </label>
            <label className="block">
              <span className="field-label">Helped teammate</span>
              <select
                className="field"
                value={draft.helpedMemberId ?? ''}
                onChange={(e) => setDraft({ ...draft, helpedMemberId: e.target.value || null })}
              >
                <option value="">None</option>
                {state.members
                  .filter((member) => member.id !== draft.assigneeId)
                  .map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={draft.recurrence === 'daily'}
              onChange={(e) => setDraft({ ...draft, recurrence: e.target.checked ? 'daily' : null })}
            />
            Repeats daily (a new copy appears when you finish it)
          </label>
          <label className="block">
            <span className="field-label">Notes</span>
            <textarea
              className="field h-24 py-2"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
            />
          </label>
          {draft.status === 'Done' && draft.completedAt ? (
            <p className="text-sm text-stone-500">
              Completed {new Date(draft.completedAt).toLocaleString()} · {draft.onTime ? 'On time' : 'Late'}
            </p>
          ) : null}
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {isNew ? <span /> : confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-stone-600">Delete this task?</span>
                <Button variant="danger" onClick={() => deleteTask(draft.id)}>
                  Delete
                </Button>
                <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmDelete(true)}>
                Delete
              </Button>
            )}
            <Button onClick={save}>Save task</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
