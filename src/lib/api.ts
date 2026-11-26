import type { AppState, CheckIn, Member, Reward, Task } from '../types';

/** Keep in sync with DEMO_STAFF_PASSWORD in api/lib/bootstrap.php. */
export const DEMO_STAFF_PASSWORD = 'Lodhi-demo-1';

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  owner: boolean;
  businessTags: Member['businessTags'];
  mustChangePassword: boolean;
}

export interface BoardPayload {
  user: CurrentUser;
  csrfToken: string;
  pendingSample: boolean;
  tasks: Task[];
  members: Member[];
  checkIns: CheckIn[];
  rewards: Reward[];
}

export interface CompletionRow {
  memberId: string;
  completed: number;
  onTimeRate: number | null;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let csrf = '';
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

function rememberCsrf(data: unknown): void {
  if (data && typeof data === 'object' && 'csrfToken' in data && typeof data.csrfToken === 'string') {
    csrf = data.csrfToken;
  }
}

async function request<T>(path: string, options: RequestInit = {}, retried = false): Promise<T> {
  const headers = new Headers(options.headers);
  const method = (options.method ?? 'GET').toUpperCase();
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (method !== 'GET' && method !== 'HEAD' && csrf) headers.set('X-CSRF-Token', csrf);

  let response: Response;
  try {
    response = await fetch(`/api${path}`, { ...options, method, headers, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check that the API is running.');
  }

  const data: unknown = await response.json().catch(() => ({}));
  rememberCsrf(data);
  const errorText = data && typeof data === 'object' && 'error' in data && typeof data.error === 'string' ? data.error : 'Request failed.';

  if (response.status === 403 && errorText === 'Invalid CSRF token.' && !retried) {
    await request('/me', { method: 'GET' }, true);
    return request<T>(path, options, true);
  }

  const bare = path.split('?')[0];
  if (response.status === 401 && bare !== '/login' && bare !== '/me') {
    onUnauthorized?.();
  }
  if (!response.ok) throw new ApiError(response.status, errorText);
  return data as T;
}

export function me(): Promise<{ user: CurrentUser | null; csrfToken: string }> {
  return request('/me');
}

export function login(email: string, password: string): Promise<{ user: CurrentUser; csrfToken: string }> {
  return request('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export function logout(): Promise<{ ok: boolean }> {
  return request('/logout', { method: 'POST', body: '{}' });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<{ user: CurrentUser; csrfToken: string }> {
  return request('/account/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
}

export function loadBoard(): Promise<BoardPayload> {
  return request('/state');
}

export function createTask(task: Task): Promise<{ task: Task }> {
  return request('/tasks', { method: 'POST', body: JSON.stringify(task) });
}

export function updateTask(task: Task): Promise<{ task: Task }> {
  return request(`/tasks/${encodeURIComponent(task.id)}`, { method: 'PUT', body: JSON.stringify(task) });
}

export function removeTask(id: string): Promise<{ ok: boolean }> {
  return request(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function saveCheckIn(checkIn: CheckIn): Promise<{ checkIn: CheckIn }> {
  return request('/checkins', { method: 'POST', body: JSON.stringify(checkIn) });
}

export function createReward(reward: Reward): Promise<{ reward: Reward }> {
  return request('/rewards', { method: 'POST', body: JSON.stringify(reward) });
}

export function updateReward(reward: Reward): Promise<{ reward: Reward }> {
  return request(`/rewards/${encodeURIComponent(reward.id)}`, { method: 'PUT', body: JSON.stringify(reward) });
}

export function removeReward(id: string): Promise<{ ok: boolean }> {
  return request(`/rewards/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function createMember(member: Member, password: string): Promise<{ member: Member; user?: CurrentUser }> {
  return request('/members', { method: 'POST', body: JSON.stringify({ ...member, password }) });
}

export function updateMember(member: Member, password?: string): Promise<{ member: Member; user?: CurrentUser }> {
  return request(`/members/${encodeURIComponent(member.id)}`, {
    method: 'PUT',
    body: JSON.stringify(password ? { ...member, password } : member),
  });
}

export function setMemberActive(id: string, active: boolean): Promise<{ member: Member; user?: CurrentUser }> {
  return request(`/members/${encodeURIComponent(id)}/active`, { method: 'POST', body: JSON.stringify({ active }) });
}

export function resetBoard(state: AppState): Promise<BoardPayload> {
  return request('/reset', { method: 'POST', body: JSON.stringify(state) });
}

export function fetchCompletions(from: string, to: string): Promise<CompletionRow[]> {
  return request<{ rows: CompletionRow[] }>(
    `/completions?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  ).then((data) => data.rows);
}

export async function persistDiff(prev: AppState, next: AppState): Promise<void> {
  const prevTaskIds = new Set(prev.tasks.map((task) => task.id));
  const nextTaskIds = new Set(next.tasks.map((task) => task.id));
  for (const task of next.tasks) {
    if (prev.tasks.includes(task)) continue;
    if (prevTaskIds.has(task.id)) await updateTask(task);
    else await createTask(task);
  }
  for (const id of prevTaskIds) {
    if (!nextTaskIds.has(id)) await removeTask(id);
  }

  for (const checkIn of next.checkIns) {
    if (!prev.checkIns.includes(checkIn)) await saveCheckIn(checkIn);
  }

  const prevRewardIds = new Set(prev.rewards.map((reward) => reward.id));
  const nextRewardIds = new Set(next.rewards.map((reward) => reward.id));
  for (const reward of next.rewards) {
    if (prev.rewards.includes(reward)) continue;
    if (prevRewardIds.has(reward.id)) await updateReward(reward);
    else await createReward(reward);
  }
  for (const id of prevRewardIds) {
    if (!nextRewardIds.has(id)) await removeReward(id);
  }
}
