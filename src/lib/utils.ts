import type { Member, Priority, Task } from '../types';

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`;
}

export function assignableMembers(members: Member[], selectedId?: string): Member[] {
  return members.filter((member) => member.active !== false || member.id === selectedId);
}

export function memberName(members: { id: string; name: string }[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? 'Unassigned';
}

export function shortName(name: string): string {
  if (name === 'Muhammad Hassan Lodhi') return 'Muhammad';
  return name;
}

const PRIORITY_RANK: Record<Priority, number> = {
  Urgent: 0,
  High: 1,
  Medium: 2,
  Low: 3,
};

export function priorityRank(priority: Priority): number {
  return PRIORITY_RANK[priority];
}

export function formatDuration(mins: number): string {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatHours(mins: number): string {
  const h = mins / 60;
  const digits = h >= 10 || Number.isInteger(h) ? 0 : 1;
  return `${h.toFixed(digits)}h`;
}

export function taskOnTime(task: Pick<Task, 'deadline' | 'completedAt'>): boolean {
  if (!task.completedAt) return false;
  if (!task.deadline) return true;
  return new Date(task.completedAt).getTime() <= new Date(task.deadline).getTime();
}

export function isExternalTask(task: { id: string; notes: string }): boolean {
  return /^(?:clickup|gcal|pos|rem)-/.test(task.id) || /\[source:\s*(?:clickup|gcal|pos|reminders):/.test(task.notes);
}

export function blankTask(partial: Partial<Task> = {}): Task {
  return {
    id: uid('task'),
    title: '',
    tag: 'personal',
    deadline: null,
    allDay: false,
    priority: 'Medium',
    assigneeId: 'muhammad',
    status: 'To Do',
    estimatedTime: 30,
    notes: '',
    completedAt: null,
    onTime: null,
    recurrence: null,
    helpedMemberId: null,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}
