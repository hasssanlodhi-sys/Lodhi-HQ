import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react';
import { addDaysKeepTime, sameDay } from '../lib/dates';
import { loadState, saveState } from '../data/storage';
import { buildSeed } from '../data/seed';
import type { AppState, CheckIn, Member, Reward, Status, Task } from '../types';
import { blankTask, uid } from '../lib/utils';

type Action =
  | { type: 'save-task'; task: Task; now: string }
  | { type: 'delete-task'; id: string }
  | { type: 'reschedule'; id: string; deadline: string | null; allDay: boolean }
  | { type: 'save-checkin'; checkIn: CheckIn }
  | { type: 'save-member'; member: Member }
  | { type: 'delete-member'; id: string }
  | { type: 'save-reward'; reward: Reward }
  | { type: 'delete-reward'; id: string }
  | { type: 'reset'; now: string };

function stampDone(task: Task, completedAt: string): Task {
  const onTime = task.deadline ? new Date(completedAt).getTime() <= new Date(task.deadline).getTime() : true;
  return { ...task, status: 'Done', completedAt, onTime };
}

function nextDaily(task: Task, now: Date): Task {
  const deadline = task.deadline ? addDaysKeepTime(new Date(task.deadline), 1).toISOString() : null;
  return {
    ...task,
    id: uid('task'),
    status: 'To Do',
    completedAt: null,
    onTime: null,
    deadline,
    createdAt: now.toISOString(),
  };
}

function saveTask(state: AppState, incoming: Task, now: Date): AppState {
  const existing = state.tasks.find((task) => task.id === incoming.id);
  let task: Task = {
    ...incoming,
    title: incoming.title.trim(),
    estimatedTime: Math.max(15, Math.round(incoming.estimatedTime || 15)),
  };
  const becameDone = task.status === 'Done' && (!existing || existing.status !== 'Done');
  if (task.status === 'Done') {
    const completedAt = becameDone ? now.toISOString() : existing?.completedAt || task.completedAt || now.toISOString();
    task = stampDone(task, completedAt);
  } else {
    task = { ...task, completedAt: null, onTime: null };
  }
  let tasks = existing ? state.tasks.map((item) => (item.id === task.id ? task : item)) : [task, ...state.tasks];
  if (becameDone && task.recurrence === 'daily') {
    const next = nextDaily(task, now);
    const already = tasks.some(
      (item) =>
        item.id !== task.id &&
        item.recurrence === 'daily' &&
        item.title === task.title &&
        item.status !== 'Done' &&
        !!item.deadline &&
        !!next.deadline &&
        sameDay(new Date(item.deadline), new Date(next.deadline)),
    );
    if (!already) tasks = [next, ...tasks];
  }
  return { ...state, tasks };
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'save-task':
      return saveTask(state, action.task, new Date(action.now));
    case 'delete-task':
      return { ...state, tasks: state.tasks.filter((task) => task.id !== action.id) };
    case 'reschedule':
      return {
        ...state,
        tasks: state.tasks.map((task) => {
          if (task.id !== action.id) return task;
          const next = { ...task, deadline: action.deadline, allDay: action.allDay };
          if (next.status === 'Done' && next.completedAt) {
            next.onTime = next.deadline
              ? new Date(next.completedAt).getTime() <= new Date(next.deadline).getTime()
              : true;
          }
          return next;
        }),
      };
    case 'save-checkin': {
      const others = state.checkIns.filter((item) => item.date !== action.checkIn.date);
      const checkIns = [...others, action.checkIn].sort((a, b) => a.date.localeCompare(b.date));
      return { ...state, checkIns };
    }
    case 'save-member': {
      const exists = state.members.some((member) => member.id === action.member.id);
      const members = exists
        ? state.members.map((member) => (member.id === action.member.id ? action.member : member))
        : [...state.members, action.member];
      return { ...state, members };
    }
    case 'delete-member': {
      if (action.id === 'muhammad') return state;
      return {
        ...state,
        members: state.members.filter((member) => member.id !== action.id),
        tasks: state.tasks.map((task) => ({
          ...task,
          assigneeId: task.assigneeId === action.id ? 'muhammad' : task.assigneeId,
          helpedMemberId: task.helpedMemberId === action.id ? null : task.helpedMemberId,
        })),
      };
    }
    case 'save-reward': {
      const exists = state.rewards.some((reward) => reward.id === action.reward.id);
      const rewards = exists
        ? state.rewards.map((reward) => (reward.id === action.reward.id ? action.reward : reward))
        : [...state.rewards, action.reward];
      return { ...state, rewards };
    }
    case 'delete-reward':
      return { ...state, rewards: state.rewards.filter((reward) => reward.id !== action.id) };
    case 'reset':
      return buildSeed(new Date(action.now));
    default:
      return state;
  }
}

interface AppContextValue {
  state: AppState;
  now: Date;
  editing: Task | null;
  openTask: (task: Task) => void;
  openNewTask: (partial?: Partial<Task>) => void;
  closeEditor: () => void;
  saveTask: (task: Task) => void;
  deleteTask: (id: string) => void;
  setStatus: (task: Task, status: Status) => void;
  reschedule: (id: string, deadline: string | null, allDay: boolean) => void;
  saveCheckIn: (checkIn: CheckIn) => void;
  saveMember: (member: Member) => void;
  deleteMember: (id: string) => void;
  saveReward: (reward: Reward) => void;
  deleteReward: (id: string) => void;
  reset: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState<Task | null>(null);

  useEffect(() => {
    saveState(state);
  }, [state]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const api = useMemo<AppContextValue>(() => {
    const at = () => new Date().toISOString();
    return {
      state,
      now,
      editing,
      openTask: (task) => setEditing(task),
      openNewTask: (partial) => setEditing(blankTask(partial)),
      closeEditor: () => setEditing(null),
      saveTask: (task) => {
        dispatch({ type: 'save-task', task, now: at() });
        setEditing(null);
      },
      deleteTask: (id) => {
        dispatch({ type: 'delete-task', id });
        setEditing(null);
      },
      setStatus: (task, status) => dispatch({ type: 'save-task', task: { ...task, status }, now: at() }),
      reschedule: (id, deadline, allDay) => dispatch({ type: 'reschedule', id, deadline, allDay }),
      saveCheckIn: (checkIn) => dispatch({ type: 'save-checkin', checkIn }),
      saveMember: (member) => dispatch({ type: 'save-member', member }),
      deleteMember: (id) => dispatch({ type: 'delete-member', id }),
      saveReward: (reward) => dispatch({ type: 'save-reward', reward }),
      deleteReward: (id) => dispatch({ type: 'delete-reward', id }),
      reset: () => {
        dispatch({ type: 'reset', now: at() });
        setEditing(null);
      },
    };
  }, [state, now, editing]);

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
