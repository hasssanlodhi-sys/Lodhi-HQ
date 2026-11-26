import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addDaysKeepTime, sameDay } from '../lib/dates';
import { buildSeed } from '../data/seed';
import {
  DEMO_STAFF_PASSWORD,
  loadBoard,
  persistDiff,
  resetBoard,
  setMemberActive as setMemberActiveRequest,
  createMember,
  updateMember,
  type CurrentUser,
} from '../lib/api';
import type { AppState, CheckIn, Member, Reward, Status, Task } from '../types';
import { blankTask, uid } from '../lib/utils';
import { useAuth } from './AuthContext';
import { Button } from '../components/ui';
import { Splash } from '../pages/SignInPage';

type Action =
  | { type: 'save-task'; task: Task; now: string }
  | { type: 'delete-task'; id: string }
  | { type: 'reschedule'; id: string; deadline: string | null; allDay: boolean }
  | { type: 'save-checkin'; checkIn: CheckIn }
  | { type: 'save-reward'; reward: Reward }
  | { type: 'delete-reward'; id: string };

export interface Banner {
  tone: 'error' | 'info';
  text: string;
}

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
    estimatedTime: Math.min(20000, Math.max(15, Math.round(incoming.estimatedTime || 15))),
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
            next.onTime = next.deadline ? new Date(next.completedAt).getTime() <= new Date(next.deadline).getTime() : true;
          }
          return next;
        }),
      };
    case 'save-checkin': {
      const others = state.checkIns.filter((item) => item.date !== action.checkIn.date);
      const checkIns = [...others, action.checkIn].sort((a, b) => a.date.localeCompare(b.date));
      return { ...state, checkIns };
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
    default:
      return state;
  }
}

function toAppState(board: { tasks: Task[]; members: Member[]; checkIns: CheckIn[]; rewards: Reward[] }): AppState {
  return {
    tasks: board.tasks,
    members: board.members,
    checkIns: board.checkIns,
    rewards: board.rewards,
  };
}

