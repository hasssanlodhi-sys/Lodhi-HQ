import {
  addDays,
  daysBetween,
  formatDate,
  inRange,
  isBeforeSix,
  startOfDay,
  startOfWeek,
} from './dates';
import type { AppState, CheckIn, TagId, Task } from '../types';
import { GYM_WEEKLY_TARGET, LEVELS, OWNER_ID, POINTS } from '../types';
import { TAGS } from './tags';

export interface Badge {
  id: string;
  name: string;
  detail: string;
  earned: boolean;
  progress: string;
}

export interface LeaderRow {
  memberId: string;
  completed: number;
  onTimeRate: number | null;
}

export interface DashboardStats {
  weekCompletionRate: number | null;
  weekCompletionDone: number;
  weekCompletionTotal: number;
  weekOnTimeRate: number | null;
  weekOnTimeHit: number;
  weekOnTimeTotal: number;
  overdueCount: number;
  dueTodayCount: number;
  wakeStreak: number;
  gymStreakWeeks: number;
  gymThisWeek: number;
  gymTarget: number;
  punctualityStreak: number;
  completionByTag: { tag: TagId; count: number }[];
  onTimeTrend: { date: string; rate: number | null }[];
  leaderboard: LeaderRow[];
}

export interface Shoutout {
  weekLabel: string;
  memberId: string;
  completed: number;
  onTimeRate: number | null;
}

export interface PerformanceStats {
  points: number;
  onTimeCount: number;
  lateCount: number;
  habits: number;
  perfectWeeks: number;
  levelName: string;
  levelMin: number;
  nextLevel: string | null;
  nextLevelMin: number | null;
  levelProgress: number;
  badges: Badge[];
  appreciation: string;
  shoutouts: Shoutout[];
  wakeStreak: number;
  personalOnTimeRate: number | null;
  topBusiness: { tag: TagId; name: string; count: number } | null;
}

export function habitsOn(checkIn: CheckIn): number {
  let n = 0;
  if (isBeforeSix(checkIn.wokeUpAt)) n += 1;
  if (checkIn.gymDone) n += 1;
  if (checkIn.arrivedOnTime) n += 1;
  return n;
}

export function findCheckIn(checkIns: CheckIn[], day: Date): CheckIn | undefined {
  const key = formatDate(day);
  return checkIns.find((c) => c.date === key);
}

