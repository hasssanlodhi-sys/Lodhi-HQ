import {
  addDays,
  combine,
  daysBetween,
  endOfDay,
  formatDate,
  pastDaysThisWeek,
  startOfDay,
  startOfWeek,
  upcomingWeekday,
} from '../lib/dates';
import type { AppState, CheckIn, Member, Mood, Priority, Reward, Status, TagId, Task } from '../types';
import { OWNER_ID } from '../types';

const EARLY = ['04:58', '05:05', '05:12', '05:21', '05:28', '05:36', '05:44', '05:51'];

const MEMBERS: Member[] = [
  {
    id: OWNER_ID,
    name: 'Muhammad Hassan Lodhi',
    role: 'Owner',
    businessTags: ['cell-phone', 'essentials', 'tax', 'hustler', 'telconnect', 'personal'],
    contact: '(214) 555-0108',
    owner: true,
  },
  {
    id: 'store-staff',
    name: 'Store Staff',
    role: 'Retail Associate',
    businessTags: ['cell-phone'],
    contact: '(214) 555-0144',
  },
  {
    id: 'office-assistant',
    name: 'Office Assistant',
    role: 'Client Coordinator',
    businessTags: ['tax'],
    contact: '(214) 555-0160',
  },
  {
    id: 'sales-rep',
    name: 'Sales Rep',
    role: 'Automotive Sales',
    businessTags: ['hustler'],
    contact: '(214) 555-0193',
  },
  {
    id: 'marketing-lead',
    name: 'Marketing Lead',
    role: 'Campaign Manager',
    businessTags: ['telconnect'],
    contact: '(214) 555-0117',
  },
  {
    id: 'fulfillment',
    name: 'Fulfillment Lead',
    role: 'Warehouse & Shipping',
    businessTags: ['essentials'],
    contact: '(214) 555-0186',
  },
];

const REWARDS: Reward[] = [
  { id: 'reward_friday', title: 'Friday half-day', points: 400, claimed: false },
  { id: 'reward_dinner', title: 'Dinner out', points: 750, claimed: false },
  { id: 'reward_weekend', title: 'Weekend off', points: 1000, claimed: false },
  { id: 'reward_shoes', title: 'New gym shoes', points: 1500, claimed: false },
  { id: 'reward_long', title: 'Long weekend', points: 3000, claimed: false },
];

interface OpenSpec {
  title: string;
  tag: TagId;
  priority: Priority;
  assigneeId: string;
  status: Status;
  estimate: number;
  notes?: string;
  recurrence?: 'daily' | null;
  helpedMemberId?: string | null;
  when:
    | { kind: 'offset'; days: number; h: number; m?: number }
    | { kind: 'weekday'; dow: number; h: number; m?: number }
    | { kind: 'all-day'; days: number }
    | { kind: 'none' };
}

