import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../context/AppContext';
import { addDays, startOfWeek } from '../lib/dates';
import { fetchCompletions, type CompletionRow } from '../lib/api';
import { performanceStats, type Shoutout } from '../lib/stats';
import { OWNER_ID, POINTS, type Reward } from '../types';
import { memberName, shortName, uid } from '../lib/utils';
import { Button, PageHeader } from '../components/ui';

export function PerformancePage() {
  const { state, now, saveReward, deleteReward, currentUser } = useApp();
  const stats = useMemo(() => performanceStats(state, now, currentUser.id), [state, now, currentUser.id]);
  const [remoteShoutouts, setRemoteShoutouts] = useState<Shoutout[] | null>(null);
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState(500);
  const remaining = stats.nextLevelMin == null ? 0 : Math.max(0, stats.nextLevelMin - stats.points);
  const canEditRewards = currentUser.owner;

  useEffect(() => {
    if (currentUser.owner) return;
    let cancelled = false;
    const weekStart = startOfWeek(now);
    const weekEnd = addDays(weekStart, 7);
    const lastStart = addDays(weekStart, -7);
    void Promise.all([
      fetchCompletions(weekStart.toISOString(), weekEnd.toISOString()),
      fetchCompletions(lastStart.toISOString(), weekStart.toISOString()),
    ])
      .then(([current, last]) => {
        if (cancelled) return;
        const next: Shoutout[] = [];
        const currentTop = topStaffRow(current);
        const lastTop = topStaffRow(last);
        if (currentTop) next.push({ weekLabel: 'This week', ...currentTop });
        if (lastTop) next.push({ weekLabel: 'Last week', ...lastTop });
        setRemoteShoutouts(next);
      })
      .catch(() => {
        if (!cancelled) setRemoteShoutouts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser.owner, now]);

  const shoutouts = currentUser.owner ? stats.shoutouts : remoteShoutouts;

  return (
    <div>
      <PageHeader title="Performance" subtitle="Points, levels, badges, and the week’s appreciation." />

      <section className="card overflow-hidden">
        <div className="bg-ink px-5 py-6 text-white">
          <div className="text-xs uppercase tracking-[0.16em] text-amber-300">{stats.levelName}</div>
          <div className="mt-2 font-serif text-5xl leading-none">{stats.points.toLocaleString()} pts</div>
          <p className="mt-3 max-w-xl text-sm text-stone-300">
            {stats.nextLevel
              ? `${remaining.toLocaleString()} points to ${stats.nextLevel}.`
              : 'Top level. Keep the streak anyway.'}
          </p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, Math.round(stats.levelProgress * 100))}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-stone-400">
            <span>{stats.levelName} · {stats.levelMin.toLocaleString()}</span>
            <span>{stats.nextLevel ? `${stats.nextLevel} · ${stats.nextLevelMin?.toLocaleString()}` : 'Machine'}</span>
          </div>
        </div>
      </section>

      <section className="card mt-4 bg-[#fff8ec] p-5">
        <div className="text-xs font-medium uppercase tracking-wide text-amber-800">This week</div>
        <p className="mt-2 font-serif text-2xl leading-snug text-ink">{stats.appreciation}</p>
      </section>

      <section className="mt-4 grid gap-3 md:grid-cols-2">
        {shoutouts === null ? (
          <div className="card p-4 text-sm text-stone-500 md:col-span-2">Loading shout-outs…</div>
        ) : shoutouts.length === 0 ? (
          <div className="card p-4 text-sm text-stone-500 md:col-span-2">No staff closures to shout out yet this week.</div>
        ) : (
          shoutouts.map((shout) => (
            <article key={shout.weekLabel} className="card p-4">
              <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{shout.weekLabel}</div>
              <h2 className="mt-1 font-serif text-2xl">Shout-out to {shortName(memberName(state.members, shout.memberId))}</h2>
              <p className="mt-2 text-sm text-stone-600">
                {shout.completed} task{shout.completed === 1 ? '' : 's'} closed
                {shout.onTimeRate == null ? '' : `, ${shout.onTimeRate}% on time`}. Top staff performer
                {shout.weekLabel === 'This week' ? ' so far.' : '.'}
              </p>
            </article>
          ))
        )}
      </section>

      <section className="mt-4">
        <h2 className="mb-2 font-serif text-2xl">Badges</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.badges.map((badge) => (
            <article key={badge.id} className={badge.earned ? 'card p-4' : 'card p-4 opacity-60'}>
              <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{badge.earned ? 'Earned' : 'Locked'}</div>
              <h3 className="mt-1 font-serif text-xl">{badge.name}</h3>
              <p className="mt-1 text-sm text-stone-600">{badge.detail}</p>
              <p className="mt-3 text-sm font-medium">{badge.progress}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="card mt-4 p-4">
        <h2 className="font-serif text-2xl">How the points add up</h2>
        <dl className="mt-3 divide-y divide-line text-sm">
          <Row label={`On-time tasks · ${POINTS.onTime} pts`} value={`${stats.onTimeCount} × ${POINTS.onTime} = ${(stats.onTimeCount * POINTS.onTime).toLocaleString()}`} />
          <Row label={`Late tasks · ${POINTS.late} pts`} value={`${stats.lateCount} × ${POINTS.late} = ${(stats.lateCount * POINTS.late).toLocaleString()}`} />
          <Row label={`Habits kept · ${POINTS.habit} pts`} value={`${stats.habits} × ${POINTS.habit} = ${(stats.habits * POINTS.habit).toLocaleString()}`} />
          <Row label={`Perfect weeks · ${POINTS.perfectWeek} pts`} value={`${stats.perfectWeeks} × ${POINTS.perfectWeek} = ${(stats.perfectWeeks * POINTS.perfectWeek).toLocaleString()}`} />
          <Row label="Total" value={stats.points.toLocaleString()} />
        </dl>
        <p className="mt-3 text-xs text-stone-500">
          A habit is an early wake-up, a gym session, or arriving on time. A perfect week is seven early wakes, on-time arrivals, at least five gym days, and nothing late.
          {canEditRewards ? '' : ' Habit points stay on the owner’s check-ins. Your points count the tasks you can see.'}
        </p>
      </section>

      <section className="card mt-4 p-4">
        <h2 className="font-serif text-2xl">Rewards</h2>
        <p className="mb-3 text-sm text-stone-500">
          {canEditRewards ? 'Edit the list. Claim is a note to yourself — points stay on the board.' : 'The owner edits this list. Claim is their note — points stay on the board.'}
        </p>
        <div className="space-y-2">
          {[...state.rewards]
            .sort((a, b) => a.points - b.points || a.title.localeCompare(b.title))
            .map((reward) => (
              <RewardRow
                key={reward.id}
                reward={reward}
                unlocked={stats.points >= reward.points}
                canEdit={canEditRewards}
                onSave={saveReward}
                onDelete={deleteReward}
              />
            ))}
        </div>
        {canEditRewards ? (
        <form
          className="mt-3 grid gap-2 rounded-xl border border-transparent p-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_6rem]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) return;
            void saveReward({ id: uid('reward'), title: title.trim(), points: Math.max(0, cost), claimed: false })
              .then(() => {
                setTitle('');
                setCost(500);
              })
              .catch(() => undefined);
          }}
        >
          <input className="field" placeholder="Weekend off at 1,000 pts" aria-label="New reward" value={title} onChange={(e) => setTitle(e.target.value)} />
          <input className="field" type="number" min={0} aria-label="Points" value={cost} onChange={(e) => setCost(Number(e.target.value))} />
          <Button type="submit" className="whitespace-nowrap sm:col-span-2">
            Add reward
          </Button>
        </form>
        ) : null}
      </section>
    </div>
  );
}

