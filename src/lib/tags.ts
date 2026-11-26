import type { TagId } from '../types';

export interface TagMeta {
  id: TagId;
  name: string;
  short: string;
  color: string;
  tint: string;
  text: string;
}

export const TAGS: Record<TagId, TagMeta> = {
  'cell-phone': {
    id: 'cell-phone',
    name: 'Cell Phone Store',
    short: 'Phones',
    color: '#2563eb',
    tint: '#dbeafe',
    text: '#1d4ed8',
  },
  essentials: {
    id: 'essentials',
    name: 'Essentials – e-commerce',
    short: 'Essentials',
    color: '#ea580c',
    tint: '#ffedd5',
    text: '#c2410c',
  },
  tax: {
    id: 'tax',
    name: 'Tax Accounting Office',
    short: 'Tax',
    color: '#15803d',
    tint: '#dcfce7',
    text: '#166534',
  },
  hustler: {
    id: 'hustler',
    name: 'Hustler Autos – car dealership',
    short: 'Hustler',
    color: '#dc2626',
    tint: '#fee2e2',
    text: '#b91c1c',
  },
  telconnect: {
    id: 'telconnect',
    name: 'Telconnect.us – marketing agency',
    short: 'Telconnect',
    color: '#7c3aed',
    tint: '#ede9fe',
    text: '#6d28d9',
  },
  personal: {
    id: 'personal',
    name: 'Personal',
    short: 'Personal',
    color: '#57534e',
    tint: '#f5f5f4',
    text: '#44403c',
  },
};

export const TAG_LIST: TagMeta[] = [
  TAGS['cell-phone'],
  TAGS.essentials,
  TAGS.tax,
  TAGS.hustler,
  TAGS.telconnect,
  TAGS.personal,
];

export function tagById(id: TagId): TagMeta {
  return TAGS[id];
}
