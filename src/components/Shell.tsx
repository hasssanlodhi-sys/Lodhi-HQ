import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, Inbox, LayoutDashboard, RotateCcw, Trophy, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import type { Page } from '../types';
import { cx } from '../lib/utils';
import { Button } from './ui';

const NAV: { id: Page; label: string; icon: typeof Inbox }[] = [
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'performance', label: 'Performance', icon: Trophy },
  { id: 'team', label: 'Team', icon: Users },
];

export function Shell({
  page,
  navigate,
  children,
}: {
  page: Page;
  navigate: (page: Page) => void;
  children: ReactNode;
}) {
  const { reset } = useApp();
  const [confirmReset, setConfirmReset] = useState(false);
  const current = NAV.find((item) => item.id === page) ?? NAV[0];

  useEffect(() => {
    document.title = `${current.label} · Lodhi HQ`;
    window.scrollTo(0, 0);
  }, [current.label]);

  return (
    <div className="min-h-screen md:flex">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-ink text-stone-200 md:flex">
        <div className="px-5 pb-4 pt-6">
          <div className="font-serif text-[1.7rem] leading-none text-white">
            Lodhi <span className="text-amber-400">HQ</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-stone-400">Muhammad Hassan Lodhi</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.id === page;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={cx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm',
                  active ? 'bg-white/10 text-white' : 'text-stone-400 hover:bg-white/5 hover:text-white',
                )}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="px-4 pb-5">
          <p className="mb-2 text-[11px] leading-4 text-stone-500">Data stays in this browser.</p>
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="inline-flex items-center gap-2 text-xs text-stone-400 hover:text-white"
          >
            <RotateCcw size={14} />
            Reset sample data
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-paper/95 px-4 py-3 backdrop-blur md:hidden">
          <div>
            <div className="font-serif text-lg leading-none">
              Lodhi <span className="text-amber-600">HQ</span>
            </div>
            <div className="text-xs text-stone-500">{current.label}</div>
          </div>
          <button type="button" onClick={() => setConfirmReset(true)} className="text-xs font-medium text-stone-500">
            Reset
          </button>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur md:hidden">
        <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = item.id === page;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                className={cx('flex flex-col items-center gap-1 py-2 text-[10px] font-medium', active ? 'text-ink' : 'text-stone-400')}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </div>
      </nav>

      {confirmReset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Cancel reset" onClick={() => setConfirmReset(false)} />
          <div className="card relative max-w-sm p-5">
            <h2 className="font-serif text-2xl">Reset sample data?</h2>
            <p className="mt-2 text-sm text-stone-600">
              This replaces tasks, check-ins, team edits, and rewards with a fresh sample built for today. Anything you added in this browser goes away.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmReset(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  reset();
                  setConfirmReset(false);
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