interface AppContextValue {
  state: AppState;
  now: Date;
  currentUser: CurrentUser;
  editing: Task | null;
  banner: Banner | null;
  clearBanner: () => void;
  openTask: (task: Task) => void;
  openNewTask: (partial?: Partial<Task>) => void;
  closeEditor: () => void;
  saveTask: (task: Task) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  setStatus: (task: Task, status: Status) => Promise<void>;
  reschedule: (id: string, deadline: string | null, allDay: boolean) => Promise<void>;
  saveCheckIn: (checkIn: CheckIn) => Promise<void>;
  saveMember: (member: Member, password?: string) => Promise<void>;
  setMemberActive: (id: string, active: boolean) => Promise<void>;
  saveReward: (reward: Reward) => Promise<void>;
  deleteReward: (id: string) => Promise<void>;
  reset: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const currentUser = auth.user;
  const [state, setState] = useState<AppState | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [editing, setEditing] = useState<Task | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [loadError, setLoadError] = useState('');
  const stateRef = useRef<AppState | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const userId = currentUser?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        let board = await loadBoard();
        if (cancelled) return;
        if (board.pendingSample && board.user.owner && board.tasks.length === 0) {
          board = await resetBoard(buildSeed(new Date()));
          if (cancelled) return;
          setBanner({
            tone: 'info',
            text: `Sample board loaded. Demo staff sign in with their @lodhi.local email and temporary password ${DEMO_STAFF_PASSWORD}.`,
          });
        }
        const next = toAppState(board);
        stateRef.current = next;
        setState(next);
        auth.applyUser(board.user);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load the board.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, auth.applyUser]);

  function enqueue(work: () => Promise<void>): Promise<void> {
    const run = queueRef.current.then(work, work);
    queueRef.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function refreshFromServer(): Promise<void> {
    const fresh = await loadBoard();
    const next = toAppState(fresh);
    stateRef.current = next;
    setState(next);
    auth.applyUser(fresh.user);
  }

  async function commit(action: Action): Promise<void> {
    await enqueue(async () => {
      const prev = stateRef.current;
      if (!prev) return;
      const next = reducer(prev, action);
      try {
        await persistDiff(prev, next);
      } catch (err) {
        const text = err instanceof Error ? err.message : 'Could not save.';
        setBanner({ tone: 'error', text });
        try {
          await refreshFromServer();
        } catch {
          /* Keep the last good board if the reload also fails. */
        }
        throw err;
      }
      stateRef.current = next;
      setState(next);
      setBanner((current) => (current?.tone === 'error' ? null : current));
    });
  }

  const api = useMemo<AppContextValue | null>(() => {
    if (!state || !currentUser) return null;
    const at = () => new Date().toISOString();
    return {
      state,
      now,
      currentUser,
      editing,
      banner,
      clearBanner: () => setBanner(null),
      openTask: (task) => setEditing(task),
      openNewTask: (partial) => setEditing(blankTask({ assigneeId: currentUser.id, ...partial })),
      closeEditor: () => setEditing(null),
      saveTask: async (task) => {
        await commit({ type: 'save-task', task, now: at() });
        setEditing(null);
      },
      deleteTask: async (id) => {
        await commit({ type: 'delete-task', id });
        setEditing(null);
      },
      setStatus: (task, status) => commit({ type: 'save-task', task: { ...task, status }, now: at() }),
      reschedule: (id, deadline, allDay) => commit({ type: 'reschedule', id, deadline, allDay }),
      saveCheckIn: (checkIn) => commit({ type: 'save-checkin', checkIn }),
      saveReward: (reward) => commit({ type: 'save-reward', reward }),
      deleteReward: (id) => commit({ type: 'delete-reward', id }),
      saveMember: async (member, password) => {
        await enqueue(async () => {
          const prev = stateRef.current;
          if (!prev) return;
          try {
            const exists = prev.members.some((item) => item.id === member.id);
            const saved = exists ? await updateMember(member, password) : await createMember(member, password ?? '');
            const members = exists
              ? prev.members.map((item) => (item.id === saved.member.id ? saved.member : item))
              : [...prev.members, saved.member];
            const next = { ...prev, members };
            stateRef.current = next;
            setState(next);
            if (saved.user) auth.applyUser(saved.user);
            setBanner((current) => (current?.tone === 'error' ? null : current));
          } catch (err) {
            setBanner({ tone: 'error', text: err instanceof Error ? err.message : 'Could not save the account.' });
            throw err;
          }
        });
      },
      setMemberActive: async (id, active) => {
        await enqueue(async () => {
          const prev = stateRef.current;
          if (!prev) return;
          try {
            const saved = await setMemberActiveRequest(id, active);
            const next = {
              ...prev,
              members: prev.members.map((item) => (item.id === saved.member.id ? saved.member : item)),
            };
            stateRef.current = next;
            setState(next);
            setBanner((current) => (current?.tone === 'error' ? null : current));
          } catch (err) {
            setBanner({ tone: 'error', text: err instanceof Error ? err.message : 'Could not update the account.' });
            throw err;
          }
        });
      },
      reset: async () => {
        await enqueue(async () => {
          try {
            const board = await resetBoard(buildSeed(new Date()));
            const next = toAppState(board);
            stateRef.current = next;
            setState(next);
            setEditing(null);
            auth.applyUser(board.user);
            setBanner({
              tone: 'info',
              text: `Sample data restored. Demo staff use temporary password ${DEMO_STAFF_PASSWORD} until they change it. Your owner email and password stayed.`,
            });
          } catch (err) {
            try {
              await refreshFromServer();
            } catch {
              /* Leave the board as it was. */
            }
            setBanner({ tone: 'error', text: err instanceof Error ? err.message : 'Could not reset the board.' });
            throw err;
          }
        });
      },
    };
  }, [state, now, editing, currentUser, banner, auth.applyUser]);

  if (!currentUser) return null;
  if (loadError) {
    return (
      <Splash
        subtitle={loadError}
        action={
          <Button onClick={() => void auth.signOut()}>Sign out</Button>
        }
      />
    );
  }
  if (!api) return <Splash subtitle="Loading the board…" />;

  return <AppContext.Provider value={api}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
