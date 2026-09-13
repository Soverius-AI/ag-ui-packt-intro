/**
 * DELEGATE: one subagent per provider, all in parallel. Each one writes its cancellation with Gemma
 * and reports progress in its own lane. A failed lane is not a failed run.
 */
import { randomUUID } from 'node:crypto';
import { EventType, type AGUIEvent } from '@ag-ui/core';
import { streamChat } from '../llama.ts';
import { SUBSCRIPTIONS, type Subscription } from './data.ts';

export type CancellationOutcome =
  | { id: string; name: string; status: 'cancelled'; confirmation: string }
  | { id: string; name: string; status: 'failed'; reason: string; letterDraft: string };

export type CancellationReport = { cancelled: CancellationOutcome[]; failed: CancellationOutcome[]; note?: string };

export async function* sendCancellations(ids: string[], parentToolCallId: string, signal: AbortSignal): AsyncGenerator<AGUIEvent, CancellationReport> {
  const chosen = SUBSCRIPTIONS.filter((subscription) => ids.includes(subscription.id));
  const outcomes = yield* merge(chosen.map((subscription) => cancelWith(subscription, parentToolCallId, signal)));
  return report(outcomes);
}

/** Without delegation: everything at once, no lanes, nobody sees what happens. */
export function cancelAll(ids: string[]): CancellationReport {
  const chosen = SUBSCRIPTIONS.filter((subscription) => ids.includes(subscription.id));
  return report(
    chosen.map((subscription): CancellationOutcome =>
      subscription.channel === 'fax'
        ? { id: subscription.id, name: subscription.name, status: 'failed', reason: faxOnly(subscription), letterDraft: '' }
        : { id: subscription.id, name: subscription.name, status: 'cancelled', confirmation: subscription.confirmation ?? 'OK' },
    ),
  );
}

async function* cancelWith(subscription: Subscription, parentToolCallId: string, signal: AbortSignal): AsyncGenerator<AGUIEvent, CancellationOutcome> {
  const subagentRunId = randomUUID();
  const messageId = randomUUID();
  const lane = (patch: object[]): AGUIEvent => ({ type: EventType.ACTIVITY_DELTA, messageId, activityType: 'cancellation', subagentRunId, patch });

  yield { type: EventType.SUBAGENT_STARTED, subagentRunId, name: `cancel ${subscription.name}`, description: `Cancel ${subscription.name}`, parentToolCallId };
  yield {
    type: EventType.ACTIVITY_SNAPSHOT,
    messageId,
    activityType: 'cancellation',
    subagentRunId,
    replace: true,
    content: { provider: subscription.name, status: 'writing', letter: '' },
  };

  // Every subagent is its own model call, running at the same time as the others.
  let letter = '';
  const prompt = [
    { role: 'system' as const, content: 'You write very short, polite cancellation notices. Two sentences. No subject line, no placeholders.' },
    { role: 'user' as const, content: `Cancel my ${subscription.name} subscription at the next possible date.` },
  ];
  for await (const chunk of streamChat(prompt, signal, { thinking: false })) {
    if (chunk.type !== 'text') continue;
    letter += chunk.delta;
    yield lane([{ op: 'replace', path: '/letter', value: letter }]);
  }

  if (subscription.channel === 'fax') {
    const reason = faxOnly(subscription);
    yield lane([{ op: 'replace', path: '/status', value: 'failed' }, { op: 'add', path: '/error', value: reason }]);
    yield { type: EventType.SUBAGENT_ERROR, subagentRunId, message: reason, code: 'FAX_ONLY' };
    return { id: subscription.id, name: subscription.name, status: 'failed', reason, letterDraft: letter };
  }

  const confirmation = subscription.confirmation ?? randomUUID().slice(0, 7);
  yield lane([{ op: 'replace', path: '/status', value: 'cancelled' }, { op: 'add', path: '/confirmation', value: confirmation }]);
  yield { type: EventType.SUBAGENT_FINISHED, subagentRunId, result: { confirmation }, outcome: { type: 'success' } };
  return { id: subscription.id, name: subscription.name, status: 'cancelled', confirmation };
}

function report(outcomes: CancellationOutcome[]): CancellationReport {
  return {
    cancelled: outcomes.filter((outcome) => outcome.status === 'cancelled'),
    failed: outcomes.filter((outcome) => outcome.status === 'failed'),
  };
}

function faxOnly(subscription: Subscription): string {
  return `${subscription.name} accepts cancellations only by fax or registered letter.`;
}

/** Runs several event streams at once and interleaves their events in arrival order. */
async function* merge<T, R>(streams: AsyncGenerator<T, R>[]): AsyncGenerator<T, R[]> {
  const results: R[] = new Array(streams.length);
  const next = (index: number) => streams[index]!.next().then((step) => ({ index, step }));
  const pending = new Map(streams.map((_, index) => [index, next(index)]));
  while (pending.size) {
    const { index, step } = await Promise.race(pending.values());
    if (step.done) {
      results[index] = step.value;
      pending.delete(index);
    } else {
      pending.set(index, next(index));
      yield step.value;
    }
  }
  return results;
}
