/**
 * Abo-Killer: finds the subscriptions in your bank statements and cancels the ones you choose.
 *
 *   SEE       scan_statements reports progress as activity, then returns a result
 *   ASK       the agent proposes in choose_subscriptions' arguments; the UI offered that tool, so the human answers
 *   DECIDE    send_cancellations is legally binding: the run ends with an interrupt
 *   DELEGATE  after approval, one subagent per provider runs in parallel
 */
import { randomUUID } from 'node:crypto';
import { EventType, type AGUIEvent, type Message, type RunAgentInput } from '@ag-ui/core';
import type { ChatMessage, ChatTool, ChatToolCall } from '../llama.ts';
import { toChatMessages } from '../messages.ts';
import { modelTurn } from '../turn.ts';
import { cancelAll, sendCancellations, type CancellationReport } from './cancel.ts';
import { SUBSCRIPTIONS, type Subscription } from './data.ts';
import { scanStatements } from './scan.ts';

const SYSTEM_PROMPT = `You are Abo-Killer, a finance teammate running on this laptop. Bank data never leaves the device.
Work in this order and never skip a step:
1. Call scan_statements with months 12.
2. If the tool choose_subscriptions is available, call it right away with your suggestions: the subscriptions that look unused, each with a short reason (for example "no check-in since January"). Never suggest insurance. Do not list the subscriptions in text; the user sees them on screen.
3. After the user has decided, call send_cancellations.
4. After the cancellations ran, summarise the outcome in at most three short sentences.
If a tool is not available, explain the next step in one short sentence instead.`;

const SERVER_TOOLS: ChatTool[] = [
  {
    name: 'scan_statements',
    description: 'Scan the last months of bank statements for recurring subscriptions.',
    parameters: { type: 'object', properties: { months: { type: 'integer', description: 'How many months to scan' } }, required: ['months'] },
  },
  {
    name: 'send_cancellations',
    description: "Send the cancellations the user chose. Legally binding, always needs the user's approval.",
    parameters: { type: 'object', properties: {} },
  },
];

const APPROVAL_ID = 'approve-cancellations';
const NOTHING_SENT: CancellationReport = { cancelled: [], failed: [], note: 'The user said no. Nothing was sent.' };

export async function* aboAgent(input: RunAgentInput, signal: AbortSignal): AsyncGenerator<AGUIEvent> {
  const { threadId, runId } = input;
  yield { type: EventType.RUN_STARTED, threadId, runId };

  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }, ...toChatMessages(input.messages)];

  // DECIDE, part 2: this run carries the user's answer to our interrupt.
  const answer = input.resume?.find((entry) => entry.interruptId === APPROVAL_ID);
  const pending = answer && openToolCall(input.messages, 'send_cancellations');
  if (pending) {
    const approved = answer.status === 'resolved';
    // @live 9 begin: DELEGATE, one subagent per provider, all in parallel
    const result = approved ? yield* sendCancellations(chosenIds(messages) ?? [], pending, signal) : NOTHING_SENT;
    // @live 9 stub: const result = approved ? cancelAll(chosenIds(messages) ?? []) : NOTHING_SENT;
    // @live 9 end
    yield* toolResult(messages, pending, result);
  }

  // The UI's tools arrive with every run, next to our own.
  const tools = [...SERVER_TOOLS, ...input.tools.map(({ name, description, parameters }) => ({ name, description, parameters }))];

  for (let turn = 0; turn < 6; turn++) {
    const { text, toolCalls } = yield* modelTurn(messages, signal, tools);
    if (!toolCalls.length) break;
    messages.push({ role: 'assistant', content: text, tool_calls: toolCalls });

    for (const call of toolCalls) {
      const name = call.function.name;

      // ASK: the UI offered this tool, so the UI answers it. Stop, and continue on the next run.
      if (input.tools.some((tool) => tool.name === name)) {
        yield { type: EventType.RUN_FINISHED, threadId, runId, outcome: { type: 'success' } };
        return;
      }

      // SEE: a server tool that shows its work while it runs.
      if (name === 'scan_statements') {
        if (messages.some(isScanResult)) {
          yield* toolResult(messages, call.id, { note: 'Already scanned. Tell the user the next step in one short sentence.' });
          continue;
        }
        const result = yield* scanStatements(Number(parseArguments(call).months), signal);
        yield { type: EventType.STATE_SNAPSHOT, snapshot: { subscriptions: result.subscriptions } };
        yield* toolResult(messages, call.id, result);
        continue;
      }

      if (name === 'send_cancellations') {
        const ids = chosenIds(messages);
        if (!ids) {
          yield* toolResult(messages, call.id, { error: 'The user has not decided yet. Call choose_subscriptions first.' });
          continue;
        }
        const chosen = SUBSCRIPTIONS.filter((subscription) => ids.includes(subscription.id));
        if (!chosen.length) {
          yield* toolResult(messages, call.id, { ...NOTHING_SENT, note: 'The user kept everything. Nothing to cancel.' });
          continue;
        }
        // @live 8 begin: DECIDE, legally binding, so end the run with a question instead of acting
        yield {
          type: EventType.RUN_FINISHED,
          threadId,
          runId,
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: APPROVAL_ID, reason: 'confirmation', toolCallId: call.id, message: approvalMessage(chosen) }],
          },
        };
        return;
        // @live 8 stub: yield* toolResult(messages, call.id, cancelAll(chosen.map((subscription) => subscription.id))); // nobody was asked!
        // @live 8 stub: continue;
        // @live 8 end
      }

      yield* toolResult(messages, call.id, { error: `Unknown tool ${name}` });
    }
  }

  yield { type: EventType.RUN_FINISHED, threadId, runId, outcome: { type: 'success' } };
}

