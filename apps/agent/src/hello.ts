/**
 * The smallest AG-UI agent: no model, no framework, just the protocol.
 */
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { EventType, type AGUIEvent, type RunAgentInput } from '@ag-ui/core';

export async function* helloAgent(input: RunAgentInput): AsyncGenerator<AGUIEvent> {
  // ▶ step 1: the smallest agent, one run with one message
  // ◀ step 1
}
