import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  addDays,
  combine,
  endOfDay,
  formatDate,
  formatFullDate,
  formatHour,
  formatShortDate,
  formatTime,
  formatWeekday,
  parseDate,
  sameDay,
  startOfDay,
  startOfWeek,
} from '../lib/dates';
import { TAGS, TAG_LIST } from '../lib/tags';
import { DAY_END_HOUR, DAY_START_HOUR, HOUR_PX, OVERLOAD_MINUTES, type TagId, type Task } from '../types';
import { cx, formatHours, memberName, shortName } from '../lib/utils';
import { Button, PageHeader, TagPill } from '../components/ui';

type Scope = 'mine' | 'team';
type Mode = 'day' | 'week';

interface MoveDrag {
  kind: 'move';
  id: string;
  originY: number;
  originDeadline: string;
  deltaMin: number;
  moved: boolean;
}

interface PlaceDrag {
  kind: 'place';
  id: string;
  over: boolean;
  deadline: string | null;
  moved: boolean;
}

interface WeekDrag {
  kind: 'week';
  id: string;
  title: string;
  x: number;
  y: number;
  moved: boolean;
}

function tasksOnDay(tasks: Task[], day: Date): Task[] {
  return tasks.filter((task) => task.deadline && sameDay(new Date(task.deadline), day));
}

function clampMove(task: Task, deltaMin: number): number {
  if (!task.deadline) return 0;
  const end = new Date(task.deadline).getTime();
  const day = startOfDay(new Date(task.deadline));
  const earliest = combine(day, DAY_START_HOUR, 0).getTime() + task.estimatedTime * 60_000;
  const latest = combine(day, DAY_END_HOUR, 0).getTime();
  const next = Math.min(latest, Math.max(earliest, end + deltaMin * 60_000));
  return Math.round((next - end) / 60_000);
}

const MIN_BLOCK_PX = 36;

function layoutBlocks(tasks: Task[]) {
  const minMs = (MIN_BLOCK_PX / HOUR_PX) * 3_600_000;
  const items = tasks
    .filter((task) => task.deadline)
    .map((task) => {
      const end = new Date(task.deadline as string).getTime();
      const start = end - task.estimatedTime * 60_000;
      return { task, start, visualEnd: start + Math.max(task.estimatedTime * 60_000, minMs) };
    })
    .sort((a, b) => a.start - b.start || a.visualEnd - b.visualEnd);

  const clusters: (typeof items)[] = [];
  let current: typeof items = [];
  let clusterEnd = -Infinity;
  for (const item of items) {
    if (current.length === 0 || item.start < clusterEnd) {
      current.push(item);
      clusterEnd = Math.max(clusterEnd, item.visualEnd);
    } else {
      clusters.push(current);
      current = [item];
      clusterEnd = item.visualEnd;
    }
  }
  if (current.length) clusters.push(current);

  const blocks: { task: Task; start: number; lane: number; lanes: number }[] = [];
  for (const group of clusters) {
    const laneEnds: number[] = [];
    const placed: { item: (typeof group)[number]; lane: number }[] = [];
    for (const item of group) {
      let lane = laneEnds.findIndex((end) => end <= item.start);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.visualEnd);
      } else laneEnds[lane] = item.visualEnd;
      placed.push({ item, lane });
    }
    for (const { item, lane } of placed) blocks.push({ task: item.task, start: item.start, lane, lanes: laneEnds.length });
  }
  return blocks;
}

function blockRange(task: Task): string {
  if (!task.deadline) return '';
  const end = new Date(task.deadline);
  const start = new Date(end.getTime() - task.estimatedTime * 60_000);
  const samePeriod = start.getHours() < 12 === end.getHours() < 12;
  if (!samePeriod) return `${formatTime(start)}–${formatTime(end)}`;
  const startLabel = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/i, '');
  return `${startLabel}–${formatTime(end)}`;
}

