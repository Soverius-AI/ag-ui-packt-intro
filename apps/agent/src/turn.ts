/**
 * One model turn as AG-UI events: thinking, text and tool calls, each block opened on its first token.
 */
import { randomUUID } from 'node:crypto';
import { EventType, type AGUIEvent } from '@ag-ui/core';
import { streamChat, type ChatMessage, type ChatTool, type ChatToolCall } from './llama.ts';

export type TurnResult = { text: string; toolCalls: ChatToolCall[] };

export async function* modelTurn(messages: ChatMessage[], signal: AbortSignal, tools: ChatTool[] = []): AsyncGenerator<AGUIEvent, TurnResult> {
  const reasoningId = randomUUID();
  const messageId = randomUUID();
  const toolCalls: ChatToolCall[] = [];
  let thinking = false;
  let answering = false;
  let text = '';

  for await (const chunk of streamChat(messages, signal, { tools })) {
    // Gemma 4 thinks first: stream the thinking as a reasoning message.
    if (chunk.type === 'reasoning') {
      if (answering || toolCalls.length) continue;
      if (!thinking) {
        yield { type: EventType.REASONING_START, messageId: reasoningId };
        yield { type: EventType.REASONING_MESSAGE_START, messageId: reasoningId, role: 'reasoning' };
        thinking = true;
      }
      yield { type: EventType.REASONING_MESSAGE_CONTENT, messageId: reasoningId, delta: chunk.delta };
      continue;
    }
    if (thinking) {
      yield* endReasoning(reasoningId);
      thinking = false;
    }

    // Then the answer text.
    if (chunk.type === 'text') {
      if (!answering) {
        yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant' };
        answering = true;
      }
      text += chunk.delta;
      yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: chunk.delta };
      continue;
    }

    // Or a tool call: the first fragment names the tool, the rest stream its arguments.
    let call = toolCalls[chunk.index];
    if (!call) {
      call = toolCalls[chunk.index] = { id: chunk.id ?? randomUUID(), type: 'function', function: { name: chunk.name ?? '', arguments: '' } };
      yield { type: EventType.TOOL_CALL_START, toolCallId: call.id, toolCallName: call.function.name, ...(answering ? { parentMessageId: messageId } : {}) };
    }
    if (chunk.arguments) {
      call.function.arguments += chunk.arguments;
      yield { type: EventType.TOOL_CALL_ARGS, toolCallId: call.id, delta: chunk.arguments };
    }
  }

  if (thinking) yield* endReasoning(reasoningId);
  if (answering) yield { type: EventType.TEXT_MESSAGE_END, messageId };
  for (const call of toolCalls) yield { type: EventType.TOOL_CALL_END, toolCallId: call.id };
  return { text, toolCalls: toolCalls.filter(Boolean) };
}

function* endReasoning(messageId: string): Generator<AGUIEvent> {
  yield { type: EventType.REASONING_MESSAGE_END, messageId };
  yield { type: EventType.REASONING_END, messageId };
}