const OPEN_TASKS: OpenSpec[] = [
  {
    title: 'Restock iPhone 15 screen protectors',
    tag: 'cell-phone',
    priority: 'High',
    assigneeId: 'store-staff',
    status: 'To Do',
    estimate: 45,
    notes: 'Endcap is down to 4 units. Reorder if the case count is under 12.',
    when: { kind: 'offset', days: 0, h: 11 },
  },
  {
    title: 'Ship 12 Walmart Fitbit orders',
    tag: 'essentials',
    priority: 'Urgent',
    assigneeId: OWNER_ID,
    status: 'In Progress',
    estimate: 90,
    notes: 'Walmart WFS. Pack slips are printed. Two Texas orders need to leave today.',
    when: { kind: 'offset', days: 0, h: 14 },
  },
  {
    title: 'Chase W-2s from 3 clients',
    tag: 'tax',
    priority: 'Medium',
    assigneeId: 'office-assistant',
    status: 'Waiting',
    estimate: 60,
    notes: 'Waiting on Rivera, Nguyen, and Park. Third reminder goes out Friday.',
    when: { kind: 'weekday', dow: 5, h: 16 },
  },
  {
    title: 'List 2019 Camry on Facebook Marketplace',
    tag: 'hustler',
    priority: 'Medium',
    assigneeId: 'sales-rep',
    status: 'To Do',
    estimate: 40,
    notes: '118k miles, clean title, asking $14,900. Shoot the photos in daylight.',
    when: { kind: 'offset', days: 1, h: 12 },
  },
  {
    title: 'Send November ad report to client',
    tag: 'telconnect',
    priority: 'High',
    assigneeId: 'marketing-lead',
    status: 'In Progress',
    estimate: 50,
    notes: 'Northside Dental plus two smaller retainers. Compare spend against leads.',
    when: { kind: 'offset', days: 0, h: 15, m: 30 },
  },
  {
    title: 'Gym – leg day',
    tag: 'personal',
    priority: 'Medium',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 75,
    notes: 'Squat, Romanian deadlift, walking lunges, calf raises. Daily.',
    recurrence: 'daily',
    when: { kind: 'offset', days: 0, h: 18 },
  },
  {
    title: 'Repair ticket #4412 — cracked S23 screen',
    tag: 'cell-phone',
    priority: 'Urgent',
    assigneeId: 'store-staff',
    status: 'In Progress',
    estimate: 60,
    notes: 'Customer is waiting in the shop. Glass only, frame is intact.',
    when: { kind: 'offset', days: 0, h: 10 },
  },
  {
    title: 'Price unlocked Pixel 9 trade-ins',
    tag: 'cell-phone',
    priority: 'High',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 30,
    notes: 'Three units came in yesterday. Check Swappa before posting a number.',
    when: { kind: 'offset', days: 0, h: 13 },
  },
  {
    title: 'Order MagSafe cases for the weekend rush',
    tag: 'cell-phone',
    priority: 'Medium',
    assigneeId: 'store-staff',
    status: 'To Do',
    estimate: 25,
    notes: 'Black and clear, iPhone 15 and 16. Vendor cutoff is 3 PM.',
    when: { kind: 'offset', days: 2, h: 17 },
  },
  {
    title: 'Close the register and drop the safe',
    tag: 'cell-phone',
    priority: 'High',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 20,
    notes: 'Zelle the deposit and text the closing photo to yourself.',
    when: { kind: 'offset', days: 0, h: 20 },
  },
  {
    title: 'Follow up on the iPhone 14 battery wait',
    tag: 'cell-phone',
    priority: 'Medium',
    assigneeId: 'store-staff',
    status: 'Waiting',
    estimate: 20,
    notes: 'Part is on the UPS truck. Text the customer when it scans in.',
    when: { kind: 'offset', days: 1, h: 15 },
  },
  {
    title: 'Respond to 4 Amazon return requests',
    tag: 'essentials',
    priority: 'Urgent',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 40,
    notes: 'Two Fitbits and two band sets. Approve the ones with photos.',
    when: { kind: 'offset', days: 0, h: 11, m: 30 },
  },
  {
    title: 'Photograph 20 resistance-band SKUs',
    tag: 'essentials',
    priority: 'Medium',
    assigneeId: 'fulfillment',
    status: 'To Do',
    estimate: 80,
    notes: 'Use the white sweep. Need a lifestyle shot and a flat lay for each color.',
    when: { kind: 'offset', days: 1, h: 15 },
  },
  {
    title: 'Recount vitamin SKUs in bin B',
    tag: 'essentials',
    priority: 'Low',
    assigneeId: 'fulfillment',
    status: 'To Do',
    estimate: 50,
    notes: 'Last count was short 6 bottles. Do not adjust Walmart until it is confirmed.',
    when: { kind: 'offset', days: 2, h: 10 },
  },
  {
    title: 'Update Fitbit listing bullets for the holidays',
    tag: 'essentials',
    priority: 'Medium',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 40,
    notes: 'Lead with gift shipping cutoff and the 2-year band warranty.',
    when: { kind: 'offset', days: 3, h: 16 },
  },
  {
    title: 'E-file the extension for Khan LLC',
    tag: 'tax',
    priority: 'High',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 45,
    notes: 'Signature is on the 8879. Payment voucher still needs the amount.',
    when: { kind: 'offset', days: 1, h: 11 },
  },
  {
    title: 'Scan the Q4 vendor receipts',
    tag: 'tax',
    priority: 'Medium',
    assigneeId: 'office-assistant',
    status: 'To Do',
    estimate: 70,
    notes: 'Stack is on the left of the copier. Name files by vendor and date.',
    when: { kind: 'weekday', dow: 5, h: 14 },
  },
  {
    title: 'Call the IRS about the missing 8879',
    tag: 'tax',
    priority: 'High',
    assigneeId: 'office-assistant',
    status: 'Waiting',
    estimate: 30,
    notes: 'Practitioner line. Have the CAF and the client EIN ready.',
    when: { kind: 'offset', days: 0, h: 16 },
  },
  {
    title: 'Prep January organizer emails',
    tag: 'tax',
    priority: 'Low',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 50,
    notes: 'One version for W-2 clients and one for the schedule C shops.',
    when: { kind: 'all-day', days: 6 },
  },
  {
    title: 'Detail the 2018 Accord before test drives',
    tag: 'hustler',
    priority: 'High',
    assigneeId: 'sales-rep',
    status: 'In Progress',
    estimate: 90,
    notes: 'Interior smells like smoke. Ozone for 20 minutes, then the usual wash.',
    when: { kind: 'offset', days: 0, h: 9, m: 30 },
  },
  {
    title: 'Call the Camry financing lead',
    tag: 'hustler',
    priority: 'Urgent',
    assigneeId: 'sales-rep',
    status: 'To Do',
    estimate: 20,
    notes: 'Asked about $2,000 down. Credit app is half filled out.',
    when: { kind: 'offset', days: 0, h: 16, m: 30 },
  },
  {
    title: 'Post the Civic walkaround reel',
    tag: 'hustler',
    priority: 'Medium',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 35,
    notes: 'Clip is in the camera roll. Caption should mention the new tires.',
    when: { kind: 'offset', days: 0, h: 19 },
  },
  {
    title: 'Title paperwork for the sold Altima',
    tag: 'hustler',
    priority: 'High',
    assigneeId: 'sales-rep',
    status: 'Waiting',
    estimate: 40,
    notes: 'Buyer is bringing the insurance card at 4. Do not release keys before that.',
    when: { kind: 'offset', days: 0, h: 17 },
  },
  {
    title: 'Renew the dealer lot insurance quote',
    tag: 'hustler',
    priority: 'Low',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 30,
    notes: 'Current policy renews next month. Ask about the new Civic on the lot.',
    when: { kind: 'all-day', days: 5 },
  },
  {
    title: 'Draft the December Meta ad set',
    tag: 'telconnect',
    priority: 'High',
    assigneeId: 'marketing-lead',
    status: 'To Do',
    estimate: 60,
    notes: 'Three creatives, one lead form. Keep the dental client off the auto creative.',
    when: { kind: 'offset', days: 1, h: 13 },
  },
  {
    title: 'Pull the Google Ads search-terms report',
    tag: 'telconnect',
    priority: 'Medium',
    assigneeId: 'marketing-lead',
    status: 'To Do',
    estimate: 40,
    notes: 'Last 30 days. Flag anything spending over $20 with zero leads.',
    when: { kind: 'offset', days: 0, h: 12 },
  },
  {
    title: 'Review the weekly cash position',
    tag: 'personal',
    priority: 'High',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 30,
    notes: 'Phone store, Essentials payout, and the lot deposit. One page is enough.',
    when: { kind: 'offset', days: 0, h: 21 },
  },
  {
    title: 'Call Ammi',
    tag: 'personal',
    priority: 'Low',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 15,
    notes: 'Ask about Sunday lunch.',
    when: { kind: 'offset', days: 0, h: 20, m: 30 },
  },
  {
    title: 'Meal prep for the week',
    tag: 'personal',
    priority: 'Medium',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 60,
    notes: 'Chicken, rice, and something green. Enough for five lunches.',
    when: { kind: 'weekday', dow: 0, h: 11 },
  },
  {
    title: 'Brainstorm a holiday bundle',
    tag: 'essentials',
    priority: 'Medium',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 30,
    notes: 'Band + charger + gift box. No deadline yet — slot it when the bench is free.',
    when: { kind: 'all-day', days: 0 },
  },
  {
    title: 'Cover the front counter for the supplier run',
    tag: 'cell-phone',
    priority: 'High',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 60,
    helpedMemberId: 'store-staff',
    notes: 'Store Staff is picking up glass. Hold the counter until they are back.',
    when: { kind: 'offset', days: 0, h: 15 },
  },
  {
    title: 'Proofread the November ad report',
    tag: 'telconnect',
    priority: 'High',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 25,
    helpedMemberId: 'marketing-lead',
    notes: 'Read it before Marketing Lead sends it. Check the client names.',
    when: { kind: 'offset', days: 0, h: 15 },
  },
  {
    title: 'Invoice October retainer — Northside Dental',
    tag: 'telconnect',
    priority: 'Urgent',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 25,
    notes: 'Still open from earlier this month. Net 15. Do not let it age into December.',
    when: { kind: 'offset', days: -18, h: 17 },
  },
  {
    title: 'Reorder Walmart WFS labels',
    tag: 'essentials',
    priority: 'High',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 20,
    notes: 'The thermal roll ran out. This one slipped — order a two-pack today.',
    when: { kind: 'offset', days: -22, h: 12 },
  },
  {
    title: 'Drop off the donation bags',
    tag: 'personal',
    priority: 'Low',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 20,
    notes: 'Two bags in the trunk. No set time.',
    when: { kind: 'none' },
  },
  {
    title: 'Lot photo day for Marketplace',
    tag: 'hustler',
    priority: 'High',
    assigneeId: 'sales-rep',
    status: 'To Do',
    estimate: 180,
    notes: 'Every car that is not already listed. Start with the Camry and the Accord.',
    when: { kind: 'weekday', dow: 5, h: 13 },
  },
  {
    title: 'Quarterly accessory count',
    tag: 'cell-phone',
    priority: 'Medium',
    assigneeId: 'store-staff',
    status: 'To Do',
    estimate: 150,
    notes: 'Cases, glass, chargers, and prepaid cards. Close the count before Friday night.',
    when: { kind: 'weekday', dow: 5, h: 18 },
  },
  {
    title: 'Client Q4 strategy call',
    tag: 'telconnect',
    priority: 'High',
    assigneeId: 'marketing-lead',
    status: 'To Do',
    estimate: 90,
    notes: 'Northside Dental wants a December plan. Bring the search-terms report.',
    when: { kind: 'weekday', dow: 5, h: 11 },
  },
  {
    title: 'Saturday lot cleanup',
    tag: 'hustler',
    priority: 'Medium',
    assigneeId: 'sales-rep',
    status: 'To Do',
    estimate: 90,
    notes: 'Vacuum the Civic, straighten the cones, and take the trash out.',
    when: { kind: 'weekday', dow: 6, h: 10 },
  },
  {
    title: 'Reply to weekend Walmart messages',
    tag: 'essentials',
    priority: 'Medium',
    assigneeId: OWNER_ID,
    status: 'To Do',
    estimate: 30,
    notes: 'Buyers ask about delivery dates all weekend. Keep replies under two lines.',
    when: { kind: 'weekday', dow: 6, h: 11 },
  },
];

