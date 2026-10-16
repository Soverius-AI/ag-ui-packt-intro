/**
 * SEE: a long-running server tool that reports progress as activity, then returns its result.
 */
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { EventType, type AGUIEvent } from '@ag-ui/core';
import { MONTHS, SUBSCRIPTIONS, TRANSACTIONS_PER_MONTH, type Subscription } from './data.ts';

export type ScanResult = { months: number; transactions: number; subscriptions: Subscription[] };

export async function* scanStatements(months: number, signal: AbortSignal): AsyncGenerator<AGUIEvent, ScanResult> {
  const total = Math.min(Math.max(Math.round(months) || 12, 1), MONTHS.length);

  // ▶ step 6: SEE, the tool reports its progress as activity (a snapshot, then JSON Patch deltas)
  // ◀ step 6

  return { months: total, transactions: transactionsIn(total), subscriptions: SUBSCRIPTIONS };
}

function transactionsIn(months: number): number {
  return TRANSACTIONS_PER_MONTH.slice(0, months).reduce((sum, count) => sum + count, 0);
}
