import { buildSeed } from '../src/data/seed';
import { addDays, formatDate, pastDaysThisWeek, startOfWeek } from '../src/lib/dates';
import { dashboardStats, isPerfectWeek, performanceStats } from '../src/lib/stats';
import { OWNER_ID } from '../src/types';

let failures = 0;

function assert(condition: unknown, message: string): void {
  if (!condition) {
    failures += 1;
    console.error('FAIL', message);
  }
}

const REQUIRED = [
  'Restock iPhone 15 screen protectors',
  'Ship 12 Walmart Fitbit orders',
  'Chase W-2s from 3 clients',
  'List 2019 Camry on Facebook Marketplace',
  'Send November ad report to client',
  'Gym – leg day',
];

const thursday = new Date(2026, 10, 26, 0, 30, 0, 0);

for (let day = 0; day < 7; day += 1) {
  const now = new Date(thursday);
  now.setDate(thursday.getDate() + day);
  now.setHours(0, 30, 0, 0);
  const state = buildSeed(now);
  const dash = dashboardStats(state, now);
  const perf = performanceStats(state, now);
  const label = now.toDateString();

  assert(state.checkIns.length === 30, `${label} check-ins ${state.checkIns.length}`);
  assert(new Set(state.checkIns.map((item) => item.date)).size === 30, `${label} unique check-ins`);
  assert(state.tasks.filter((task) => task.status !== 'Done').length >= 20, `${label} open tasks`);
  for (const title of REQUIRED) {
    assert(state.tasks.some((task) => task.title === title), `${label} missing ${title}`);
  }
  const w2 = state.tasks.find((task) => task.title === 'Chase W-2s from 3 clients');
  assert(w2?.status === 'Waiting' && w2.tag === 'tax' && w2.assigneeId === 'office-assistant', `${label} W-2 fields`);
  const gym = state.tasks.find((task) => task.title === 'Gym – leg day');
  assert(gym?.recurrence === 'daily' && gym.tag === 'personal' && gym.assigneeId === OWNER_ID, `${label} gym fields`);
  assert(state.tasks.find((task) => task.title === 'Ship 12 Walmart Fitbit orders')?.priority === 'Urgent', `${label} fitbit priority`);

  for (let offset = -14; offset <= -1; offset += 1) {
    const date = formatDate(addDays(now, offset));
    const entry = state.checkIns.find((item) => item.date === date);
    assert(entry && entry.wokeUpAt < '06:00', `${label} wake ${date} ${entry?.wokeUpAt}`);
  }
  const cap = state.checkIns.find((item) => item.date === formatDate(addDays(now, -15)));
  assert(cap && cap.wokeUpAt >= '06:00', `${label} cap day ${cap?.wokeUpAt}`);
  assert(perf.wakeStreak === 14, `${label} wake streak ${perf.wakeStreak}`);
  assert(dash.gymStreakWeeks >= 2, `${label} gym weeks ${dash.gymStreakWeeks}`);
  assert(perf.badges.every((badge) => badge.earned), `${label} badges ${perf.badges.map((badge) => `${badge.id}:${badge.earned}`).join(',')}`);
  assert(perf.perfectWeeks >= 1, `${label} perfect weeks ${perf.perfectWeeks}`);
  assert(isPerfectWeek(addDays(startOfWeek(now), -7), state.tasks, state.checkIns, OWNER_ID, now), `${label} last week perfect`);
  assert(perf.points >= 500, `${label} points ${perf.points}`);
  assert(dash.overdueCount === 2, `${label} overdue ${dash.overdueCount}`);
  assert(dash.punctualityStreak >= 14, `${label} punctuality ${dash.punctualityStreak}`);

  const helped = state.tasks.filter((task) => task.assigneeId === OWNER_ID && task.status === 'Done' && task.helpedMemberId).length;
  assert(helped >= 10, `${label} helped ${helped}`);

  for (const task of state.tasks) {
    if (task.completedAt) assert(new Date(task.completedAt).getTime() <= now.getTime(), `${label} future completion ${task.title}`);
    if (task.onTime === true && task.deadline && task.completedAt) {
      assert(new Date(task.completedAt).getTime() <= new Date(task.deadline).getTime(), `${label} onTime mismatch ${task.title}`);
    }
    if (task.onTime === false && task.deadline && task.completedAt) {
      assert(new Date(task.completedAt).getTime() > new Date(task.deadline).getTime(), `${label} late mismatch ${task.title}`);
    }
  }

  if (pastDaysThisWeek(now).length > 0) {
    assert(perf.topBusiness?.tag === 'essentials', `${label} top business ${perf.topBusiness?.tag} ${perf.topBusiness?.count}`);
    assert(perf.personalOnTimeRate === 100, `${label} personal on time ${perf.personalOnTimeRate}`);
    assert(perf.shoutouts[0]?.memberId === 'marketing-lead', `${label} shoutout ${perf.shoutouts[0]?.memberId}`);
  }

  if (day === 0) {
    console.log(label, {
      points: perf.points,
      level: perf.levelName,
      wake: perf.wakeStreak,
      gymWeek: dash.gymThisWeek,
      gymStreak: dash.gymStreakWeeks,
      punctuality: dash.punctualityStreak,
      completion: dash.weekCompletionRate,
      onTime: dash.weekOnTimeRate,
      dueToday: dash.dueTodayCount,
      appreciation: perf.appreciation,
      shoutouts: perf.shoutouts,
      helped,
      open: state.tasks.filter((task) => task.status !== 'Done').length,
      done: state.tasks.filter((task) => task.status === 'Done').length,
    });
  }
}

if (failures > 0) {
  console.error(`${failures} assertion(s) failed`);
  process.exit(1);
}
console.log('seed checks passed');