interface DoneSpec {
  title: string;
  tag: TagId;
  assigneeId: string;
  priority: Priority;
  estimate: number;
  hour: number;
}

const THIS_WEEK_DONE: DoneSpec[] = [
  { title: 'Pack 30 phone-grip bundles', tag: 'essentials', assigneeId: OWNER_ID, priority: 'High', estimate: 40, hour: 11 },
  { title: 'Answer the Walmart buyer about ship windows', tag: 'essentials', assigneeId: OWNER_ID, priority: 'High', estimate: 25, hour: 12 },
  { title: 'Reprint FNSKU labels for the vitamin bin', tag: 'essentials', assigneeId: OWNER_ID, priority: 'Medium', estimate: 30, hour: 13 },
  { title: 'Ship the morning Amazon wave', tag: 'essentials', assigneeId: 'fulfillment', priority: 'Urgent', estimate: 70, hour: 11 },
  { title: 'Confirm the WFS inbound appointment', tag: 'essentials', assigneeId: 'fulfillment', priority: 'High', estimate: 20, hour: 15 },
  { title: 'Refund the duplicate Fitbit order', tag: 'essentials', assigneeId: OWNER_ID, priority: 'High', estimate: 15, hour: 16 },
  { title: 'Cycle-count the charging cables', tag: 'essentials', assigneeId: 'fulfillment', priority: 'Medium', estimate: 45, hour: 14 },
  { title: 'Refresh the Essentials holiday banner', tag: 'essentials', assigneeId: OWNER_ID, priority: 'Medium', estimate: 35, hour: 17 },
  { title: 'Box the Target sample kits', tag: 'essentials', assigneeId: 'fulfillment', priority: 'Medium', estimate: 50, hour: 16 },
  { title: 'Close out two damaged-in-transit claims', tag: 'essentials', assigneeId: OWNER_ID, priority: 'High', estimate: 30, hour: 15 },
  { title: 'Sell the iPhone 13 to a walk-in', tag: 'cell-phone', assigneeId: 'store-staff', priority: 'High', estimate: 25, hour: 13 },
  { title: 'Program two prepaid SIMs', tag: 'cell-phone', assigneeId: 'store-staff', priority: 'Medium', estimate: 30, hour: 15 },
  { title: 'Price-match a screen repair', tag: 'cell-phone', assigneeId: OWNER_ID, priority: 'Medium', estimate: 20, hour: 12 },
  { title: 'Book three January appointments', tag: 'tax', assigneeId: 'office-assistant', priority: 'Medium', estimate: 30, hour: 11 },
  { title: 'Send the Rivera engagement letter', tag: 'tax', assigneeId: OWNER_ID, priority: 'High', estimate: 25, hour: 14 },
  { title: 'Follow up with the Patel family after the test drive', tag: 'hustler', assigneeId: 'sales-rep', priority: 'High', estimate: 20, hour: 16 },
  { title: 'Wash the 2020 Civic', tag: 'hustler', assigneeId: 'sales-rep', priority: 'Medium', estimate: 40, hour: 10 },
  { title: 'Launch the retargeting ad set', tag: 'telconnect', assigneeId: 'marketing-lead', priority: 'High', estimate: 45, hour: 11 },
  { title: 'Send the weekly leads CSV', tag: 'telconnect', assigneeId: 'marketing-lead', priority: 'Medium', estimate: 25, hour: 13 },
  { title: 'Fix UTM tags on the landing page', tag: 'telconnect', assigneeId: 'marketing-lead', priority: 'High', estimate: 30, hour: 15 },
  { title: 'Approve the November creative proofs', tag: 'telconnect', assigneeId: 'marketing-lead', priority: 'Medium', estimate: 20, hour: 16 },
  { title: 'Schedule the December email blast', tag: 'telconnect', assigneeId: 'marketing-lead', priority: 'Medium', estimate: 25, hour: 17 },
];