/** Exactly what will happen, in one sentence a human can say yes or no to. */
function approvalMessage(chosen: Subscription[]): string {
  const names = chosen.map((subscription) => subscription.name).join(', ');
  const fees = chosen.filter((subscription) => subscription.exitFee).map((subscription) => ` ${subscription.name} charges a €${subscription.exitFee} exit fee.`);
  return `Send ${chosen.length} legally binding cancellations (${names})?${fees.join('')}`;
}

function* toolResult(messages: ChatMessage[], toolCallId: string, result: unknown): Generator<AGUIEvent> {
  const content = JSON.stringify(result);
  messages.push({ role: 'tool', tool_call_id: toolCallId, content });
  yield { type: EventType.TOOL_CALL_RESULT, messageId: randomUUID(), toolCallId, content, role: 'tool' };
}

function isScanResult(message: ChatMessage): boolean {
  if (message.role !== 'tool') return false;
  try {
    return Array.isArray(JSON.parse(message.content)?.subscriptions);
  } catch {
    return false;
  }
}

function parseArguments(call: ChatToolCall): Record<string, unknown> {
  try {
    return JSON.parse(call.function.arguments || '{}');
  } catch {
    return {};
  }
}

/** The id of the latest call to `name` that has no tool result yet. */
function openToolCall(messages: Message[], name: string): string | undefined {
  const answered = new Set(messages.flatMap((message) => (message.role === 'tool' ? [message.toolCallId] : [])));
  const calls = messages.flatMap((message) => (message.role === 'assistant' ? (message.toolCalls ?? []) : []));
  return calls.findLast((call) => call.function.name === name && !answered.has(call.id))?.id;
}

/**
 * What the human decided in choose_subscriptions: the answer lives in the messages, not on the server.
 * undefined = not decided yet, [] = keep everything.
 */
function chosenIds(messages: ChatMessage[]): string[] | undefined {
  const callIds = new Set(
    messages
      .flatMap((message) => (message.role === 'assistant' ? (message.tool_calls ?? []) : []))
      .filter((call) => call.function.name === 'choose_subscriptions')
      .map((call) => call.id),
  );
  const answer = messages.findLast((message) => message.role === 'tool' && callIds.has(message.tool_call_id));
  if (answer?.role !== 'tool') return undefined;
  try {
    const parsed = JSON.parse(answer.content);
    return Array.isArray(parsed?.cancel) ? parsed.cancel : [];
  } catch {
    return [];
  }
}
