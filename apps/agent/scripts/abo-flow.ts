/**
 * Plays the Abo-Killer flow the way the Angular app does, with @ag-ui/client's HttpAgent:
 *
 *   run 1  scan_statements (SEE) → choose_subscriptions with the agent's suggestions (ASK; the human adds Loading Spinner Pro)
 *   run 2  send_cancellations → interrupt (DECIDE)
 *   run 3  resume "approved" → one subagent per provider (DELEGATE) → summary
 *
 * It prints every run. With --record <dir> it also writes each run's events to <dir>/abo-run-N.jsonl
 * (replay mode, slides). A relative <dir> resolves against the current working directory, which is
 * the repository root under Nx. AGENT_URL points at another agent (default http://localhost:8930/abo).
 *
 *   pnpm nx run agent:abo-flow
 *   pnpm nx run agent:abo-flow --record recordings
 *   node apps/agent/scripts/abo-flow.ts --record /tmp/abo
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { HttpAgent } from '@ag-ui/client';

type RunParameters = Parameters<HttpAgent['runAgent']>[0];
type RecordedEvent = { type: string; [field: string]: unknown };
type Suggestion = { id: string; reason: string };

const url = process.env.AGENT_URL ?? 'http://localhost:8930/abo';
const agent = new HttpAgent({ url, threadId: `abo-flow-${Date.now()}` });

// The same tool the Angular app offers with registerHumanInTheLoop (ChooseArgsSchema as JSON Schema).
const chooseTool = {
  name: 'choose_subscriptions',
  description: 'Propose which subscriptions to cancel, each with a short reason. The user reviews and decides.',
  parameters: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'subscription id from scan_statements' },
            reason: { type: 'string', description: 'why it looks unused, a few words' },
          },
          required: ['id', 'reason'],
          additionalProperties: false,
        },
      },
    },
    required: ['suggestions'],
    additionalProperties: false,
  },
};
const recordings = recordDirectory(process.argv.slice(2));
if (recordings) mkdirSync(recordings, { recursive: true });

agent.addMessage({ id: 'user-1', role: 'user', content: 'Find subscriptions I can cancel.' });
await run(1, { tools: [chooseTool] });

const choose = lastToolCall('choose_subscriptions');
if (!choose) fail('run 1 did not call choose_subscriptions');
const suggestions: Suggestion[] = JSON.parse(choose.function.arguments || '{}').suggestions ?? [];
console.log(`  agent suggests: ${suggestions.map((suggestion) => `${suggestion.id} (${suggestion.reason})`).join(', ') || '(nothing)'}`);
// The human edits the proposal: Loading Spinner Pro costs nothing, so the agent skipped it. The human cancels it anyway.
const decision = [...suggestions.map((suggestion) => suggestion.id), 'spinner'];
console.log(`  human decides: ${decision.join(', ')}`);
agent.addMessage({ id: 'tool-choose', role: 'tool', toolCallId: choose.id, content: JSON.stringify({ cancel: decision }) });

await run(2, { tools: [chooseTool] });
const interrupt = agent.pendingInterrupts[0];
if (!interrupt) fail('run 2 did not end with an interrupt');
console.log(`  interrupt: ${interrupt.id} · ${interrupt.message}`);

await run(3, { tools: [chooseTool], resume: [{ interruptId: interrupt.id, status: 'resolved', payload: { approved: true } }] });
const summary = agent.messages.findLast((message) => message.role === 'assistant' && message.content);
console.log(`\nsummary: ${summary?.role === 'assistant' ? summary.content : '(none)'}`);
console.log(`state keys: ${Object.keys((agent.state as object) ?? {}).join(', ')}`);

async function run(n: number, parameters: RunParameters): Promise<void> {
  const events: RecordedEvent[] = [];
  const started = Date.now();
  await agent.runAgent(parameters, {
    onEvent: ({ event }) => {
      events.push({ ...event, timestamp: event.timestamp ?? Date.now() });
    },
  });
  console.log(`\nrun ${n} (${((Date.now() - started) / 1000).toFixed(1)} s, ${events.length} events)\n  ${collapse(events.map((event) => event.type)).join('\n  → ')}`);
  if (!recordings) return;
  const file = join(recordings, `abo-run-${n}.jsonl`);
  writeFileSync(file, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
  console.log(`  recorded ${file}`);
}

/** `--record <dir>` or `--record=<dir>`, resolved against the current working directory; undefined without the flag. */
function recordDirectory(args: string[]): string | undefined {
  const index = args.findIndex((arg) => arg === '--record' || arg.startsWith('--record='));
  if (index < 0) return undefined;
  const dir = args[index] === '--record' ? args[index + 1] : args[index].slice('--record='.length);
  if (!dir || dir.startsWith('--')) fail('--record needs a directory, for example --record recordings');
  return resolve(dir);
}

function lastToolCall(name: string) {
  const calls = agent.messages.flatMap((message) => (message.role === 'assistant' ? (message.toolCalls ?? []) : []));
  return calls.findLast((call) => call.function.name === name);
}

function collapse(types: string[]): string[] {
  const out: string[] = [];
  for (const type of types) {
    const last = out.at(-1);
    if (last?.startsWith(type)) out[out.length - 1] = `${type} ×${Number(last.split('×')[1] ?? 1) + 1}`;
    else out.push(type);
  }
  return out;
}

function fail(reason: string): never {
  console.error(`✗ ${reason}`);
  process.exit(1);
}