const HISTORY_TITLES: Record<TagId, string[]> = {
  essentials: [
    'Ship the afternoon Walmart wave',
    'Answer buyer messages before noon',
    'Restock poly mailers',
    'Fix a suppressed listing',
    'Photograph a new charger colorway',
    'Reconcile the Amazon payout',
  ],
  'cell-phone': [
    'Replace a walk-in iPhone battery',
    'Count the prepaid wall',
    'Post a refurbished iPhone 13',
    'File the repair waiver',
    'Wipe trade-in phones',
    'Match a competitor screen price',
  ],
  tax: [
    'Call a client about missing receipts',
    'Draft a bookkeeping recap',
    'Organize the extension folder',
    'Send a document request list',
    'Reconcile a payroll deposit',
    'Review a sales-tax worksheet',
  ],
  hustler: [
    'Answer a Marketplace lead',
    'Move cars for the afternoon light',
    'Update the window sticker',
    'Confirm a buyer’s insurance',
    'Clean the lot office',
    'Log a new test drive',
  ],
  telconnect: [
    'Pause a tired ad set',
    'Write three primary texts',
    'Export the week’s lead sheet',
    'Check the landing page form',
    'Reply to a client Slack thread',
    'Note wasted search terms',
  ],
  personal: [
    'Review the cash position',
    'Family call',
    'Grocery run',
    'Plan tomorrow on paper',
    'Clear personal email',
    'Lay out gym clothes',
  ],
};

