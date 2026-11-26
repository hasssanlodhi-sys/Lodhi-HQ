import { useState, type ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui';

export function Splash({ subtitle, action }: { subtitle: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md text-center">
        <div className="font-serif text-4xl">
          Lodhi <span className="text-amber-600">HQ</span>
        </div>
        <p className="mt-4 text-sm leading-6 text-stone-600">{subtitle}</p>
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

export function SignInPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="font-serif text-4xl">
          Lodhi <span className="text-amber-600">HQ</span>
        </div>
        <p className="mt-2 text-sm text-stone-500">Sign in to the shared board.</p>
        <form
          className="card mt-6 space-y-3 p-5"
          onSubmit={(event) => {
            event.preventDefault();
            setError('');
            setBusy(true);
            void login(email.trim(), password)
              .catch((err: unknown) => {
                setError(err instanceof Error ? err.message : 'Could not sign in.');
              })
              .finally(() => setBusy(false));
          }}
        >
          <label className="block">
            <span className="field-label">Email</span>
            <input
              className="field"
              type="email"
              autoComplete="username"
              autoFocus
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block">
            <span className="field-label">Password</span>
            <input
              className="field"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-4 text-xs leading-5 text-stone-500">
          Forgot your password? The owner sets a new temporary one from the Team screen. Lodhi HQ does not send email.
        </p>
      </div>
    </div>
  );
}

export function ChangePasswordPage() {
  const { user, changePassword, signOut } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="font-serif text-4xl">
          Lodhi <span className="text-amber-600">HQ</span>
        </div>
        <h1 className="mt-6 font-serif text-3xl">Choose a new password</h1>
        <p className="mt-2 text-sm text-stone-500">
          {user?.name ? `${user.name}, this ` : 'This '}sign-in is still using a temporary password.
        </p>
        <form
          className="card mt-6 space-y-3 p-5"
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
            setError('');
            setBusy(true);
            void changePassword(current, next)
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
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? 'Saving…' : 'Update password'}
          </Button>
        </form>
        <button type="button" className="mt-4 text-sm text-stone-500 underline" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
