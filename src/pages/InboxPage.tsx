import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, Search } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { RouteState } from '../lib/router';
import { addDays, formatShortDate, formatTime, inRange, sameDay, startOfDay, startOfWeek, fromDatetimeLocal } from '../lib/dates';
import { TAG_LIST } from '../lib/tags';
import { OWNER_ID, PRIORITIES, STATUSES, type Priority, type Status, type TagId, type Task } from '../types';
import { blankTask, cx, formatDuration, memberName, priorityRank, shortName } from '../lib/utils';
import { Button, PageHeader, PriorityPill, StatusPill, TagPill } from '../components/ui';

const DUE_FILTERS = ['all', 'overdue', 'today', 'tomorrow', 'week', 'later', 'none'] as const;
const STATUS_FILTERS = ['open', 'all', ...STATUSES] as const;
type DueFilter = (typeof DUE_FILTERS)[number];
type StatusFilter = (typeof STATUS_FILTERS)[number];
type SortKey = 'deadline' | 'priority';

interface Filters {
  q: string;
  tag: TagId | 'all';
  assignee: string;
  priority: Priority | 'all';
  due: DueFilter;
  status: StatusFilter;
  sort: SortKey;
}

function readFilters(params: URLSearchParams): Pick<Filters, 'tag' | 'due' | 'status'> {
  const tag = params.get('tag');
  const due = params.get('due');
  const status = params.get('status');
  return {
    tag: TAG_LIST.some((item) => item.id === tag) ? (tag as TagId) : 'all',
    due: DUE_FILTERS.includes(due as DueFilter) ? (due as DueFilter) : 'all',
    status: STATUS_FILTERS.includes(status as StatusFilter) ? (status as StatusFilter) : 'open',
  };
}

function matchesDue(task: Task, due: DueFilter, now: Date): boolean {
  if (due === 'all') return true;
  if (due === 'none') return !task.deadline;
  if (!task.deadline) return false;
  const when = new Date(task.deadline);
  const today = startOfDay(now);
  if (due === 'overdue') return task.status !== 'Done' && when.getTime() < now.getTime();
  if (due === 'today') return sameDay(when, today);
  if (due === 'tomorrow') return sameDay(when, addDays(today, 1));
  if (due === 'week') return inRange(when, startOfWeek(now), addDays(startOfWeek(now), 7));
  return when.getTime() >= addDays(startOfWeek(now), 7).getTime();
}

function dueText(task: Task, now: Date): { label: string; overdue: boolean } {
  if (!task.deadline) return { label: 'No deadline', overdue: false };
  const when = new Date(task.deadline);
  const today = startOfDay(now);
  const day = sameDay(when, today) ? 'Today' : sameDay(when, addDays(today, 1)) ? 'Tomorrow' : formatShortDate(when);
  const time = task.allDay ? 'All day' : formatTime(when);
  const overdue = task.status !== 'Done' && when.getTime() < now.getTime();
  return { label: `${overdue ? 'Overdue · ' : ''}${day} · ${time}`, overdue };
}

