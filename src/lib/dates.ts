export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

export function addDaysKeepTime(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 0, 0);
}

export function combine(day: Date, hours: number, minutes = 0): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, 0, 0);
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function daysBetween(a: Date, b: Date): number {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / 86_400_000);
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isBeforeSix(hhmm: string): boolean {
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return false;
  return h < 6;
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function formatHour(h: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr} ${ampm}`;
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatWeekday(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export function formatFullDate(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

export function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function toDatetimeLocal(d: Date): string {
  return `${formatDate(d)}T${toTimeInput(d)}`;
}

export function fromDatetimeLocal(value: string): Date | null {
  if (!value) return null;
  const [date, time] = value.split('T');
  if (!date || !time) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function upcomingWeekday(now: Date, dow: number): Date {
  const today = startOfDay(now);
  const delta = (dow - today.getDay() + 7) % 7;
  return addDays(today, delta);
}

export function pastDaysThisWeek(now: Date): Date[] {
  const days: Date[] = [];
  const today = startOfDay(now);
  for (let d = startOfWeek(now); d < today; d = addDays(d, 1)) days.push(d);
  return days;
}

export function inRange(date: Date, start: Date, endExclusive: Date): boolean {
  const t = date.getTime();
  return t >= start.getTime() && t < endExclusive.getTime();
}

export function greeting(now: Date): string {
  const h = now.getHours();
  if (h < 6) return 'Early start';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
