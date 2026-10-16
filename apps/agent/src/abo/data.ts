/** Fake bank data for Abo-Killer. Everything here stays on this laptop. */

export type Subscription = {
  id: string;
  name: string;
  perMonth: number;
  lastUsed: string;
  /** How the provider accepts cancellations. */
  channel: 'online' | 'fax';
  exitFee?: number;
  confirmation?: string;
  note?: string;
};

export const SUBSCRIPTIONS: Subscription[] = [
  { id: 'streamflix', name: 'Streamflix', perMonth: 13.99, lastUsed: '2026-09-12', channel: 'online', confirmation: 'SF-2931' },
  { id: 'ironpump', name: 'IronPump Fitness', perMonth: 39.9, lastUsed: '2026-01-14', channel: 'fax', exitFee: 39 },
  { id: 'tunify', name: 'Tunify Premium', perMonth: 10.99, lastUsed: '2026-03-02', channel: 'online', confirmation: 'TU-7713' },
  { id: 'cloudbox', name: 'CloudBox 2 TB', perMonth: 9.99, lastUsed: '2026-09-11', channel: 'online', confirmation: 'CB-0042', note: 'Your slides live here' },
  { id: 'tagesbote', name: 'Der Tagesbote Digital', perMonth: 14.9, lastUsed: '2026-05-20', channel: 'online', confirmation: 'TB-5528' },
  { id: 'linguaowl', name: 'LinguaOwl Plus', perMonth: 12.99, lastUsed: '2026-02-10', channel: 'online', confirmation: 'LO-3190' },
  { id: 'pixelvpn', name: 'PixelVPN', perMonth: 4.99, lastUsed: '2025-11-30', channel: 'online', confirmation: 'PV-8804' },
  { id: 'liability', name: 'Liability insurance', perMonth: 6.5, lastUsed: '—', channel: 'online', confirmation: 'LI-1207', note: 'Insurance: unused is good news' },
  { id: 'spinner', name: 'Loading Spinner Pro', perMonth: 0, lastUsed: 'minute 4 of this talk', channel: 'online', confirmation: 'SP-0000' },
];

export const MONTHS = ['Oct 2025', 'Nov 2025', 'Dec 2025', 'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026'];

/** Card transactions per month; 1,400 in total. */
export const TRANSACTIONS_PER_MONTH = [121, 108, 139, 104, 97, 115, 118, 122, 119, 131, 110, 116];
