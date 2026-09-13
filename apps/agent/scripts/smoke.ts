/**
 * Posts a minimal RunAgentInput to a running agent and checks the stream:
 * every event must parse, and the run must open with RUN_STARTED and close with RUN_FINISHED.
 *
 *   node scripts/smoke.ts                       # /agui over SSE
 *   node scripts/smoke.ts /hello --proto        # /hello over protobuf
 *   node scripts/smoke.ts "Where should we go?"
 */
import { EventSchemas, EventType } from '@ag-ui/core';
import { AGUI_MEDIA_TYPE, decode } from '@ag-ui/proto';
import { readSseData } from '../src/sse.ts';

const args = process.argv.slice(2);
const protobuf = args.includes('--proto');
const route = args.find((arg) => arg.startsWith('/')) ?? '/agui';
const prompt = args.find((arg) => !arg.startsWith('/') && !arg.startsWith('--')) ?? 'Say hello to the audience in one sentence.';
const base = process.env.AGENT_URL ?? 'http://localhost:8930';

const response = await fetch(`${base}${route}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: protobuf ? AGUI_MEDIA_TYPE : 'text/event-stream' },
  body: JSON.stringify({
    threadId: 'smoke-thread',
    runId: `smoke-${Date.now()}`,
    messages: [{ id: 'user-1', role: 'user', content: prompt }],
  }),
});
if (!response.ok || !response.body) {
  console.error(`✗ HTTP ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const contentType = response.headers.get('content-type') ?? '';
const events = contentType === AGUI_MEDIA_TYPE ? readProtobufEvents(response.body) : readSseEvents(response.body);

const types: string[] = [];
let text = '';
for await (const raw of events) {
  const event = EventSchemas.parse(raw);
  types.push(event.type);
  if (event.type === EventType.TEXT_MESSAGE_CONTENT) text += event.delta;
  if (event.type === EventType.RUN_ERROR) console.error(`RUN_ERROR: ${event.message}`);
}

const collapsed = types.reduce<string[]>((out, type) => {
  const last = out.at(-1);
  if (last?.startsWith(type)) out[out.length - 1] = `${type} ×${Number(last.split('×')[1] ?? 1) + 1}`;
  else out.push(type);
  return out;
}, []);
console.log(`POST ${route} → ${contentType}\n  ${collapsed.join('\n  → ')}`);
console.log(`\ntext: ${text}`);

if (types[0] !== EventType.RUN_STARTED || types.at(-1) !== EventType.RUN_FINISHED) {
  console.error('\n✗ the run did not open with RUN_STARTED and close with RUN_FINISHED');
  process.exit(1);
}
console.log(`\n✓ valid AG-UI run (${types.length} events)`);

async function* readSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  for await (const data of readSseData(body)) yield JSON.parse(data);
}

/** Protobuf framing: a 4-byte big-endian length, then one encoded event. */
async function* readProtobufEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  let buffer = new Uint8Array(0);
  for await (const chunk of body) {
    buffer = Uint8Array.from([...buffer, ...chunk]);
    while (buffer.length >= 4) {
      const length = new DataView(buffer.buffer, buffer.byteOffset).getUint32(0);
      if (buffer.length < 4 + length) break;
      yield decode(buffer.slice(4, 4 + length));
      buffer = buffer.slice(4 + length);
    }
  }
}