export function CalendarPage() {
  const { state, now, openTask, openNewTask, reschedule, currentUser } = useApp();
  const [cursor, setCursor] = useState(() => startOfDay(new Date()));
  const [mode, setMode] = useState<Mode>('day');
  const [tag, setTag] = useState<TagId | 'all'>('all');
  const [scope, setScope] = useState<Scope>('team');
  const [showDone, setShowDone] = useState(true);
  const [drag, setDrag] = useState<MoveDrag | PlaceDrag | WeekDrag | null>(null);
  const columnRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () =>
      state.tasks.filter((task) => {
        if (tag !== 'all' && task.tag !== tag) return false;
        if (scope === 'mine' && task.assigneeId !== currentUser.id) return false;
        if (!showDone && task.status === 'Done') return false;
        return true;
      }),
    [state.tasks, tag, scope, showDone, currentUser.id],
  );

  const weekStart = startOfWeek(cursor);
  const heading = mode === 'day' ? formatFullDate(cursor) : `Week of ${formatShortDate(weekStart)}`;

  function shift(direction: number) {
    setCursor(addDays(cursor, mode === 'day' ? direction : direction * 7));
  }

  function deadlineFromPointer(clientY: number, estimate: number): string | null {
    const rect = columnRef.current?.getBoundingClientRect();
    if (!rect || clientY < rect.top || clientY > rect.bottom) return null;
    const y = clientY - rect.top;
    let startMin = DAY_START_HOUR * 60 + Math.round(((y / HOUR_PX) * 60) / 15) * 15;
    const latestStart = DAY_END_HOUR * 60 - Math.max(15, estimate);
    startMin = Math.min(Math.max(startMin, DAY_START_HOUR * 60), latestStart);
    const endMin = startMin + Math.max(15, estimate);
    return combine(cursor, Math.floor(endMin / 60), endMin % 60).toISOString();
  }

  function track(start: (event: PointerEvent) => void, finish: (event: PointerEvent) => void) {
    const move = (event: PointerEvent) => start(event);
    const up = (event: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      finish(event);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onMovePointerDown(event: ReactPointerEvent, task: Task) {
    if (!task.deadline || task.allDay || task.status === 'Done') {
      openTask(task);
      return;
    }
    event.preventDefault();
    const originY = event.clientY;
    const originDeadline = task.deadline;
    let deltaMin = 0;
    let moved = false;
    setDrag({ kind: 'move', id: task.id, originY, originDeadline, deltaMin: 0, moved: false });
    track(
      (pointer) => {
        const raw = Math.round((((pointer.clientY - originY) / HOUR_PX) * 60) / 15) * 15;
        deltaMin = clampMove(task, raw);
        moved = moved || Math.abs(pointer.clientY - originY) > 4;
        setDrag({ kind: 'move', id: task.id, originY, originDeadline, deltaMin, moved });
      },
      () => {
        if (!moved) openTask(task);
        else {
          const next = new Date(new Date(originDeadline).getTime() + deltaMin * 60_000);
          void reschedule(task.id, next.toISOString(), false).catch(() => undefined);
        }
      },
    );
  }

  function onPlacePointerDown(event: ReactPointerEvent, task: Task) {
    if (task.status === 'Done') return;
    event.preventDefault();
    let deadline: string | null = null;
    let moved = false;
    setDrag({ kind: 'place', id: task.id, over: false, deadline: null, moved: false });
    track(
      (pointer) => {
        moved = true;
        deadline = deadlineFromPointer(pointer.clientY, task.estimatedTime);
        setDrag({ kind: 'place', id: task.id, over: !!deadline, deadline, moved });
      },
      () => {
        if (deadline) void reschedule(task.id, deadline, false).catch(() => undefined);
      },
    );
  }

  function onWeekPointerDown(event: ReactPointerEvent, task: Task) {
    if (task.status === 'Done') {
      openTask(task);
      return;
    }
    event.preventDefault();
    const originX = event.clientX;
    const originY = event.clientY;
    let moved = false;
    setDrag({ kind: 'week', id: task.id, title: task.title, x: originX, y: originY, moved: false });
    track(
      (pointer) => {
        moved = moved || Math.hypot(pointer.clientX - originX, pointer.clientY - originY) > 4;
        setDrag({ kind: 'week', id: task.id, title: task.title, x: pointer.clientX, y: pointer.clientY, moved });
      },
      (pointer) => {
        const hit = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest('[data-drop-day]');
        const day = hit?.getAttribute('data-drop-day');
        if (moved && day) {
          const target = parseDate(day);
          if (task.allDay) void reschedule(task.id, endOfDay(target).toISOString(), true).catch(() => undefined);
          else if (!task.deadline) void reschedule(task.id, endOfDay(target).toISOString(), true).catch(() => undefined);
          else {
            const prev = new Date(task.deadline);
            void reschedule(task.id, combine(target, prev.getHours(), prev.getMinutes()).toISOString(), false).catch(() => undefined);
          }
        } else if (!moved) openTask(task);
      },
    );
  }

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={
          mode === 'day'
            ? 'Day runs 5 AM to 11 PM. A block ends at the deadline. Drag it to reschedule, or open it to edit.'
            : 'Monday to Sunday. Drag a task onto another day, or open it to change the time.'
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={() => shift(-1)} aria-label="Previous">
              <ChevronLeft size={16} />
            </Button>
            <Button variant="ghost" onClick={() => setCursor(startOfDay(new Date()))}>
              Today
            </Button>
            <Button variant="ghost" onClick={() => shift(1)} aria-label="Next">
              <ChevronRight size={16} />
            </Button>
            <Button
              onClick={() =>
                openNewTask({
                  deadline: combine(cursor, 9, 0).toISOString(),
                  tag: tag === 'all' ? 'personal' : tag,
                  assigneeId: currentUser.id,
                })
              }
            >
              Add task
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <h2 className="font-serif text-xl">{heading}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-line bg-white p-1">
            {(['day', 'week'] as const).map((item) => (
              <button key={item} type="button" onClick={() => setMode(item)} className={cx('rounded-lg px-3 py-1.5 text-sm capitalize', mode === item ? 'bg-ink text-white' : 'text-stone-500')}>
                {item}
              </button>
            ))}
          </div>
          <div className="flex rounded-xl border border-line bg-white p-1">
            <button type="button" onClick={() => setScope('mine')} className={cx('rounded-lg px-3 py-1.5 text-sm', scope === 'mine' ? 'bg-ink text-white' : 'text-stone-500')}>
              My tasks
            </button>
            <button type="button" onClick={() => setScope('team')} className={cx('rounded-lg px-3 py-1.5 text-sm', scope === 'team' ? 'bg-ink text-white' : 'text-stone-500')}>
              Whole team
            </button>
          </div>
          <select className="field w-auto" aria-label="Business" value={tag} onChange={(e) => setTag(e.target.value as TagId | 'all')}>
            <option value="all">All businesses</option>
            {TAG_LIST.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
            Show completed
          </label>
        </div>
      </div>

      {mode === 'day' ? (
        <DayBoard
          day={cursor}
          now={now}
          tasks={filtered}
          members={state.members}
          drag={drag}
          columnRef={columnRef}
          onOpen={openTask}
          onMovePointerDown={onMovePointerDown}
          onPlacePointerDown={onPlacePointerDown}
        />
      ) : (
        <WeekBoard
          start={weekStart}
          now={now}
          tasks={filtered}
          members={state.members}
          onWeekPointerDown={onWeekPointerDown}
        />
      )}

      {drag?.kind === 'week' && drag.moved ? (
        <div className="pointer-events-none fixed z-50 rounded-lg bg-ink px-2 py-1 text-xs text-white" style={{ left: drag.x + 8, top: drag.y + 8 }}>
          {drag.title}
        </div>
      ) : null}
    </div>
  );
}

function DayBoard({
  day,
  now,
  tasks,
  members,
  drag,
  columnRef,
  onOpen,
  onMovePointerDown,
  onPlacePointerDown,
}: {
  day: Date;
  now: Date;
  tasks: Task[];
  members: { id: string; name: string }[];
  drag: MoveDrag | PlaceDrag | WeekDrag | null;
  columnRef: RefObject<HTMLDivElement>;
  onOpen: (task: Task) => void;
  onMovePointerDown: (event: ReactPointerEvent, task: Task) => void;
  onPlacePointerDown: (event: ReactPointerEvent, task: Task) => void;
}) {
  const dayTasks = tasksOnDay(tasks, day).filter((task) => !task.allDay);
  const blocks = layoutBlocks(dayTasks);
  const unscheduled = tasks.filter(
    (task) => task.status !== 'Done' && (!task.deadline || (task.allDay && task.deadline && sameDay(new Date(task.deadline), day))),
  );
  const totalMinutes = tasksOnDay(tasks, day).reduce((sum, task) => sum + task.estimatedTime, 0);
  const hours = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }, (_, index) => DAY_START_HOUR + index);
  const showNow = sameDay(day, now);
  const nowMin = (now.getHours() - DAY_START_HOUR) * 60 + now.getMinutes();
  const placeTask = drag?.kind === 'place' ? tasks.find((task) => task.id === drag.id) : undefined;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 text-sm">
          <span>{tasksOnDay(tasks, day).length} tasks · {formatHours(totalMinutes)} planned</span>
          {totalMinutes > OVERLOAD_MINUTES ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Over 8h</span> : null}
        </div>
        <div className="grid grid-cols-[4.5rem_minmax(0,1fr)] pb-4">
          <div className="relative" style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute right-2 text-[11px] text-stone-400"
                style={{
                  top:
                    hour === DAY_END_HOUR
                      ? (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX - 14
                      : (hour - DAY_START_HOUR) * HOUR_PX - 6,
                }}
              >
                {formatHour(hour)}
              </div>
            ))}
          </div>
          <div ref={columnRef} className="relative border-b border-l border-line" style={{ height: (DAY_END_HOUR - DAY_START_HOUR) * HOUR_PX }}>
            {hours.slice(0, -1).map((hour) => (
              <div key={hour} className="absolute inset-x-0 border-t border-line/80" style={{ top: (hour - DAY_START_HOUR) * HOUR_PX }} />
            ))}
            {showNow && nowMin >= 0 && nowMin <= (DAY_END_HOUR - DAY_START_HOUR) * 60 ? (
              <div className="absolute inset-x-0 z-20 border-t-2 border-amber-500" style={{ top: (nowMin / 60) * HOUR_PX }}>
                <span className="absolute -top-2 left-1 rounded bg-amber-500 px-1 text-[10px] font-semibold text-ink">Now</span>
              </div>
            ) : null}
            {blocks.map((block) => {
              const meta = TAGS[block.task.tag];
              const dayStart = combine(day, DAY_START_HOUR, 0).getTime();
              const minutes = (block.start - dayStart) / 60_000;
              const top = Math.max(0, (minutes / 60) * HOUR_PX);
              const height = Math.max((block.task.estimatedTime / 60) * HOUR_PX, MIN_BLOCK_PX);
              const width = 100 / block.lanes;
              const moving = drag?.kind === 'move' && drag.id === block.task.id ? drag.deltaMin : 0;
              return (
                <button
                  key={block.task.id}
                  type="button"
                  onPointerDown={(event) => onMovePointerDown(event, block.task)}
                  className={cx(
                    'absolute z-10 overflow-hidden rounded-xl px-2 py-1 text-left shadow-sm',
                    block.task.status === 'Done' ? 'opacity-60' : 'cursor-grab active:cursor-grabbing',
                  )}
                  style={{
                    top,
                    height,
                    left: `calc(${block.lane * width}% + 4px)`,
                    width: `calc(${width}% - 8px)`,
                    background: meta.tint,
                    color: meta.text,
                    borderLeft: `3px solid ${meta.color}`,
                    transform: moving ? `translateY(${(moving / 60) * HOUR_PX}px)` : undefined,
                    touchAction: 'none',
                  }}
                >
                  <div className={cx('truncate text-xs font-semibold', block.task.status === 'Done' && 'line-through')}>{block.task.title}</div>
                  <div className="truncate text-[10px] opacity-80">
                    {blockRange(block.task)} · {shortName(memberName(members, block.task.assigneeId))}
                  </div>
                </button>
              );
            })}
            {drag?.kind === 'place' && drag.deadline && placeTask ? (
              <div
                className="pointer-events-none absolute z-10 rounded-xl border border-dashed px-2 py-1 text-xs font-semibold"
                style={{
                  top: Math.max(0, ((new Date(drag.deadline).getTime() - placeTask.estimatedTime * 60_000 - combine(day, DAY_START_HOUR, 0).getTime()) / 60_000 / 60) * HOUR_PX),
                  height: Math.max((placeTask.estimatedTime / 60) * HOUR_PX, MIN_BLOCK_PX),
                  left: 4,
                  right: 4,
                  background: TAGS[placeTask.tag].tint,
                  color: TAGS[placeTask.tag].text,
                }}
              >
                {placeTask.title}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <aside className="card p-3">
        <h3 className="font-medium">Unscheduled today</h3>
        <p className="mb-3 mt-1 text-xs text-stone-500">No hour yet. Drag one onto the timeline.</p>
        <div className="space-y-2">
          {unscheduled.length === 0 ? <p className="text-sm text-stone-500">Everything timed for this day is on the board.</p> : null}
          {unscheduled.map((task) => (
            <div key={task.id} className="rounded-xl border border-line p-2">
              <div className="flex items-start gap-2">
                <button
                  type="button"
                  aria-label={`Drag ${task.title}`}
                  onPointerDown={(event) => onPlacePointerDown(event, task)}
                  className="mt-0.5 cursor-grab rounded px-1 text-stone-400 active:cursor-grabbing"
                  style={{ touchAction: 'none' }}
                >
                  ⋮⋮
                </button>
                <button type="button" onClick={() => onOpen(task)} className="min-w-0 flex-1 text-left">
                  <div className="text-sm font-medium">{task.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <TagPill tag={task.tag} />
                    <span className="text-[11px] text-stone-500">{task.allDay ? 'All day' : 'No date'}</span>
                  </div>
                </button>
              </div>
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function WeekBoard({
  start,
  now,
  tasks,
  members,
  onWeekPointerDown,
}: {
  start: Date;
  now: Date;
  tasks: Task[];
  members: { id: string; name: string }[];
  onWeekPointerDown: (event: ReactPointerEvent, task: Task) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[840px] grid-cols-7 gap-2">
        {days.map((day) => {
          const items = tasksOnDay(tasks, day).sort((a, b) => Number(b.allDay) - Number(a.allDay) || new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime());
          const minutes = items.reduce((sum, task) => sum + task.estimatedTime, 0);
          const overload = minutes > OVERLOAD_MINUTES;
          const today = sameDay(day, now);
          return (
            <section
              key={formatDate(day)}
              data-drop-day={formatDate(day)}
              className={cx('min-h-[320px] rounded-2xl border bg-white p-2', overload ? 'border-amber-400' : 'border-line', today && 'ring-2 ring-amber-400/70')}
            >
              <div className="mb-2 flex items-start justify-between gap-1">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-stone-500">{formatWeekday(day)}</div>
                  <div className="font-serif text-xl leading-none">{day.getDate()}</div>
                </div>
                <div className="text-right text-[11px] text-stone-500">
                  <div>{items.length} tasks</div>
                  <div className={overload ? 'font-semibold text-amber-800' : ''}>{formatHours(minutes)}</div>
                </div>
              </div>
              {overload ? <div className="mb-2 rounded-lg bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900">Over 8h planned</div> : null}
              <div className="space-y-1">
                {items.map((task) => {
                  const meta = TAGS[task.tag];
                  return (
                    <button
                      key={task.id}
                      type="button"
                      onPointerDown={(event) => onWeekPointerDown(event, task)}
                      className={cx('block w-full rounded-lg px-2 py-1 text-left', task.status !== 'Done' && 'cursor-grab')}
                      style={{ background: meta.tint, color: meta.text, touchAction: 'none' }}
                    >
                      <div className={cx('line-clamp-2 text-xs font-semibold leading-snug', task.status === 'Done' && 'line-through opacity-70')}>{task.title}</div>
                      <div className="truncate text-[10px] opacity-75">
                        {task.allDay ? 'All day' : task.deadline ? formatTime(new Date(task.deadline)) : ''} · {shortName(memberName(members, task.assigneeId))}
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
