import type { InputContent, Message } from '@ag-ui/core';
import type { ChatMessage } from './llama.ts';

/** AG-UI messages → the model's Chat Completions messages. */
export function toChatMessages(messages: Message[]): ChatMessage[] {
  return messages.flatMap((message): ChatMessage[] => {
    switch (message.role) {
      case 'system':
      case 'developer':
        return [{ role: 'system', content: message.content }];
      case 'user':
        return [{ role: 'user', content: typeof message.content === 'string' ? message.content : textOf(message.content) }];
      case 'assistant':
        return [{ role: 'assistant', content: message.content ?? '', ...(message.toolCalls?.length ? { tool_calls: message.toolCalls } : {}) }];
      case 'tool':
        return [{ role: 'tool', tool_call_id: message.toolCallId, content: message.content }];
      default:
        return []; // activity and reasoning messages are for the screen, never for the model
    }
  });
}

function textOf(parts: InputContent[]): string {
  return parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
}
