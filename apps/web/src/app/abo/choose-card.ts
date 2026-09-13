import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, input, signal, untracked } from '@angular/core';
import { injectAgentStore, type HumanInTheLoopToolCall } from '@copilotkit/angular';
import type { ChooseArgs, Subscription } from './subscription';

/**
 * ASK: the agent called choose_subscriptions with its proposal (the tool-call arguments).
 * The human reviews it, changes what the agent cannot know, and answers with respond().
 */
@Component({
  selector: 'abo-choose-card',
  imports: [CurrencyPipe],
  template: `
    <div class="card">
      @if (toolCall().status === 'complete') {
        <strong>Your decision</strong>
        <span class="meta">{{ answer() }}</span>
      } @else {
        <strong>The agent suggests cancelling {{ reasons().size }}. You decide.</strong>
        <span class="meta">Its reasons are in orange. Only you know what you still use.</span>
        <ul>
          @for (subscription of subscriptions(); track subscription.id) {
            <li [class.suggested]="reasons().has(subscription.id)">
              <label>
                <input type="checkbox" [checked]="chosen().has(subscription.id)" [disabled]="toolCall().status !== 'executing'" (change)="toggle(subscription.id)" />
                {{ subscription.name }}
              </label>
              <span class="reason">{{ reasons().get(subscription.id) ?? subscription.note ?? 'last used ' + subscription.lastUsed }}</span>
              <span>{{ subscription.perMonth | currency: 'EUR' }}</span>
            </li>
          }
        </ul>
        <button [disabled]="toolCall().status !== 'executing'" (click)="confirm()">
          @if (chosen().size) {
            Cancel {{ chosen().size }} · save {{ savings() | currency: 'EUR' }} per month
          } @else {
            Keep everything
          }
        </button>
      }
    </div>
  `,
  styles: `
    .card { border: 1px solid var(--sv-blue); border-radius: 12px; padding: 12px 14px; background: #fff; margin: 8px 0; display: grid; gap: 4px; color: var(--sv-text); }
    .meta { color: var(--sv-muted); font-size: 13px; }
    ul { list-style: none; margin: 8px 0; padding: 0; }
    li { display: grid; grid-template-columns: 1fr auto 90px; gap: 12px; align-items: center; padding: 4px 0; border-top: 1px solid #eef2f5; }
    li span:last-child { text-align: right; }
    .reason { color: var(--sv-muted); font-size: 13px; }
    .suggested .reason { color: var(--sv-orange); font-weight: 600; }
    button { justify-self: start; padding: 8px 14px; border: 0; border-radius: 8px; background: var(--sv-blue); color: #fff; font: inherit; cursor: pointer; }
    button:disabled { opacity: 0.5; cursor: default; }
  `,
})
export class ChooseCard {
  readonly toolCall = input.required<HumanInTheLoopToolCall<ChooseArgs>>();

  // All subscriptions reached the UI as shared state (STATE_SNAPSHOT).
  private readonly store = injectAgentStore('abo');
  protected readonly subscriptions = computed(() => (this.store().state() as { subscriptions?: Subscription[] } | undefined)?.subscriptions ?? []);

  /** The agent's proposal, streamed in as tool-call arguments: id → reason. */
  protected readonly reasons = computed(
    () => new Map((this.toolCall().args.suggestions ?? []).filter((suggestion) => suggestion?.id).map((suggestion) => [suggestion.id, suggestion.reason ?? ''])),
  );

  protected readonly chosen = signal<ReadonlySet<string>>(new Set());
  protected readonly savings = computed(() =>
    this.subscriptions()
      .filter((subscription) => this.chosen().has(subscription.id))
      .reduce((sum, subscription) => sum + subscription.perMonth, 0),
  );

  /** After respond(): the answer is a tool message in the conversation. Show it in words. */
  protected readonly answer = computed(() => {
    const call = this.toolCall();
    const ids = call.status === 'complete' ? parseCancel(call.result) : [];
    const names = this.subscriptions()
      .filter((subscription) => ids.includes(subscription.id))
      .map((subscription) => subscription.name);
    return names.length ? `Cancel ${names.join(', ')}` : 'Keep everything';
  });

  private touched = false;

  constructor() {
    // Start from the agent's proposal; the human edits it.
    effect(() => {
      const proposal = [...this.reasons().keys()];
      if (!untracked(() => this.touched)) this.chosen.set(new Set(proposal));
    });
  }

  protected toggle(id: string): void {
    this.touched = true;
    this.chosen.update((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  protected confirm(): void {
    this.toolCall().respond({ cancel: [...this.chosen()] });
  }
}

function parseCancel(result: string): string[] {
  try {
    const parsed = JSON.parse(result);
    return Array.isArray(parsed?.cancel) ? parsed.cancel : [];
  } catch {
    return [];
  }
}
