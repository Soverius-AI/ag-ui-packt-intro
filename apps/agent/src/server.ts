/**
 * The AG-UI server contract: one POST with a RunAgentInput in, one stream of events out.
 * @ag-ui/encoder speaks both wire formats; the client's Accept header picks SSE or protobuf.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { EventSchemas, EventType, RunAgentInputSchema, type AGUIEvent, type RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';
import { AGUI_MEDIA_TYPE } from '@ag-ui/proto';
import { aboAgent } from './abo/agent.ts';
import { runAgent } from './agent.ts';
import { helloAgent } from './hello.ts';
import { logRunInput } from './log.ts';

type Agent = (input: RunAgentInput, signal: AbortSignal) => AsyncIterable<AGUIEvent>;

// One route per agent. Same protocol, same encoder.
const AGENTS: Record<string, Agent> = {
  '/hello': guard(helloAgent), // no model: the protocol alone
  '/agui': guard(runAgent), // Gemma 4 on llama.cpp
  '/abo': guard(aboAgent), // Abo-Killer: SEE, ASK, DECIDE, DELEGATE
};

const PORT = Number(process.env.PORT ?? 8930);

createServer((req, res) => {
  handle(req, res).catch((error: unknown) => {
    console.error(error);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  });
}).listen(PORT, () => console.log(`AG-UI agents on http://localhost:${PORT}: ${Object.keys(AGENTS).join(', ')}`));

async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return void res.writeHead(204).end();
  const route = req.url ?? '';
  const agent = AGENTS[route];
  if (req.method !== 'POST' || !agent) return void res.writeHead(404).end();

  // Everything the agent knows arrives in this body: the server keeps no session.
  // SDK 0.0.59 requires tools/context/state, so a minimal hand-written curl body gets defaults.
  const parsed = RunAgentInputSchema.safeParse({ tools: [], context: [], state: {}, ...(await readJson(req)) });
  if (!parsed.success) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return void res.end(JSON.stringify(parsed.error.issues));
  }
  const input = parsed.data;
  logRunInput(route, input, req.headers.accept);

  // The agent for this route: an async generator of AG-UI events.
  let events = agent(input, abortOnClose(res));
  // ▶ step 5s: SDK 0.0.59 cannot encode reasoning, activity or tool results as protobuf
  // ◀ step 5s

  // ▶ step 1: one agent, two wire formats
  res.writeHead(501).end('Step 1: stream the events\n');
  // ◀ step 1
}

/** Every agent's events are validated, and a failure after the first byte becomes a RUN_ERROR event. */
function guard(agent: Agent): Agent {
  return async function* (input, signal) {
    try {
      for await (const event of agent(input, signal)) yield EventSchemas.parse(event) as AGUIEvent;
    } catch (error) {
      if (!signal.aborted) yield { type: EventType.RUN_ERROR, message: error instanceof Error ? error.message : String(error) };
    }
  };
}

/** The protobuf binding of SDK 0.0.59 has no message for some event types and would write empty frames. */
async function* skipUnencodable(events: AsyncIterable<AGUIEvent>): AsyncGenerator<AGUIEvent> {
  const protobuf = new EventEncoder({ accept: AGUI_MEDIA_TYPE });
  const skipped = new Set<string>();
  for await (const event of events) {
    if (protobuf.encodeBinary(event).byteLength > 4) {
      yield event;
      continue;
    }
    if (!skipped.has(event.type)) console.warn(`  ⚠ protobuf cannot carry ${event.type} in SDK 0.0.59, skipped`);
    skipped.add(event.type);
  }
}

function abortOnClose(res: ServerResponse): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  return controller.signal;
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let text = '';
  for await (const chunk of req) text += chunk;
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
