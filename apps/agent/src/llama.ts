/**
 * Streams a chat completion from llama.cpp's OpenAI-compatible endpoint (`llama-server --jinja`).
 * This is the model's dialect; turn.ts translates it into AG-UI events.
 */
import { readSseData } from './sse.ts';

const LLAMA_URL = (process.env.LLAMA_URL ?? 'http://127.0.0.1:8080').replace(/\/$/, '');

export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; tool_calls?: ChatToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ChatToolCall = { id: string; type: 'function'; function: { name: string; arguments: string } };

/** A tool the model may call: the same shape as an entry in RunAgentInput.tools. */
export type ChatTool = { name: string; description: string; parameters: unknown };

export type ModelChunk =
  | { type: 'text'; delta: string }
  | { type: 'reasoning'; delta: string }
  | { type: 'tool_call'; index: number; id?: string; name?: string; arguments?: string };

export type ChatOptions = { tools?: ChatTool[]; thinking?: boolean };

export async function* streamChat(messages: ChatMessage[], signal: AbortSignal, options: ChatOptions = {}): AsyncGenerator<ModelChunk> {
  const tools = options.tools?.map(({ name, description, parameters }) => ({ type: 'function', function: { name, description, parameters } }));
  const response = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma-4',
      stream: true,
      messages,
      ...(tools?.length ? { tools } : {}),
      ...(options.thinking === false ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    }),
    signal,
  }).catch((error: Error & { cause?: { code?: string } }) => {
    if (signal.aborted) throw error;
    throw new Error(`Cannot reach llama.cpp at ${LLAMA_URL} (${error.cause?.code ?? error.message}). Is llama-server running?`);
  });
  if (!response.ok || !response.body) throw new Error(`llama.cpp answered HTTP ${response.status}: ${await response.text()}`);

  for await (const data of readSseData(response.body)) {
    if (data === '[DONE]') return;
    const chunk = JSON.parse(data);
    if (chunk.error) throw new Error(chunk.error.message ?? 'llama.cpp stream failed');
    const delta = chunk.choices?.[0]?.delta;
    if (delta?.reasoning_content) yield { type: 'reasoning', delta: delta.reasoning_content };
    if (delta?.content) yield { type: 'text', delta: delta.content };
    for (const call of delta?.tool_calls ?? []) {
      yield { type: 'tool_call', index: call.index ?? 0, id: call.id, name: call.function?.name, arguments: call.function?.arguments };
    }
  }
}
