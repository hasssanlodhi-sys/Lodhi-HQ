import { useEffect, useState } from 'react';
import type { Page } from '../types';

const PAGES: Page[] = ['inbox', 'calendar', 'dashboard', 'performance', 'team', 'integrations'];

export interface RouteState {
  page: Page;
  params: URLSearchParams;
  raw: string;
  navigate: (page: Page, params?: Record<string, string>) => void;
}

function read(): { page: Page; params: URLSearchParams; raw: string } {
  const raw = window.location.hash.replace(/^#/, '') || '/inbox';
  const [path, query] = raw.split('?');
  const name = path.replace(/^\//, '') as Page;
  const page = PAGES.includes(name) ? name : 'inbox';
  return { page, params: new URLSearchParams(query || ''), raw };
}

export function useRoute(): RouteState {
  const [route, setRoute] = useState(read);

  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener('hashchange', onHash);
    if (!window.location.hash) window.location.hash = '/inbox';
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (page: Page, params?: Record<string, string>) => {
    const search = params ? new URLSearchParams(params).toString() : '';
    window.location.hash = `/${page}${search ? `?${search}` : ''}`;
  };

  return { ...route, navigate };
}
