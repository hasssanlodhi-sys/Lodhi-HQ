import { useEffect, useState, type ReactNode } from 'react';
import { CalendarDays, Inbox, LayoutDashboard, RotateCcw, Trophy, Users } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import type { Page } from '../types';
import { cx } from '../lib/utils';
import { Button, Modal } from './ui';

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
  const { reset, currentUser, banner, clearBanner } = useApp();
  const { signOut, changePassword } = useAuth();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
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
          <p className="mt-2 text-xs leading-5 text-stone-400">{currentUser.name}</p>
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
        <div className="space-y-2 px-4 pb-5">
          <p className="text-[11px] leading-4 text-stone-500">{currentUser.owner ? 'Owner' : 'Staff'} · shared board</p>
          <button type="button" onClick={() => setPasswordOpen(true)} className="block text-xs text-stone-400 hover:text-white">
            Change password
          </button>
          <button type="button" onClick={() => void signOut()} className="block text-xs text-stone-400 hover:text-white">
            Sign out
          </button>
          {currentUser.owner ? (
            <button
              type="button"
              onClick={() => {
                setResetError('');
                setConfirmReset(true);
              }}
              className="inline-flex items-center gap-2 text-xs text-stone-400 hover:text-white"
            >
              <RotateCcw size={14} />
              Reset sample data
            </button>
          ) : null}
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-paper/95 px-4 py-3 backdrop-blur md:hidden">
          <div>
            <div className="font-serif text-lg leading-none">
              Lodhi <span className="text-amber-600">HQ</span>
            </div>
            <div className="text-xs text-stone-500">{current.label}</div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setPasswordOpen(true)} className="text-xs font-medium text-stone-500">
              Password
            </button>
            <button type="button" onClick={() => void signOut()} className="text-xs font-medium text-stone-500">
              Sign out
            </button>
            {currentUser.owner ? (
              <button
                type="button"
                onClick={() => {
                  setResetError('');
                  setConfirmReset(true);
                }}
                className="text-xs font-medium text-stone-500"
              >
                Reset
              </button>
            ) : null}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl px-4 py-5 pb-24 md:px-8 md:py-8 md:pb-10">
          {banner ? (
            <div
              className={cx(
                'mb-4 flex items-start justify-between gap-3 rounded-xl border px-3 py-2 text-sm',
                banner.tone === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900',
              )}
            >
              <p>{banner.text}</p>
              <button type="button" className="shrink-0 text-xs font-medium underline" onClick={clearBanner}>
                Dismiss
              </button>
            </div>
          ) : null}
          {children}
        </main>
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

      {passwordOpen ? <PasswordDialog onClose={() => setPasswordOpen(false)} onSubmit={changePassword} /> : null}

      {confirmReset ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" className="absolute inset-0 bg-ink/40" aria-label="Cancel reset" onClick={() => setConfirmReset(false)} />
          <div className="card relative max-w-sm p-5">
            <h2 className="font-serif text-2xl">Reset sample data?</h2>
            <p className="mt-2 text-sm text-stone-600">
              This replaces tasks, check-ins, rewards, and staff accounts with a fresh sample for today. Your owner email and password stay. Staff added since setup are removed, and demo staff go back to the temporary password.
            </p>
            {resetError ? <p className="mt-3 text-sm text-red-700">{resetError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmReset(false)} disabled={resetting}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={resetting}
                onClick={() => {
                  setResetting(true);
                  setResetError('');
                  void reset()
                    .then(() => setConfirmReset(false))
                    .catch((err: unknown) => {
                      setResetError(err instanceof Error ? err.message : 'Could not reset.');
                    })
                    .finally(() => setResetting(false));
                }}
              >
                {resetting ? 'Resetting…' : 'Reset'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PasswordDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <Modal title="Change password" onClose={onClose}>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (next.length < 8) {
            setError('Use at least 8 characters.');
            return;
          }
          if (next !== confirm) {
            setError('The new passwords do not match.');
            return;
          }
          setBusy(true);
          setError('');
          void onSubmit(current, next)
            .then(onClose)
            .catch((err: unknown) => {
              setError(err instanceof Error ? err.message : 'Could not change the password.');
            })
            .finally(() => setBusy(false));
        }}
      >
        <label className="block">
          <span className="field-label">Current password</span>
          <input className="field" type="password" autoComplete="current-password" required value={current} onChange={(event) => setCurrent(event.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">New password</span>
          <input className="field" type="password" autoComplete="new-password" required minLength={8} value={next} onChange={(event) => setNext(event.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Confirm new password</span>
          <input className="field" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(event) => setConfirm(event.target.value)} />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