const ROTATION = [OWNER_ID, 'store-staff', 'marketing-lead', 'fulfillment', 'sales-rep', 'office-assistant'];
const HELPERS = ['store-staff', 'office-assistant', 'sales-rep', 'marketing-lead', 'fulfillment'];
const TAG_ROTATION: TagId[] = ['essentials', 'cell-phone', 'telconnect', 'hustler', 'tax', 'personal', 'essentials', 'cell-phone'];
const PRIORITY_ROTATION: Priority[] = ['Medium', 'High', 'Low', 'High', 'Medium', 'Urgent'];

function moodFor(woke: string, gym: boolean, arrived: boolean): Mood {
  let score = 3;
  if (woke < '06:00') score += 1;
  if (gym) score += 1;
  if (!arrived) score -= 1;
  return Math.min(5, Math.max(1, score)) as Mood;
}

function buildCheckIns(now: Date): CheckIn[] {
  const today = startOfDay(now);
  const thisMonday = startOfWeek(now);
  const lastMonday = addDays(thisMonday, -7);
  const prevMonday = addDays(thisMonday, -14);
  const entries: CheckIn[] = [];

  for (let offset = -30; offset <= -1; offset += 1) {
    const day = addDays(today, offset);
    const dow = day.getDay();
    const inLast = day >= lastMonday && day < thisMonday;
    const inPrev = day >= prevMonday && day < lastMonday;
    const inCurrent = day >= thisMonday && day < today;

    let woke = offset % 4 === 0 ? '05:48' : '06:55';
    let gym = dow === 1 || dow === 3 || dow === 5;
    let arrived = offset % 6 !== 0;

    if (inLast) {
      woke = EARLY[dow % EARLY.length];
      arrived = true;
      gym = dow >= 1 && dow <= 5;
    } else if (inPrev) {
      gym = dow >= 1 && dow <= 5;
      arrived = dow !== 0;
      woke = offset >= -14 ? EARLY[Math.abs(offset) % EARLY.length] : dow === 2 ? '07:20' : '06:10';
    } else if (inCurrent) {
      woke = EARLY[dow % EARLY.length];
      arrived = true;
      gym = dow >= 1 && dow <= 5;
    } else if (offset === -15) {
      woke = '06:42';
      arrived = true;
      gym = false;
    }

    const date = formatDate(day);
    entries.push({
      id: `check_${date}`,
      date,
      wokeUpAt: woke,
      gymDone: gym,
      arrivedOnTime: arrived,
      mood: moodFor(woke, gym, arrived),
    });
  }

  return entries;
}

