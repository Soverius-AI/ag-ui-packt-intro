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

  // @live 6 begin: SEE, the tool reports its progress as activity (a snapshot, then JSON Patch deltas)
  const messageId = randomUUID();
  yield {
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId,
    activityType: 'scan',
    replace: true,
    content: { done: 0, total, month: '', transactions: 0, found: 0 },
  };
  for (let done = 1; done <= total; done++) {
    await sleep(250, undefined, { signal });
    yield {
      type: EventType.ACTIVITY_DELTA,
      messageId,
      activityType: 'scan',
      patch: [
        { op: 'replace', path: '/done', value: done },
        { op: 'replace', path: '/month', value: MONTHS[done - 1] },
        { op: 'replace', path: '/transactions', value: transactionsIn(done) },
        { op: 'replace', path: '/found', value: Math.round((SUBSCRIPTIONS.length * done) / total) },
      ],
    };
  }
  // @live 6 end

  return { months: total, transactions: transactionsIn(total), subscriptions: SUBSCRIPTIONS };
}

function transactionsIn(months: number): number {
  return TRANSACTIONS_PER_MONTH.slice(0, months).reduce((sum, count) => sum + count, 0);
}