export function InboxPage({ route }: { route: RouteState }) {
  const { state, now, openTask, saveTask, setStatus } = useApp();
  const [filters, setFilters] = useState<Filters>(() => ({
    q: '',
    assignee: 'all',
    priority: 'all',
    sort: 'deadline',
    ...readFilters(route.params),
  }));
  const [title, setTitle] = useState('');
  const [quickTag, setQuickTag] = useState<TagId>('cell-phone');
  const [quickPriority, setQuickPriority] = useState<Priority>('Medium');
  const [quickAssignee, setQuickAssignee] = useState(OWNER_ID);
  const [quickDue, setQuickDue] = useState('');

  useEffect(() => {
    setFilters((current) => ({ ...current, ...readFilters(route.params) }));
  }, [route.raw]);

  const visible = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const list = state.tasks.filter((task) => {
      if (filters.tag !== 'all' && task.tag !== filters.tag) return false;
      if (filters.assignee !== 'all' && task.assigneeId !== filters.assignee) return false;
      if (filters.priority !== 'all' && task.priority !== filters.priority) return false;
      if (!matchesDue(task, filters.due, now)) return false;
      if (filters.status === 'open' && task.status === 'Done') return false;
      if (filters.status !== 'open' && filters.status !== 'all' && task.status !== filters.status) return false;
      if (q && !`${task.title} ${task.notes}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (filters.sort === 'priority') {
        const rank = priorityRank(a.priority) - priorityRank(b.priority);
        if (rank !== 0) return rank;
      }
      if (!a.deadline && !b.deadline) return a.title.localeCompare(b.title);
      if (!a.deadline) return 1;
      if (!b.deadline) return -1;
      return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
    });
  }, [state.tasks, filters, now]);

  const openCount = state.tasks.filter((task) => task.status !== 'Done').length;

  function quickAdd() {
    if (!title.trim()) return;
    const deadline = quickDue ? fromDatetimeLocal(quickDue)?.toISOString() ?? null : null;
    saveTask(
      blankTask({
        title,
        tag: filters.tag === 'all' ? quickTag : filters.tag,
        priority: quickPriority,
        assigneeId: quickAssignee,
        deadline,
        allDay: false,
      }),
    );
    setTitle('');
    setQuickDue('');
  }

  return (
    <div>
      <PageHeader title="Task inbox" subtitle={`${openCount} open across the businesses. ${visible.length} shown.`} />

      <form
        className="card mb-4 p-3"
        onSubmit={(event) => {
          event.preventDefault();
          quickAdd();
        }}
      >
        <div className="flex flex-col gap-2">
          <input
            className="field"
            placeholder="Quick add a task and hit enter"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="Task title"
          />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <select className="field" aria-label="Tag" value={filters.tag === 'all' ? quickTag : filters.tag} onChange={(e) => setQuickTag(e.target.value as TagId)} disabled={filters.tag !== 'all'}>
              {TAG_LIST.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.short}
                </option>
              ))}
            </select>
            <select className="field" aria-label="Priority" value={quickPriority} onChange={(e) => setQuickPriority(e.target.value as Priority)}>
              {PRIORITIES.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
            <select className="field" aria-label="Assignee" value={quickAssignee} onChange={(e) => setQuickAssignee(e.target.value)}>
              {state.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {shortName(member.name)}
                </option>
              ))}
            </select>
            <input className="field" type="datetime-local" aria-label="Deadline" value={quickDue} onChange={(e) => setQuickDue(e.target.value)} />
            <Button type="submit" className="col-span-2 sm:col-span-1">
              Add
            </Button>
          </div>
        </div>
      </form>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <FilterChip active={filters.tag === 'all'} onClick={() => setFilters({ ...filters, tag: 'all' })}>
          All tags
        </FilterChip>
        {TAG_LIST.map((tag) => (
          <FilterChip key={tag.id} active={filters.tag === tag.id} onClick={() => setFilters({ ...filters, tag: tag.id })}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: tag.color }} />
            {tag.short}
          </FilterChip>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <label className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-3 text-stone-400" />
          <input className="field pl-8" placeholder="Search" aria-label="Search tasks" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </label>
        <select className="field" aria-label="Assignee filter" value={filters.assignee} onChange={(e) => setFilters({ ...filters, assignee: e.target.value })}>
          <option value="all">All assignees</option>
          {state.members.map((member) => (
            <option key={member.id} value={member.id}>
              {shortName(member.name)}
            </option>
          ))}
        </select>
        <select className="field" aria-label="Priority filter" value={filters.priority} onChange={(e) => setFilters({ ...filters, priority: e.target.value as Priority | 'all' })}>
          <option value="all">All priorities</option>
          {PRIORITIES.map((priority) => (
            <option key={priority}>{priority}</option>
          ))}
        </select>
        <select className="field" aria-label="Due date filter" value={filters.due} onChange={(e) => setFilters({ ...filters, due: e.target.value as DueFilter })}>
          <option value="all">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="week">This week</option>
          <option value="later">Later</option>
          <option value="none">Unscheduled</option>
        </select>
        <select className="field" aria-label="Status filter" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as StatusFilter })}>
          <option value="open">Open</option>
          <option value="all">All statuses</option>
          {STATUSES.map((status) => (
            <option key={status}>{status}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-1">
          <FilterChip active={filters.sort === 'deadline'} onClick={() => setFilters({ ...filters, sort: 'deadline' })}>
            Deadline
          </FilterChip>
          <FilterChip active={filters.sort === 'priority'} onClick={() => setFilters({ ...filters, sort: 'priority' })}>
            Priority
          </FilterChip>
        </div>
      </div>

      <div className="space-y-2">
        {visible.length === 0 ? (
          <div className="card p-8 text-center text-sm text-stone-500">Nothing matches these filters.</div>
        ) : (
          visible.map((task) => {
            const due = dueText(task, now);
            const helped = state.members.find((member) => member.id === task.helpedMemberId);
            return (
              <article key={task.id} className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setStatus(task, task.status === 'Done' ? 'To Do' : 'Done')}
                  className={cx(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border',
                    task.status === 'Done' ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-stone-300 text-transparent hover:border-ink',
                  )}
                  aria-label={task.status === 'Done' ? 'Reopen task' : 'Mark task done'}
                >
                  <Check size={16} />
                </button>
                <button type="button" onClick={() => openTask(task)} className="min-w-0 flex-1 text-left">
                  <div className={cx('font-medium', task.status === 'Done' && 'text-stone-400 line-through')}>{task.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                    <TagPill tag={task.tag} />
                    <PriorityPill priority={task.priority} />
                    <StatusPill status={task.status} />
                    <span className={due.overdue ? 'font-medium text-red-700' : ''}>{due.label}</span>
                    <span>{formatDuration(task.estimatedTime)}</span>
                    <span>{shortName(memberName(state.members, task.assigneeId))}</span>
                    {task.recurrence === 'daily' ? <span className="rounded-full bg-stone-100 px-2 py-0.5">Daily</span> : null}
                    {helped ? <span className="rounded-full bg-violet-50 px-2 py-0.5 text-violet-800">Helped {shortName(helped.name)}</span> : null}
                    {task.status === 'Done' && task.onTime != null ? (
                      <span className={task.onTime ? 'text-emerald-700' : 'text-amber-700'}>{task.onTime ? 'On time' : 'Late'}</span>
                    ) : null}
                  </div>
                </button>
                <select
                  className="field sm:w-36"
                  aria-label={`Status for ${task.title}`}
                  value={task.status}
                  onChange={(e) => setStatus(task, e.target.value as Status)}
                >
                  {STATUSES.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm',
        active ? 'border-ink bg-ink text-white' : 'border-line bg-white text-stone-600 hover:bg-stone-50',
      )}
    >
      {children}
    </button>
  );
}