function resolveOpen(spec: OpenSpec, now: Date, id: string): Task {
  let deadline: string | null = null;
  let allDay = false;
  if (spec.when.kind === 'offset') {
    deadline = combine(addDays(now, spec.when.days), spec.when.h, spec.when.m ?? 0).toISOString();
  } else if (spec.when.kind === 'weekday') {
    deadline = combine(upcomingWeekday(now, spec.when.dow), spec.when.h, spec.when.m ?? 0).toISOString();
  } else if (spec.when.kind === 'all-day') {
    deadline = endOfDay(addDays(now, spec.when.days)).toISOString();
    allDay = true;
  }
  return {
    id,
    title: spec.title,
    tag: spec.tag,
    deadline,
    allDay,
    priority: spec.priority,
    assigneeId: spec.assigneeId,
    status: spec.status,
    estimatedTime: spec.estimate,
    notes: spec.notes ?? '',
    completedAt: null,
    onTime: null,
    recurrence: spec.recurrence ?? null,
    helpedMemberId: spec.helpedMemberId ?? null,
    createdAt: addDays(now, -2).toISOString(),
  };
}

function makeDone(options: {
  id: string;
  title: string;
  tag: TagId;
  assigneeId: string;
  priority: Priority;
  estimate: number;
  day: Date;
  deadlineHour: number;
  late: boolean;
  helpedMemberId: string | null;
  notes?: string;
}): Task {
  const deadline = combine(options.day, options.deadlineHour, 0);
  const completed = options.late
    ? combine(options.day, options.deadlineHour + 3, 20)
    : combine(options.day, Math.max(8, options.deadlineHour - 1), 12);
  return {
    id: options.id,
    title: options.title,
    tag: options.tag,
    deadline: deadline.toISOString(),
    allDay: false,
    priority: options.priority,
    assigneeId: options.assigneeId,
    status: 'Done',
    estimatedTime: options.estimate,
    notes: options.notes ?? '',
    completedAt: completed.toISOString(),
    onTime: completed.getTime() <= deadline.getTime(),
    recurrence: null,
    helpedMemberId: options.helpedMemberId,
    createdAt: addDays(options.day, -1).toISOString(),
  };
}

