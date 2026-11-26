export const OWNER_ID = 'muhammad';

export type TagId =
  | 'cell-phone'
  | 'essentials'
  | 'tax'
  | 'hustler'
  | 'telconnect'
  | 'personal';

export type Priority = 'Urgent' | 'High' | 'Medium' | 'Low';
export type Status = 'To Do' | 'In Progress' | 'Waiting' | 'Done';
export type Mood = 1 | 2 | 3 | 4 | 5;

export interface Member {
  id: string;
  name: string;
  role: string;
  businessTags: TagId[];
  contact: string;
  owner?: boolean;
}

export interface Task {
  id: string;
  title: string;
  tag: TagId;
  deadline: string | null;
  allDay: boolean;
  priority: Priority;
  assigneeId: string;
  status: Status;
  estimatedTime: number;
  notes: string;
  completedAt: string | null;
  onTime: boolean | null;
  recurrence: 'daily' | null;
  helpedMemberId: string | null;
  createdAt: string;
}

export interface CheckIn {
  id: string;
  date: string;
  wokeUpAt: string;
  gymDone: boolean;
  arrivedOnTime: boolean;
  mood: Mood;
}

export interface Reward {
  id: string;
  title: string;
  points: number;
  claimed: boolean;
}

export interface AppState {
  tasks: Task[];
  members: Member[];
  checkIns: CheckIn[];
  rewards: Reward[];
}

export type Page = 'inbox' | 'calendar' | 'dashboard' | 'performance' | 'team';

export const PRIORITIES: Priority[] = ['Urgent', 'High', 'Medium', 'Low'];
export const STATUSES: Status[] = ['To Do', 'In Progress', 'Waiting', 'Done'];

export const POINTS = {
  onTime: 10,
  late: 5,
  habit: 15,
  perfectWeek: 50,
} as const;

export const LEVELS = [
  { name: 'Starter', min: 0 },
  { name: 'Consistent', min: 500 },
  { name: 'Reliable', min: 1500 },
  { name: 'Machine', min: 5000 },
] as const;

export const GYM_WEEKLY_TARGET = 5;
export const OVERLOAD_MINUTES = 8 * 60;
export const DAY_START_HOUR = 5;
export const DAY_END_HOUR = 23;
export const HOUR_PX = 68;
