/**
 * The Gemma 4 chat agent: one RunAgentInput in, one run of AG-UI events out.
 */
import { EventType, type AGUIEvent, type RunAgentInput } from '@ag-ui/core';
import type { ChatMessage } from './llama.ts';
import { toChatMessages } from './messages.ts';
import { SYSTEM_PROMPT } from './prompt.ts';
import { modelTurn } from './turn.ts';

export async function* runAgent(input: RunAgentInput, signal: AbortSignal): AsyncGenerator<AGUIEvent> {
  const { threadId, runId } = input;
  yield { type: EventType.RUN_STARTED, threadId, runId };

  // The whole conversation arrives with every run: the server remembers nothing between runs.
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...toChatMessages(input.messages)];
  yield* modelTurn(messages, signal);

  yield { type: EventType.RUN_FINISHED, threadId, runId, outcome: { type: 'success' } };
}
