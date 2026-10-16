import type { RunAgentInput } from '@ag-ui/core';
import { EventEncoder } from '@ag-ui/encoder';

/** Prints what arrived. A RunAgentInput is everything the agent knows for one run. */
export function logRunInput(route: string, input: RunAgentInput, accept: string | undefined): void {
  // The format the encoder picks: curl's default */* gets protobuf, a missing header gets SSE.
  const format = new EventEncoder({ accept }).getContentType();
  const roles = Object.entries(Object.groupBy(input.messages, (m) => m.role))
    .map(([role, list]) => `${role}×${list?.length}`)
    .join(' ');

  const rows: [string, string][] = [
    ['threadId', input.threadId],
    ['runId', input.parentRunId ? `${input.runId}  (parent ${input.parentRunId})` : input.runId],
    ['messages', `${input.messages.length}  ${roles}`],
    ['tools', input.tools.map((tool) => tool.name).join(', ') || '—'],
    ['context', input.context.map((entry) => entry.description).join(', ') || '—'],
    ['state', JSON.stringify(input.state ?? {})],
    ['forwardedProps', JSON.stringify(input.forwardedProps ?? {})],
    ['resume', input.resume?.map((entry) => `${entry.interruptId}=${entry.status}`).join(', ') || '—'],
  ];

  console.log(`\n▶ POST ${route}  RunAgentInput → ${format}`);
  for (const [field, value] of rows) {
    console.log(`  ${field.padEnd(15)}${value.length > 100 ? `${value.slice(0, 97)}...` : value}`);
  }
}
