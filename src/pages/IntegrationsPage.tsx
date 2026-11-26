import { useCallback, useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import {
  discoverIntegration,
  loadIntegrations,
  loadMigrations,
  runMigrations,
  saveIntegration,
  syncNow,
  type IntegrationRecord,
  type IntegrationsPayload,
  type MigrationStatus,
} from '../lib/api';
import { TAG_LIST } from '../lib/tags';
import type { TagId } from '../types';
import { Button, PageHeader } from '../components/ui';

const POS_FIELDS: { key: string; label: string }[] = [
  { key: 'id', label: 'Id' },
  { key: 'title', label: 'Title' },
  { key: 'notes', label: 'Notes' },
  { key: 'due', label: 'Due' },
  { key: 'status', label: 'Status' },
  { key: 'completed', label: 'Completed' },
  { key: 'assignee', label: 'Assignee' },
  { key: 'priority', label: 'Priority' },
];

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function SyncMeta({ row }: { row: IntegrationRecord | null }) {
  if (!row) return <p className="text-sm text-stone-500">Not saved yet.</p>;
  return (
    <div className="mt-3 space-y-1 text-sm">
      <p className="text-stone-500">Last sync: {row.lastSyncAt ? new Date(row.lastSyncAt).toLocaleString() : 'never'}</p>
      {row.lastSummary ? <p className="text-stone-600">{row.lastSummary}</p> : null}
      {row.lastError ? <p className="text-red-700">{row.lastError}</p> : null}
      {row.configured ? <p className="text-xs text-stone-400">Credential saved on the server. It is not sent back to this browser.</p> : null}
    </div>
  );
}

function TagSelect({ value, onChange }: { value: string; onChange: (tag: TagId) => void }) {
  return (
    <select className="field" value={value} onChange={(event) => onChange(event.target.value as TagId)}>
      {TAG_LIST.map((tag) => (
        <option key={tag.id} value={tag.id}>
          {tag.short}
        </option>
      ))}
    </select>
  );
}

export function IntegrationsPage() {
  const { currentUser, reload } = useApp();
  const [payload, setPayload] = useState<IntegrationsPayload | null>(null);
  const [migrations, setMigrations] = useState<MigrationStatus | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const next = await loadIntegrations();
    setPayload(next);
    if (next.owner) setMigrations(await loadMigrations());
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await refresh();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load integrations.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  async function sync(provider?: string) {
    setSyncing(true);
    setError('');
    setNotice('');
    try {
      const result = await syncNow(provider);
      if (result.skipped) {
        setNotice('A sync is already running.');
        return;
      }
      const problems = Object.entries(result.results ?? {})
        .filter(([, item]) => item && item.ok === false)
        .map(([name, item]) => `${name}: ${item.error || 'failed'}`);
      if (problems.length) setError(problems.join(' '));
      else setNotice('Sync finished.');
      await reload();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed.');
    } finally {
      setSyncing(false);
    }
  }

  const mine = (provider: IntegrationRecord['provider']) =>
    payload?.integrations.find((item) => item.provider === provider && item.userId === payload.viewerId) ?? null;
  const others = (provider: IntegrationRecord['provider']) =>
    payload?.integrations.filter((item) => item.provider === provider && item.userId !== payload.viewerId) ?? [];

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Credentials stay on the server. Sync now and the 15-minute cron job use the same engine."
        actions={
          currentUser.owner ? (
            <Button onClick={() => void sync()} disabled={syncing || payload?.needsMigration}>
              {syncing ? 'Syncing…' : 'Sync now'}
            </Button>
          ) : null
        }
      />
      {error ? <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {notice ? <p className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{notice}</p> : null}
      {!payload ? <p className="text-sm text-stone-500">Loading…</p> : null}

      {payload && currentUser.owner ? (
        <section className="card mb-4 p-4">
          <h2 className="font-serif text-2xl">Database migrations</h2>
          <p className="mt-1 text-sm text-stone-500">
            The installer will not run again. This applies <span className="font-medium">api/migrations/001_integrations.sql</span>.
          </p>
          {migrations ? (
            <p className="mt-2 text-sm text-stone-600">
              {migrations.pending.length ? `Pending: ${migrations.pending.join(', ')}` : 'Up to date.'}
              {migrations.applied.length ? ` Applied: ${migrations.applied.join(', ')}.` : ''}
            </p>
          ) : null}
          <div className="mt-3">
            <Button
              variant="ghost"
              disabled={!migrations || migrations.pending.length === 0}
              onClick={() => {
                setError('');
                void runMigrations()
                  .then(async (result) => {
                    setMigrations(result.status);
                    setNotice(result.appliedNow.length ? `Applied ${result.appliedNow.join(', ')}.` : 'Migrations are up to date.');
                    await refresh();
                  })
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not run migrations.'));
              }}
            >
              Run migrations
            </Button>
          </div>
        </section>
      ) : null}

      {payload?.needsMigration ? (
        <p className="mb-4 text-sm text-amber-900">Save and sync stay off until the integrations table exists.</p>
      ) : null}

      {payload && currentUser.owner ? (
        <ClickUpCard
          row={mine('clickup')}
          locked={payload.needsMigration}
          onSaved={refresh}
          onSync={() => sync('clickup')}
          syncing={syncing}
        />
      ) : null}
      {payload ? (
        <CalendarCard
          row={mine('gcal')}
          others={currentUser.owner ? others('gcal') : []}
          locked={payload.needsMigration}
          onSaved={refresh}
        />
      ) : null}
      {payload && currentUser.owner ? (
        <PosCard row={mine('pos')} locked={payload.needsMigration} onSaved={refresh} onSync={() => sync('pos')} syncing={syncing} />
      ) : null}
      {payload ? (
        <RemindersCard
          row={mine('reminders')}
          others={currentUser.owner ? others('reminders') : []}
          locked={payload.needsMigration}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

function ClickUpCard({
  row,
  locked,
  onSaved,
  onSync,
  syncing,
}: {
  row: IntegrationRecord | null;
  locked: boolean;
  onSaved: () => Promise<void>;
  onSync: () => void;
  syncing: boolean;
}) {
  const settings = record(row?.settings);
  const initialMap = Array.isArray(settings.tagMap) ? settings.tagMap.map(record) : [];
  const [token, setToken] = useState('');
  const [enabled, setEnabled] = useState(row?.enabled ?? false);
  const [teamId, setTeamId] = useState(text(settings.teamId));
  const [spaceIds, setSpaceIds] = useState<string[]>(Array.isArray(settings.spaceIds) ? settings.spaceIds.filter((id): id is string => typeof id === 'string') : []);
  const [defaultTag, setDefaultTag] = useState<TagId>((text(settings.defaultTag) || 'cell-phone') as TagId);
  const [tagMap, setTagMap] = useState<{ match: string; tag: TagId }[]>(
    initialMap.length
      ? initialMap.map((item) => ({ match: text(item.match), tag: (text(item.tag) || 'cell-phone') as TagId }))
      : [{ match: 'The Cellphone Store', tag: 'cell-phone' }],
  );
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function save() {
    setBusy(true);
    setMessage('');
    try {
      await saveIntegration('clickup', {
        enabled,
        settings: { teamId, spaceIds, defaultTag, tagMap },
        secrets: token.trim() ? { token: token.trim() } : {},
      });
      setToken('');
      setMessage('Saved.');
      await onSaved();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  }

  async function loadTeams() {
    setBusy(true);
    setMessage('');
    try {
      const data = await discoverIntegration('clickup');
      const list = Array.isArray(data.teams) ? data.teams.map(record) : [];
      setTeams(list.map((item) => ({ id: text(item.id), name: text(item.name) })).filter((item) => item.id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load workspaces.');
    } finally {
      setBusy(false);
    }
  }

  async function loadSpaces(nextTeam = teamId) {
    if (!nextTeam) return;
    setBusy(true);
    setMessage('');
    try {
      const data = await discoverIntegration('clickup', { teamId: nextTeam });
      const list = Array.isArray(data.spaces) ? data.spaces.map(record) : [];
      setSpaces(list.map((item) => ({ id: text(item.id), name: text(item.name) })).filter((item) => item.id));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not load spaces.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card mb-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">ClickUp</h2>
          <p className="mt-1 text-sm text-stone-500">
            Personal token from ClickUp → avatar → Settings → Apps → API Token. It starts with pk_. Open tasks in the spaces you pick are pulled for anyone, and matched to a Lodhi HQ user by email. Completing one here closes it in ClickUp.
          </p>
        </div>
        <Button variant="ghost" disabled={locked || syncing || !row?.enabled} onClick={onSync}>
          Sync this
        </Button>
      </div>
      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="field-label">API token</span>
          <input className="field" type="password" autoComplete="off" placeholder={row?.configured ? 'Saved — leave blank to keep' : 'pk_…'} value={token} onChange={(event) => setToken(event.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Include in Sync now and the cron job
        </label>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" disabled={locked || busy} onClick={() => void loadTeams()}>
            Load workspaces
          </Button>
          {teams.length ? (
            <select
              className="field max-w-xs"
              value={teamId}
              onChange={(event) => {
                setTeamId(event.target.value);
                setSpaces([]);
              }}
            >
              <option value="">Choose a workspace</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          ) : null}
          <Button variant="ghost" disabled={locked || busy || !teamId} onClick={() => void loadSpaces()}>
            Load spaces
          </Button>
        </div>
        {teamId && !teams.length ? <p className="text-xs text-stone-500">Saved workspace id: {teamId}</p> : null}
        {spaces.length ? (
          <div className="space-y-1">
            {spaces.map((space) => (
              <label key={space.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={spaceIds.includes(space.id)}
                  onChange={(event) => {
                    setSpaceIds((current) => (event.target.checked ? [...current, space.id] : current.filter((id) => id !== space.id)));
                  }}
                />
                {space.name}
              </label>
            ))}
          </div>
        ) : null}
        <div>
          <span className="field-label">Default tag</span>
          <TagSelect value={defaultTag} onChange={setDefaultTag} />
        </div>
        <div className="space-y-2">
          <span className="field-label">Space or list name → tag</span>
          {tagMap.map((item, index) => (
            <div key={`${item.match}-${index}`} className="flex flex-wrap gap-2">
              <input
                className="field max-w-xs"
                value={item.match}
                placeholder="The Cellphone Store"
                onChange={(event) => {
                  const next = [...tagMap];
                  next[index] = { ...item, match: event.target.value };
                  setTagMap(next);
                }}
              />
              <div className="w-40">
                <TagSelect
                  value={item.tag}
                  onChange={(tag) => {
                    const next = [...tagMap];
                    next[index] = { ...item, tag };
                    setTagMap(next);
                  }}
                />
              </div>
              <Button variant="ghost" onClick={() => setTagMap(tagMap.filter((_, itemIndex) => itemIndex !== index))}>
                Remove
              </Button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => setTagMap([...tagMap, { match: '', tag: 'cell-phone' }])}>
            Add mapping
          </Button>
        </div>
        {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        <div>
          <Button disabled={locked || busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save ClickUp'}
          </Button>
        </div>
      </div>
      <SyncMeta row={row} />
    </section>
  );
}

function CalendarCard({
  row,
  others,
  locked,
  onSaved,
}: {
  row: IntegrationRecord | null;
  others: IntegrationRecord[];
  locked: boolean;
  onSaved: () => Promise<void>;
}) {
  const settings = record(row?.settings);
  const [url, setUrl] = useState('');
  const [enabled, setEnabled] = useState(row?.enabled ?? false);
  const [tag, setTag] = useState<TagId>((text(settings.tag) || 'personal') as TagId);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  return (
    <section className="card mb-4 p-4">
      <h2 className="font-serif text-2xl">Google Calendar</h2>
      <p className="mt-1 text-sm text-stone-500">
        Google Calendar on the web → Settings → your calendar → Integrate calendar → Secret address in iCal format. Paste that URL. It is read-only. Events from the past week through the next 60 days are imported. A daily repeating event stays one task.
      </p>
      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="field-label">Secret iCal address</span>
          <input className="field" type="password" autoComplete="off" placeholder={row?.configured ? 'Saved — leave blank to keep' : 'https://calendar.google.com/calendar/ical/…/basic.ics'} value={url} onChange={(event) => setUrl(event.target.value)} />
        </label>
        <div>
          <span className="field-label">Tag</span>
          <TagSelect value={tag} onChange={setTag} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Include this calendar in sync
        </label>
        {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        <div>
          <Button
            disabled={locked || busy}
            onClick={() => {
              setBusy(true);
              setMessage('');
              void saveIntegration('gcal', { enabled, settings: { tag }, secrets: url.trim() ? { url: url.trim() } : {} })
                .then(async () => {
                  setUrl('');
                  setMessage('Saved.');
                  await onSaved();
                })
                .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not save.'))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Saving…' : 'Save calendar'}
          </Button>
        </div>
      </div>
      <SyncMeta row={row} />
      {others.length ? (
        <ul className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
          {others.map((item) => (
            <li key={item.id}>
              <span className="font-medium">{item.userName || item.userId}</span>
              <span className="text-stone-500"> · {item.enabled ? 'on' : 'off'} · {item.configured ? 'connected' : 'no address'}</span>
              {item.lastError ? <span className="block text-red-700">{item.lastError}</span> : null}
              {item.lastSummary ? <span className="block text-stone-500">{item.lastSummary}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function PosCard({
  row,
  locked,
  onSaved,
  onSync,
  syncing,
}: {
  row: IntegrationRecord | null;
  locked: boolean;
  onSaved: () => Promise<void>;
  onSync: () => void;
  syncing: boolean;
}) {
  const settings = record(row?.settings);
  const tables = record(settings.tables);
  const [url, setUrl] = useState(text(settings.url));
  const [apiKey, setApiKey] = useState('');
  const [enabled, setEnabled] = useState(row?.enabled ?? false);
  const [includeRefurb, setIncludeRefurb] = useState(settings.includeRefurb === true);
  const [doneStatus, setDoneStatus] = useState(text(settings.doneStatus) || 'done');
  const [columns, setColumns] = useState<Record<string, string>>(columnState(record(tables.tasks)));
  const [refurbColumns, setRefurbColumns] = useState<Record<string, string>>(columnState(record(tables.refurb_tasks)));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  function columnState(source: Record<string, unknown>): Record<string, string> {
    const next: Record<string, string> = {};
    for (const field of POS_FIELDS) next[field.key] = text(source[field.key]);
    return next;
  }

  return (
    <section className="card mb-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-serif text-2xl">Cellphone Store POS</h2>
          <p className="mt-1 text-sm text-stone-500">
            Supabase → Project Settings → API. Use the project URL and the service role key when row security would hide tasks from the anon key. Rows become tasks tagged cell-phone. Completing one here updates the store when a completed or status column is mapped.
          </p>
        </div>
        <Button variant="ghost" disabled={locked || syncing || !row?.enabled} onClick={onSync}>
          Sync this
        </Button>
      </div>
      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="field-label">Project URL</span>
          <input className="field" value={url} placeholder="https://your-project.supabase.co" onChange={(event) => setUrl(event.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">API key</span>
          <input className="field" type="password" autoComplete="off" placeholder={row?.configured ? 'Saved — leave blank to keep' : 'service role or anon key'} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">Status value that means done</span>
          <input className="field max-w-xs" value={doneStatus} onChange={(event) => setDoneStatus(event.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={includeRefurb} onChange={(event) => setIncludeRefurb(event.target.checked)} />
          Also read refurb_tasks
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Include in sync
        </label>
        <ColumnMap title="tasks columns" values={columns} onChange={setColumns} />
        {includeRefurb ? <ColumnMap title="refurb_tasks columns" values={refurbColumns} onChange={setRefurbColumns} /> : null}
        {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            disabled={locked || busy}
            onClick={() => {
              setBusy(true);
              setMessage('');
              void discoverIntegration('pos')
                .then((data) => {
                  const found = record(data.tables);
                  const tasks = record(record(found.tasks).mapping);
                  const refurb = record(record(found.refurb_tasks).mapping);
                  if (Object.keys(tasks).length) setColumns(columnState(tasks));
                  if (Object.keys(refurb).length) setRefurbColumns(columnState(refurb));
                  const taskError = text(record(found.tasks).error);
                  setMessage(taskError || 'Column names filled in from the store. Save to keep them.');
                })
                .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not detect columns.'))
                .finally(() => setBusy(false));
            }}
          >
            Detect columns
          </Button>
          <Button
            disabled={locked || busy}
            onClick={() => {
              setBusy(true);
              setMessage('');
              void saveIntegration('pos', {
                enabled,
                settings: {
                  url: url.trim(),
                  includeRefurb,
                  doneStatus: doneStatus.trim() || 'done',
                  tables: { tasks: blankToNull(columns), refurb_tasks: blankToNull(refurbColumns) },
                },
                secrets: apiKey.trim() ? { apiKey: apiKey.trim() } : {},
              })
                .then(async () => {
                  setApiKey('');
                  setMessage('Saved.');
                  await onSaved();
                })
                .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not save.'))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Saving…' : 'Save store'}
          </Button>
        </div>
      </div>
      <SyncMeta row={row} />
    </section>
  );
}

function blankToNull(values: Record<string, string>): Record<string, string | null> {
  const next: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(values)) next[key] = value.trim() === '' ? null : value.trim();
  return next;
}

function ColumnMap({ title, values, onChange }: { title: string; values: Record<string, string>; onChange: (next: Record<string, string>) => void }) {
  return (
    <div>
      <span className="field-label">{title}</span>
      <div className="grid gap-2 sm:grid-cols-2">
        {POS_FIELDS.map((field) => (
          <label key={field.key} className="block">
            <span className="text-xs text-stone-500">{field.label}</span>
            <input className="field" value={values[field.key] ?? ''} placeholder={field.key} onChange={(event) => onChange({ ...values, [field.key]: event.target.value })} />
          </label>
        ))}
      </div>
    </div>
  );
}

interface FoundList {
  href: string;
  name: string;
  vtodo: boolean;
  selectable: boolean;
  components: string[];
}

function RemindersCard({
  row,
  others,
  locked,
  onSaved,
}: {
  row: IntegrationRecord | null;
  others: IntegrationRecord[];
  locked: boolean;
  onSaved: () => Promise<void>;
}) {
  const settings = record(row?.settings);
  const savedLists = Array.isArray(settings.foundLists) ? (settings.foundLists as FoundList[]) : [];
  const [appleId, setAppleId] = useState(text(settings.appleId));
  const [appPassword, setAppPassword] = useState('');
  const [enabled, setEnabled] = useState(row?.enabled ?? false);
  const [tag, setTag] = useState<TagId>((text(settings.tag) || 'personal') as TagId);
  const [lists, setLists] = useState<FoundList[]>(savedLists);
  const [selected, setSelected] = useState<string[]>(Array.isArray(settings.listHrefs) ? settings.listHrefs.filter((href): href is string => typeof href === 'string') : []);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  return (
    <section className="card mb-4 p-4">
      <h2 className="font-serif text-2xl">Apple Reminders</h2>
      <p className="mt-1 text-sm text-stone-500">
        Create an app-specific password at appleid.apple.com → Sign-In and Security → App-Specific Passwords. Name it Lodhi HQ. Completing a synced reminder here marks it completed in iCloud.
      </p>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
        Apple&apos;s newer upgraded Reminders lists are often not exposed over CalDAV, so shared lists and some personal lists may not appear. The lists below are the ones iCloud actually returned.
      </div>
      <div className="mt-4 grid gap-3">
        <label className="block">
          <span className="field-label">Apple ID email</span>
          <input className="field" type="email" autoComplete="off" value={appleId} onChange={(event) => setAppleId(event.target.value)} />
        </label>
        <label className="block">
          <span className="field-label">App-specific password</span>
          <input className="field" type="password" autoComplete="new-password" placeholder={row?.configured ? 'Saved — leave blank to keep' : 'xxxx-xxxx-xxxx-xxxx'} value={appPassword} onChange={(event) => setAppPassword(event.target.value)} />
        </label>
        <div>
          <span className="field-label">Tag</span>
          <TagSelect value={tag} onChange={setTag} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          Include these lists in sync
        </label>
        {lists.length ? (
          <div className="space-y-1">
            {lists.map((list) => (
              <label key={list.href} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={list.selectable === false}
                  checked={selected.includes(list.href)}
                  onChange={(event) => {
                    setSelected((current) => (event.target.checked ? [...current, list.href] : current.filter((href) => href !== list.href)));
                  }}
                />
                <span>
                  {list.name || 'Untitled list'}
                  <span className="ml-2 text-xs text-stone-500">
                    {list.vtodo ? 'Reminders' : list.components?.length ? list.components.join(', ') : 'components not declared'}
                  </span>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm text-stone-500">No lists loaded yet.</p>
        )}
        {message ? <p className="text-sm text-stone-700">{message}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            disabled={locked || busy}
            onClick={() => {
              setBusy(true);
              setMessage('');
              void discoverIntegration('reminders')
                .then((data) => {
                  const found = Array.isArray(data.lists) ? (data.lists as FoundList[]) : [];
                  setLists(found);
                  setMessage(text(data.note) || `Found ${found.length} collection${found.length === 1 ? '' : 's'}.`);
                })
                .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not reach iCloud.'))
                .finally(() => setBusy(false));
            }}
          >
            Find lists
          </Button>
          <Button
            disabled={locked || busy}
            onClick={() => {
              setBusy(true);
              setMessage('');
              void saveIntegration('reminders', {
                enabled,
                settings: { tag, appleId: appleId.trim(), listHrefs: selected, foundLists: lists },
                secrets: {
                  ...(appleId.trim() ? { appleId: appleId.trim() } : {}),
                  ...(appPassword.trim() ? { appPassword: appPassword.trim() } : {}),
                },
              })
                .then(async () => {
                  setAppPassword('');
                  setMessage('Saved.');
                  await onSaved();
                })
                .catch((err: unknown) => setMessage(err instanceof Error ? err.message : 'Could not save.'))
                .finally(() => setBusy(false));
            }}
          >
            {busy ? 'Saving…' : 'Save Reminders'}
          </Button>
        </div>
      </div>
      <SyncMeta row={row} />
      {others.length ? (
        <ul className="mt-4 space-y-2 border-t border-line pt-3 text-sm">
          {others.map((item) => (
            <li key={item.id}>
              <span className="font-medium">{item.userName || item.userId}</span>
              <span className="text-stone-500"> · {item.enabled ? 'on' : 'off'}</span>
              {item.lastError ? <span className="block text-red-700">{item.lastError}</span> : null}
              {Array.isArray(record(item.settings).foundLists) ? (
                <span className="block text-stone-500">
                  Lists found: {(record(item.settings).foundLists as FoundList[]).map((list) => list.name).filter(Boolean).join(', ') || 'none'}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