function topStaffRow(rows: CompletionRow[]): { memberId: string; completed: number; onTimeRate: number | null } | null {
  const ranked = rows
    .filter((row) => row.memberId !== OWNER_ID && row.completed > 0)
    .sort((a, b) => b.completed - a.completed || (b.onTimeRate ?? -1) - (a.onTimeRate ?? -1));
  return ranked[0] ?? null;
}

function RewardRow({
  reward,
  unlocked,
  canEdit,
  onSave,
  onDelete,
}: {
  reward: Reward;
  unlocked: boolean;
  canEdit: boolean;
  onSave: (reward: Reward) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [title, setTitle] = useState(reward.title);
  const [points, setPoints] = useState(reward.points);

  useEffect(() => {
    setTitle(reward.title);
    setPoints(reward.points);
  }, [reward.id, reward.title, reward.points]);

  if (!canEdit) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-sm">
        <span className="font-medium">{reward.title}</span>
        <span className="text-stone-500">{reward.points.toLocaleString()} pts</span>
        <span>{reward.claimed ? 'Claimed' : unlocked ? 'Unlocked' : 'Locked'}</span>
      </div>
    );
  }

  function commit(partial: Partial<Reward> = {}) {
    const next = {
      ...reward,
      title: title.trim() || reward.title,
      points: Math.max(0, Number.isFinite(points) ? points : 0),
      ...partial,
    };
    if (next.title === reward.title && next.points === reward.points && next.claimed === reward.claimed) return;
    void onSave(next).catch(() => undefined);
  }

  return (
    <div className="grid gap-2 rounded-xl border border-line p-2 sm:grid-cols-[minmax(0,1fr)_6.5rem_7.5rem_6rem] sm:items-center">
      <input className="field" aria-label="Reward title" value={title} onChange={(event) => setTitle(event.target.value)} onBlur={() => commit()} />
      <input
        className="field"
        aria-label="Reward points"
        type="number"
        min={0}
        value={points}
        onChange={(event) => setPoints(Math.max(0, Number(event.target.value) || 0))}
        onBlur={() => commit()}
      />
      <Button
        variant={reward.claimed ? 'soft' : 'ghost'}
        className="whitespace-nowrap"
        disabled={!unlocked && !reward.claimed}
        onClick={() => commit({ claimed: !reward.claimed })}
      >
        {reward.claimed ? 'Claimed' : unlocked ? 'Claim' : 'Locked'}
      </Button>
      <Button variant="ghost" className="whitespace-nowrap" onClick={() => void onDelete(reward.id).catch(() => undefined)} aria-label={`Delete ${reward.title}`}>
        Delete
      </Button>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-stone-600">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
