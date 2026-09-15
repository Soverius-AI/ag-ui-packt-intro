/**
 * The smallest AG-UI agent: no model, no framework, just the protocol.
 */
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { EventType, type AGUIEvent, type RunAgentInput } from '@ag-ui/core';

export async function* helloAgent(input: RunAgentInput): AsyncGenerator<AGUIEvent> {
  // ▶ step 1: the smallest agent, one run with one message
  const { threadId, runId } = input;
  const messageId = randomUUID();

  yield { type: EventType.RUN_STARTED, threadId, runId };
  yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' };
  for (const word of ['Hello ', 'from ', 'AG-UI!']) {
    await sleep(300);
    yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: word };
  }
  yield { type: EventType.TEXT_MESSAGE_END, messageId };
  yield { type: EventType.RUN_FINISHED, threadId, runId, outcome: { type: 'success' } };
  // ◀ step 1
}
