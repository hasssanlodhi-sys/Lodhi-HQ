import { buildSeed } from './seed';
import type { AppState } from '../types';

const KEY = 'lodhi-hq-v1';

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return buildSeed();
    const data = JSON.parse(raw) as Partial<AppState>;
    if (!Array.isArray(data.tasks) || !Array.isArray(data.members) || !Array.isArray(data.checkIns) || !Array.isArray(data.rewards)) {
      return buildSeed();
    }
    return data as AppState;
  } catch {
    return buildSeed();
  }
}

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
