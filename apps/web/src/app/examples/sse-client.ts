import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

type WireEvent = { type: string; messageId?: string; delta?: string };
type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string };

/**
 * An AG-UI client without CopilotKit: POST a RunAgentInput, read the SSE stream, render the events.
 */
@Component({
  selector: 'app-sse-client',
  imports: [FormsModule],
  template: `
    <form class="composer" (ngSubmit)="send()">
      <select name="route" [(ngModel)]="route">
        <option value="/agui">/agui · Gemma 4</option>
        <option value="/hello">/hello · no model</option>
      </select>
      <input name="prompt" [(ngModel)]="prompt" placeholder="Ask something…" />
      <button [disabled]="running()">Send</button>
    </form>

    <div class="columns">
      <div class="transcript">
        @for (message of messages(); track message.id) {
          <p class="bubble" [class.user]="message.role === 'user'">{{ message.content }}</p>
        }
        @if (running()) {
          @if (thinking()) {
            <p class="thinking">{{ thinking() }}</p>
          }
          <p class="bubble">{{ answer() }}</p>
        }
      </div>

      <ol class="wire">
        @for (group of wire(); track $index) {
          <li>
            <code>{{ group.type }}</code>
            @if (group.count > 1) {
              <span>×{{ group.count }}</span>
            }
          </li>
        }
      </ol>
    </div>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 16px; height: 100%; }
    .composer { display: flex; gap: 8px; }
    .composer input { flex: 1; }
    .composer > * { font: inherit; padding: 8px 12px; border: 1px solid var(--sv-line); border-radius: 8px; }
    .columns { display: grid; grid-template-columns: 1fr 320px; gap: 16px; flex: 1; min-height: 0; }
    .transcript, .wire { overflow: auto; margin: 0; padding: 12px; background: rgba(255, 255, 255, 0.6); border: 1px solid var(--sv-line); border-radius: 12px; }
    .bubble { margin: 0 0 10px; line-height: 1.45; }
    .bubble.user { text-align: right; color: var(--sv-blue); }
    .thinking { margin: 0 0 10px; color: var(--sv-muted); font-size: 13px; max-height: 120px; overflow: auto; }
    .wire { list-style: none; font-size: 13px; }
    .wire li { padding: 3px 0; }
    .wire span { color: var(--sv-orange); margin-left: 6px; }
  `,
})
export class SseClient {
  protected readonly route = signal('/agui');
  protected readonly prompt = signal('Say hello to the audience in one sentence.');
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly events = signal<WireEvent[]>([]);
  protected readonly running = signal(false);

  protected readonly answer = computed(() => deltas(this.events(), 'TEXT_MESSAGE_CONTENT'));
  protected readonly thinking = computed(() => deltas(this.events(), 'REASONING_MESSAGE_CONTENT'));
  protected readonly wire = computed(() => groupByType(this.events()));

  private readonly threadId = crypto.randomUUID();

  protected async send(): Promise<void> {
    this.messages.update((list) => [...list, { id: crypto.randomUUID(), role: 'user', content: this.prompt() }]);
    this.events.set([]);
    this.running.set(true);

    try {
      // @live 3 begin: POST a RunAgentInput, read the SSE stream
      const response = await fetch(`http://localhost:8930${this.route()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({
          threadId: this.threadId,
          runId: crypto.randomUUID(),
          messages: this.messages(),
          tools: [],
          context: [],
          state: {},
        }),
      });

      const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
        buffer += chunk.value;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (frame.startsWith('data: ')) this.events.update((list) => [...list, JSON.parse(frame.slice(6))]);
        }
      }

      this.messages.update((list) => [...list, { id: crypto.randomUUID(), role: 'assistant', content: this.answer() }]);
      // @live 3 end
    } finally {
      this.running.set(false);
    }
  }
}

function deltas(events: WireEvent[], type: string): string {
  return events
    .filter((event) => event.type === type)
    .map((event) => event.delta)
    .join('');
}

function groupByType(events: WireEvent[]): { type: string; count: number }[] {
  const groups: { type: string; count: number }[] = [];
  for (const { type } of events) {
    const last = groups.at(-1);
    if (last?.type === type) last.count++;
    else groups.push({ type, count: 1 });
  }
  return groups;
}