function buildTasks(now: Date): Task[] {
  const today = startOfDay(now);
  const thisMonday = startOfWeek(now);
  let seq = 1;
  const nextId = () => `task_${seq++}`;
  const tasks: Task[] = OPEN_TASKS.map((spec) => resolveOpen(spec, now, nextId()));

  const past = pastDaysThisWeek(now);
  if (past.length > 0) {
    THIS_WEEK_DONE.forEach((spec, index) => {
      const day = past[index % past.length];
      tasks.push(
        makeDone({
          id: nextId(),
          title: spec.title,
          tag: spec.tag,
          assigneeId: spec.assigneeId,
          priority: spec.priority,
          estimate: spec.estimate,
          day,
          deadlineHour: spec.hour,
          late: false,
          helpedMemberId: null,
          notes: 'Closed earlier this week.',
        }),
      );
    });
  }

  let helpedLeft = 11;
  let dayIndex = 0;
  for (let offset = -29; offset <= -1; offset += 1) {
    const day = addDays(today, offset);
    if (day >= thisMonday) continue;
    const lateDay = offset <= -16 && offset % 4 === 0;
    let madeLate = false;
    for (let k = 0; k < 2; k += 1) {
      let assigneeId = ROTATION[(dayIndex + k) % ROTATION.length];
      let late = false;
      if (lateDay && !madeLate) {
        assigneeId = OWNER_ID;
        late = true;
        madeLate = true;
      }
      const tag = TAG_ROTATION[(dayIndex + k) % TAG_ROTATION.length];
      const titles = HISTORY_TITLES[tag];
      const title = titles[(Math.abs(offset) + k) % titles.length];
      let helpedMemberId: string | null = null;
      if (assigneeId === OWNER_ID && helpedLeft > 0) {
        helpedMemberId = HELPERS[(11 - helpedLeft) % HELPERS.length];
        helpedLeft -= 1;
      }
      tasks.push(
        makeDone({
          id: nextId(),
          title,
          tag,
          assigneeId,
          priority: PRIORITY_ROTATION[(dayIndex + k) % PRIORITY_ROTATION.length],
          estimate: 30 + k * 20,
          day,
          deadlineHour: 15,
          late,
          helpedMemberId,
        }),
      );
    }
    dayIndex += 1;
  }

  let safety = 0;
  while (helpedLeft > 0 && safety < 20) {
    const day = addDays(today, -19 - safety * 2);
    if (daysBetween(day, today) < -40) break;
    tasks.push(
      makeDone({
        id: nextId(),
        title: 'Jumped in on a teammate’s open loop',
        tag: 'essentials',
        assigneeId: OWNER_ID,
        priority: 'High',
        estimate: 25,
        day,
        deadlineHour: 16,
        late: false,
        helpedMemberId: HELPERS[safety % HELPERS.length],
        notes: 'Muhammad covered this so the assignee could stay on their own queue.',
      }),
    );
    helpedLeft -= 1;
    safety += 1;
  }

  return tasks;
}

export function buildSeed(now = new Date()): AppState {
  return {
    members: MEMBERS.map((member) => ({ ...member, businessTags: [...member.businessTags] })),
    tasks: buildTasks(now),
    checkIns: buildCheckIns(now),
    rewards: REWARDS.map((reward) => ({ ...reward })),
  };
}
