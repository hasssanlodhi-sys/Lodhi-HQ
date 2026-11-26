import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlarmClock, Dumbbell, Sun } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { RouteState } from '../lib/router';
import { addDays, formatDate, formatFullDate, formatShortDate, greeting, parseDate, startOfDay } from '../lib/dates';
import { fetchCompletions, type CompletionRow } from '../lib/api';
import { dashboardStats } from '../lib/stats';
import { TAGS } from '../lib/tags';
import type { Mood } from '../types';
import { cx, memberName, shortName } from '../lib/utils';
import { Button, PageHeader } from '../components/ui';

export function DashboardPage({ route }: { route: RouteState }) {
  const { state, now, saveCheckIn, currentUser } = useApp();
  const stats = useMemo(() => dashboardStats(state, now, currentUser.id), [state, now, currentUser.id]);
  const me = state.members.find((member) => member.id === currentUser.id);
  const first = shortName(me?.name || currentUser.name);
  const [remoteBoard, setRemoteBoard] = useState<CompletionRow[] | null>(null);
  const [date, setDate] = useState(() => formatDate(now));
  const existing = state.checkIns.find((item) => item.date === date);
  const [woke, setWoke] = useState(existing?.wokeUpAt ?? '05:30');
  const [gym, setGym] = useState(existing?.gymDone ?? false);
  const [arrived, setArrived] = useState(existing?.arrivedOnTime ?? false);
  const [mood, setMood] = useState<Mood>(existing?.mood ?? 4);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const found = state.checkIns.find((item) => item.date === date);
    setWoke(found?.wokeUpAt ?? '05:30');
    setGym(found?.gymDone ?? false);
    setArrived(found?.arrivedOnTime ?? false);
    setMood(found?.mood ?? 4);
  }, [date, state.checkIns]);

  const recent = [...state.checkIns].sort((a, b) => a.date.localeCompare(b.date)).slice(-14);

  useEffect(() => {
    if (currentUser.owner) return;
    let cancelled = false;
    const today = startOfDay(now);
    void fetchCompletions(addDays(today, -29).toISOString(), addDays(today, 1).toISOString())
      .then((rows) => {
        if (!cancelled) setRemoteBoard(rows);
      })
      .catch(() => {
        if (!cancelled) setRemoteBoard([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser.owner, now]);

  const leaderboard = currentUser.owner ? stats.leaderboard : remoteBoard;

  return (
    <div>
      <PageHeader
        title={`${greeting(now)}, ${first}`}
        subtitle={formatFullDate(now)}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Weekly completion"
          value={stats.weekCompletionRate == null ? '—' : `${stats.weekCompletionRate}%`}
          detail={stats.weekCompletionTotal ? `${stats.weekCompletionDone} of ${stats.weekCompletionTotal} due by now` : 'Nothing due yet this week'}
        />
        <StatCard
          label="On time"
          value={stats.weekOnTimeRate == null ? '—' : `${stats.weekOnTimeRate}%`}
          detail={stats.weekOnTimeTotal ? `${stats.weekOnTimeHit} of ${stats.weekOnTimeTotal} closed this week` : 'No tasks closed this week'}
        />
        <StatCard
          label="Overdue now"
          value={String(stats.overdueCount)}
          detail="Past deadline and still open"
          onClick={() => route.navigate('inbox', { due: 'overdue', status: 'open' })}
        />
        <StatCard
          label="Due today"
          value={String(stats.dueTodayCount)}
          detail="Still open, dated today"
          onClick={() => route.navigate('inbox', { due: 'today', status: 'open' })}
        />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <StreakCard icon={<Sun size={18} />} label="Wake-up" value={`${stats.wakeStreak} days`} detail="Target: up before 6:00 AM" />
        <StreakCard icon={<Dumbbell size={18} />} label="Gym" value={`${stats.gymThisWeek}/${stats.gymTarget} this week`} detail={`${stats.gymStreakWeeks}-week streak at the target`} />
        <StreakCard icon={<AlarmClock size={18} />} label="Punctuality" value={`${stats.punctualityStreak} days`} detail={`No late tasks for ${first}`} />
      </div>

      {currentUser.owner ? (
      <form
        className="card mt-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!woke) return;
          void (async () => {
          try {
            await saveCheckIn({
              id: existing?.id ?? `check_${date}`,
              date,
              wokeUpAt: woke,
              gymDone: gym,
              arrivedOnTime: arrived,
              mood,
            });
            setSaved(true);
          } catch {
            setSaved(false);
          }
          })();
        }}
      >
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-serif text-2xl">Daily check-in</h2>
            <p className="text-sm text-stone-500">Wake-up, gym, and whether you arrived on time. One entry per date.</p>
          </div>
          {saved ? <span className="text-sm text-emerald-700">Saved</span> : null}
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label>
            <span className="field-label">Date</span>
            <input className="field" type="date" value={date} onChange={(e) => { setDate(e.target.value); setSaved(false); }} required />
          </label>
          <label>
            <span className="field-label">Woke up</span>
            <input className="field" type="time" value={woke} onChange={(e) => { setWoke(e.target.value); setSaved(false); }} required />
          </label>
          <label className="flex items-center gap-2 pt-5 text-sm">
            <input type="checkbox" checked={gym} onChange={(e) => { setGym(e.target.checked); setSaved(false); }} />
            Gym done
          </label>
          <label className="flex items-center gap-2 pt-5 text-sm">
            <input type="checkbox" checked={arrived} onChange={(e) => { setArrived(e.target.checked); setSaved(false); }} />
            Arrived on time
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-stone-500">Mood</span>
          {([1, 2, 3, 4, 5] as Mood[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => { setMood(value); setSaved(false); }}
              className={cx('h-9 w-9 rounded-full border text-sm', mood === value ? 'border-ink bg-ink text-white' : 'border-line bg-white')}
              aria-label={`Mood ${value}`}
            >
              {value}
            </button>
          ))}
          <Button type="submit" className="ml-auto">
            {existing ? 'Update check-in' : 'Save check-in'}
          </Button>
        </div>
        <div className="mt-4 flex gap-1 overflow-x-auto">
          {recent.map((item) => (
            <button
              key={item.date}
              type="button"
              onClick={() => setDate(item.date)}
              className={cx('rounded-lg px-2 py-1 text-left text-[11px]', item.date === date ? 'bg-ink text-white' : 'bg-stone-100 text-stone-600')}
              title={`${item.date} mood ${item.mood}`}
            >
              <div>{formatShortDate(parseDate(item.date))}</div>
              <div>Mood {item.mood}</div>
            </button>
          ))}
        </div>
      </form>
      ) : (
        <section className="card mt-4 p-4">
          <h2 className="font-serif text-2xl">Daily check-in</h2>
          <p className="text-sm text-stone-500">Wake-up, gym, and arrival stay with the owner. The streaks above read that log.</p>
        </section>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="font-serif text-2xl">Completion by business</h2>
          <p className="mb-3 text-sm text-stone-500">Tasks closed in the last 30 days.</p>
          <BusinessBars rows={stats.completionByTag} />
        </section>
        <section className="card p-4">
          <h2 className="font-serif text-2xl">On-time trend</h2>
          <p className="mb-3 text-sm text-stone-500">Share of tasks closed on time, each of the last 30 days.</p>
          <OnTimeChart points={stats.onTimeTrend} />
        </section>
      </div>

      <section className="card mt-4 p-4">
        <h2 className="font-serif text-2xl">Team leaderboard</h2>
        <p className="mb-2 text-sm text-stone-500">Closed tasks and on-time rate over the last 30 days.</p>
        <div className="divide-y divide-line">
          {leaderboard === null ? <p className="py-3 text-sm text-stone-500">Loading team totals…</p> : null}
          {(leaderboard ?? []).map((row) => {
            const member = state.members.find((item) => item.id === row.memberId);
            return (
              <div key={row.memberId} className="grid grid-cols-[1fr_auto] items-center gap-3 py-3">
                <div>
                  <div className="font-medium">
                    {member ? memberName(state.members, row.memberId) : 'Unknown'}
                    {row.memberId === currentUser.id ? <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">You</span> : null}
                  </div>
                  <div className="text-xs text-stone-500">{member?.role}</div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${row.onTimeRate ?? 0}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-serif text-2xl leading-none">{row.completed}</div>
                  <div className="text-xs text-stone-500">{row.onTimeRate == null ? 'No closes' : `${row.onTimeRate}% on time`}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, detail, onClick }: { label: string; value: string; detail: string; onClick?: () => void }) {
  const className = 'card p-4 text-left w-full';
  const body = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className="mt-2 font-serif text-4xl leading-none">{value}</div>
      <div className="mt-2 text-sm text-stone-500">{detail}</div>
    </>
  );
  if (!onClick) return <div className={className}>{body}</div>;
  return (
    <button type="button" onClick={onClick} className={cx(className, 'hover:border-stone-400')}>
      {body}
    </button>
  );
}

function StreakCard({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail: string }) {
  return (
    <div className="card flex gap-3 p-4">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-900">{icon}</div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
        <div className="font-serif text-2xl leading-tight">{value}</div>
        <div className="text-sm text-stone-500">{detail}</div>
      </div>
    </div>
  );
}

function BusinessBars({ rows }: { rows: { tag: keyof typeof TAGS; count: number }[] }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <div className="flex h-56 items-end gap-2">
      {rows.map((row) => (
        <div key={row.tag} className="flex h-full min-w-0 flex-1 flex-col justify-end">
          <div className="mb-1 text-center text-xs font-medium">{row.count}</div>
          <div
            className="w-full rounded-t-lg"
            style={{
              height: `calc((100% - 3.25rem) * ${row.count / max})`,
              background: TAGS[row.tag].color,
              minHeight: row.count ? 4 : 0,
            }}
          />
          <div className="mt-2 h-8 text-center text-[10px] leading-tight text-stone-500">{TAGS[row.tag].short}</div>
        </div>
      ))}
    </div>
  );
}

function OnTimeChart({ points }: { points: { date: string; rate: number | null }[] }) {
  const width = 640;
  const height = 200;
  const padL = 32;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const coords = points.map((point, index) => {
    if (point.rate == null) return null;
    const x = padL + (index / Math.max(points.length - 1, 1)) * (width - padL - padR);
    const y = padT + (1 - point.rate / 100) * (height - padT - padB);
    return { x, y };
  });
  let path = '';
  let drawing = false;
  for (const point of coords) {
    if (!point) {
      drawing = false;
      continue;
    }
    path += `${drawing ? 'L' : 'M'}${point.x.toFixed(1)},${point.y.toFixed(1)} `;
    drawing = true;
  }
  const ticks = [0, 14, 29].filter((index) => index < points.length);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label="On-time percentage for the last 30 days">
      {[0, 50, 100].map((value) => {
        const y = padT + (1 - value / 100) * (height - padT - padB);
        return (
          <g key={value}>
            <line x1={padL} x2={width - padR} y1={y} y2={y} stroke="#e7e5e4" />
            <text x={0} y={y + 4} fontSize="11" fill="#78716c">
              {value}
            </text>
          </g>
        );
      })}
      <path d={path} fill="none" stroke="#1c1917" strokeWidth="2" />
      {coords.map((point, index) =>
        point ? <circle key={points[index].date} cx={point.x} cy={point.y} r="2.5" fill="#d97706" /> : null,
      )}
      {ticks.map((index) => {
        const x = padL + (index / Math.max(points.length - 1, 1)) * (width - padL - padR);
        const anchor = index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle';
        return (
          <text key={points[index].date} x={x} y={height - 6} fontSize="11" textAnchor={anchor} fill="#78716c">
            {formatShortDate(parseDate(points[index].date))}
          </text>
        );
      })}
    </svg>
  );
}