export function wakeStreak(checkIns: CheckIn[], now: Date): number {
  const today = startOfDay(now);
  const todayCheck = findCheckIn(checkIns, today);
  if (todayCheck && !isBeforeSix(todayCheck.wokeUpAt)) return 0;
  let cursor = todayCheck ? today : addDays(today, -1);
  let streak = 0;
  for (let i = 0; i < 90; i += 1) {
    const entry = findCheckIn(checkIns, cursor);
    if (!entry || !isBeforeSix(entry.wokeUpAt)) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function gymCount(checkIns: CheckIn[], weekStart: Date): number {
  let n = 0;
  for (let i = 0; i < 7; i += 1) {
    if (findCheckIn(checkIns, addDays(weekStart, i))?.gymDone) n += 1;
  }
  return n;
}

export function gymStreakWeeks(checkIns: CheckIn[], now: Date): number {
  let week = startOfWeek(now);
  if (gymCount(checkIns, week) < GYM_WEEKLY_TARGET) week = addDays(week, -7);
  let streak = 0;
  for (let i = 0; i < 12; i += 1) {
    if (gymCount(checkIns, week) < GYM_WEEKLY_TARGET) break;
    streak += 1;
    week = addDays(week, -7);
  }
  return streak;
}

function deadlineMissed(task: Task, now: Date): boolean {
  if (!task.deadline) return false;
  if (new Date(task.deadline).getTime() >= now.getTime()) return false;
  return task.status !== 'Done' || task.onTime === false;
}

export function dayFailedPunctuality(tasks: Task[], memberId: string, day: Date, now: Date): boolean {
  const start = startOfDay(day).getTime();
  const end = addDays(day, 1).getTime();
  for (const task of tasks) {
    if (task.assigneeId !== memberId) continue;
    if (task.completedAt && task.onTime === false) {
      const completed = new Date(task.completedAt).getTime();
      if (completed >= start && completed < end) return true;
    }
    if (task.deadline) {
      const due = new Date(task.deadline).getTime();
      if (due >= start && due < end && deadlineMissed(task, now)) return true;
    }
  }
  return false;
}

export function punctualityStreak(tasks: Task[], memberId: string, now: Date): number {
  const today = startOfDay(now);
  let streak = 0;
  for (let i = 0; i < 90; i += 1) {
    const day = addDays(today, -i);
    if (dayFailedPunctuality(tasks, memberId, day, now)) break;
    streak += 1;
  }
  return streak;
}

export function finishedWeekStarts(now: Date, lookback = 6): Date[] {
  const thisMonday = startOfWeek(now);
  const weeks: Date[] = [];
  for (let i = 1; i <= lookback; i += 1) weeks.push(addDays(thisMonday, -7 * i));
  return weeks;
}

export function isCleanWeek(start: Date, tasks: Task[], memberId: string, now: Date): boolean {
  const weekEnd = addDays(start, 7);
  if (weekEnd.getTime() > startOfDay(now).getTime()) return false;
  const startMs = start.getTime();
  const endMs = weekEnd.getTime();
  for (const task of tasks) {
    if (task.assigneeId !== memberId) continue;
    if (task.completedAt && task.onTime === false) {
      const completed = new Date(task.completedAt).getTime();
      if (completed >= startMs && completed < endMs) return false;
    }
    if (task.deadline) {
      const due = new Date(task.deadline).getTime();
      if (due >= startMs && due < endMs && deadlineMissed(task, now)) return false;
    }
  }
  return true;
}

export function isPerfectWeek(
  start: Date,
  tasks: Task[],
  checkIns: CheckIn[],
  memberId: string,
  now: Date,
): boolean {
  const weekEnd = addDays(start, 7);
  if (weekEnd.getTime() > startOfDay(now).getTime()) return false;
  let gym = 0;
  for (let i = 0; i < 7; i += 1) {
    const entry = findCheckIn(checkIns, addDays(start, i));
    if (!entry) return false;
    if (!isBeforeSix(entry.wokeUpAt)) return false;
    if (!entry.arrivedOnTime) return false;
    if (entry.gymDone) gym += 1;
  }
  if (gym < GYM_WEEKLY_TARGET) return false;
  return isCleanWeek(start, tasks, memberId, now);
}

function weekCompleted(tasks: Task[], start: Date, end: Date, memberId?: string): Task[] {
  return tasks.filter((task) => {
    if (task.status !== 'Done' || !task.completedAt) return false;
    if (memberId && task.assigneeId !== memberId) return false;
    return inRange(new Date(task.completedAt), start, end);
  });
}

function rateOf(tasks: Task[]): number | null {
  if (tasks.length === 0) return null;
  const hits = tasks.filter((task) => task.onTime !== false).length;
  return Math.round((hits / tasks.length) * 100);
}

export function topStaff(
  state: AppState,
  start: Date,
  end: Date,
): { memberId: string; completed: number; onTimeRate: number | null } | null {
  const rows = state.members
    .filter((member) => member.id !== OWNER_ID)
    .map((member) => {
      const tasks = weekCompleted(state.tasks, start, end, member.id);
      return { memberId: member.id, completed: tasks.length, onTimeRate: rateOf(tasks) };
    })
    .filter((row) => row.completed > 0)
    .sort((a, b) => {
      if (b.completed !== a.completed) return b.completed - a.completed;
      return (b.onTimeRate ?? -1) - (a.onTimeRate ?? -1);
    });
  return rows[0] ?? null;
}

function topBusiness(tasks: Task[], start: Date, end: Date): PerformanceStats['topBusiness'] {
  const counts = new Map<TagId, number>();
  for (const task of weekCompleted(tasks, start, end)) {
    counts.set(task.tag, (counts.get(task.tag) ?? 0) + 1);
  }
  let best: { tag: TagId; count: number } | null = null;
  for (const [tag, count] of counts) {
    if (!best || count > best.count) best = { tag, count };
  }
  if (!best) return null;
  return { tag: best.tag, name: TAGS[best.tag].short, count: best.count };
}

export function computeBadges(state: AppState, now: Date, memberId = OWNER_ID): Badge[] {
  const trackHabits = memberId === OWNER_ID;
  const early = trackHabits ? state.checkIns.filter((c) => isBeforeSix(c.wokeUpAt)).length : 0;
  let bestGym = 0;
  let iron = false;
  if (trackHabits) {
    let week = startOfWeek(now);
    for (let i = 0; i < 8; i += 1) {
      const count = gymCount(state.checkIns, week);
      bestGym = Math.max(bestGym, count);
      if (count >= GYM_WEEKLY_TARGET) iron = true;
      week = addDays(week, -7);
    }
  }
  const zero = finishedWeekStarts(now).some((start) => isCleanWeek(start, state.tasks, memberId, now));
  const helped = state.tasks.filter(
    (task) => task.assigneeId === memberId && task.status === 'Done' && task.helpedMemberId,
  ).length;
  return [
    {
      id: 'early-bird',
      name: 'Early Bird',
      detail: '7 wake-ups before 6:00 AM',
      earned: early >= 7,
      progress: `${Math.min(early, 7)}/7`,
    },
    {
      id: 'iron-week',
      name: 'Iron Week',
      detail: '5 gym sessions in a week',
      earned: iron,
      progress: `${Math.min(bestGym, GYM_WEEKLY_TARGET)}/${GYM_WEEKLY_TARGET} best`,
    },
    {
      id: 'zero-overdue',
      name: 'Zero Overdue',
      detail: 'A week with nothing late',
      earned: zero,
      progress: zero ? 'Earned' : 'Not yet',
    },
    {
      id: 'team-player',
      name: 'Team Player',
      detail: '10 teammate tasks helped',
      earned: helped >= 10,
      progress: `${Math.min(helped, 10)}/10`,
    },
  ];
}

export function performanceStats(state: AppState, now = new Date(), memberId = OWNER_ID): PerformanceStats {
  const trackHabits = memberId === OWNER_ID;
  const mine = state.tasks.filter((task) => task.assigneeId === memberId && task.status === 'Done');
  const lateCount = mine.filter((task) => task.onTime === false).length;
  const onTimeCount = mine.length - lateCount;
  const habits = trackHabits ? state.checkIns.reduce((sum, entry) => sum + habitsOn(entry), 0) : 0;
  const perfectWeeks = trackHabits
    ? finishedWeekStarts(now).filter((start) => isPerfectWeek(start, state.tasks, state.checkIns, memberId, now)).length
    : 0;
  const points =
    onTimeCount * POINTS.onTime +
    lateCount * POINTS.late +
    habits * POINTS.habit +
    perfectWeeks * POINTS.perfectWeek;

  let level: (typeof LEVELS)[number] = LEVELS[0];
  for (const item of LEVELS) if (points >= item.min) level = item;
  const index = LEVELS.findIndex((item) => item.name === level.name);
  const next = LEVELS[index + 1] ?? null;
  const levelProgress = next ? (points - level.min) / (next.min - level.min) : 1;

  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 7);
  const personal = weekCompleted(state.tasks, weekStart, weekEnd, memberId);
  const personalOnTimeRate = rateOf(personal);
  const business = topBusiness(state.tasks, weekStart, weekEnd);
  const streak = trackHabits ? wakeStreak(state.checkIns, now) : 0;
  const person = state.members.find((member) => member.id === memberId);
  const first = person?.name.split(' ')[0] || 'Muhammad';
  const businessSentence = business
    ? ` Top business: ${business.name} – ${business.count} task${business.count === 1 ? '' : 's'} closed.`
    : '';
  const appreciation =
    personalOnTimeRate == null
      ? `Great week, ${first}! ${streak}-day wake-up streak.${businessSentence || ' The week is still young.'}`
      : `Great week, ${first}! ${personalOnTimeRate}% on time, ${streak}-day wake-up streak.${businessSentence}`;

  const lastStart = addDays(weekStart, -7);
  const currentShout = topStaff(state, weekStart, weekEnd);
  const lastShout = topStaff(state, lastStart, weekStart);
  const shoutouts: Shoutout[] = [];
  if (currentShout) shoutouts.push({ weekLabel: 'This week', ...currentShout });
  if (lastShout) shoutouts.push({ weekLabel: 'Last week', ...lastShout });

  return {
    points,
    onTimeCount,
    lateCount,
    habits,
    perfectWeeks,
    levelName: level.name,
    levelMin: level.min,
    nextLevel: next?.name ?? null,
    nextLevelMin: next?.min ?? null,
    levelProgress,
    badges: computeBadges(state, now, memberId),
    appreciation,
    shoutouts,
    wakeStreak: streak,
    personalOnTimeRate,
    topBusiness: business,
  };
}

function lastNDays(now: Date, days: number): Date[] {
  const today = startOfDay(now);
  const dates: Date[] = [];
  for (let i = days - 1; i >= 0; i -= 1) dates.push(addDays(today, -i));
  return dates;
}

export function dashboardStats(state: AppState, now = new Date(), memberId = OWNER_ID): DashboardStats {
  const today = startOfDay(now);
  const weekStart = startOfWeek(now);
  const weekEnd = addDays(weekStart, 7);
  const dueByNow = state.tasks.filter((task) => {
    if (!task.deadline) return false;
    const due = new Date(task.deadline);
    return inRange(due, weekStart, weekEnd) && due.getTime() <= now.getTime();
  });
  const dueDone = dueByNow.filter((task) => task.status === 'Done');
  const completedThisWeek = weekCompleted(state.tasks, weekStart, weekEnd);
  const onTimeHit = completedThisWeek.filter((task) => task.onTime !== false).length;

  const overdueCount = state.tasks.filter(
    (task) => task.status !== 'Done' && task.deadline && new Date(task.deadline).getTime() < now.getTime(),
  ).length;
  const dueTodayCount = state.tasks.filter(
    (task) => task.status !== 'Done' && task.deadline && daysBetween(new Date(task.deadline), today) === 0,
  ).length;

  const windowStart = addDays(today, -29);
  const windowEnd = addDays(today, 1);
  const completionByTag = (Object.keys(TAGS) as TagId[]).map((tag) => ({
    tag,
    count: state.tasks.filter(
      (task) =>
        task.tag === tag &&
        task.status === 'Done' &&
        task.completedAt &&
        inRange(new Date(task.completedAt), windowStart, windowEnd),
    ).length,
  }));

  const onTimeTrend = lastNDays(now, 30).map((day) => {
    const done = state.tasks.filter(
      (task) =>
        task.status === 'Done' &&
        task.completedAt &&
        daysBetween(new Date(task.completedAt), day) === 0,
    );
    return { date: formatDate(day), rate: rateOf(done) };
  });

  const leaderboard = state.members
    .map((member) => {
      const tasks = state.tasks.filter(
        (task) =>
          task.assigneeId === member.id &&
          task.status === 'Done' &&
          task.completedAt &&
          inRange(new Date(task.completedAt), windowStart, windowEnd),
      );
      return { memberId: member.id, completed: tasks.length, onTimeRate: rateOf(tasks) };
    })
    .sort((a, b) => b.completed - a.completed || (b.onTimeRate ?? -1) - (a.onTimeRate ?? -1));

  return {
    weekCompletionRate: dueByNow.length ? Math.round((dueDone.length / dueByNow.length) * 100) : null,
    weekCompletionDone: dueDone.length,
    weekCompletionTotal: dueByNow.length,
    weekOnTimeRate: completedThisWeek.length ? Math.round((onTimeHit / completedThisWeek.length) * 100) : null,
    weekOnTimeHit: onTimeHit,
    weekOnTimeTotal: completedThisWeek.length,
    overdueCount,
    dueTodayCount,
    wakeStreak: wakeStreak(state.checkIns, now),
    gymStreakWeeks: gymStreakWeeks(state.checkIns, now),
    gymThisWeek: gymCount(state.checkIns, weekStart),
    gymTarget: GYM_WEEKLY_TARGET,
    punctualityStreak: punctualityStreak(state.tasks, memberId, now),
    completionByTag,
    onTimeTrend,
    leaderboard,
  };
}
