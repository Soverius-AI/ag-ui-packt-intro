import { CurrencyPipe } from '@angular/common';
import { Component, computed, input } from '@angular/core';
import type { AngularToolCall } from '@copilotkit/angular';
import { ScanResultSchema, parseJson } from './subscription';

/** SEE: renders the scan_statements tool call, first while it runs, then its result. */
@Component({
  selector: 'abo-subscriptions-card',
  imports: [CurrencyPipe],
  template: `
    @if (scan(); as result) {
      <div class="card">
        <strong>{{ result.subscriptions.length }} subscriptions · {{ total() | currency: 'EUR' }} per month</strong>
        <span class="meta">{{ result.transactions }} transactions in {{ result.months }} months</span>
        <ul>
          @for (subscription of result.subscriptions; track subscription.id) {
            <li>
              <span>{{ subscription.name }}</span>
              <span class="meta">last used {{ subscription.lastUsed }}</span>
              <span>{{ subscription.perMonth | currency: 'EUR' }}</span>
            </li>
          }
        </ul>
      </div>
    } @else {
      <div class="card meta">Calling scan_statements({{ toolCall().args.months ?? '…' }} months)…</div>
    }
  `,
  styles: `
    .card { border: 1px solid var(--sv-line); border-radius: 12px; padding: 12px 14px; background: #fff; margin: 8px 0; display: grid; gap: 4px; }
    .meta { color: var(--sv-muted); font-size: 13px; }
    ul { list-style: none; margin: 8px 0 0; padding: 0; }
    li { display: grid; grid-template-columns: 1fr auto 90px; gap: 12px; padding: 4px 0; border-top: 1px solid #eef2f5; }
    li span:last-child { text-align: right; }
  `,
})
export class SubscriptionsCard {
  readonly toolCall = input.required<AngularToolCall<{ months: number }>>();

  protected readonly scan = computed(() => {
    const call = this.toolCall();
    return call.status === 'complete' ? parseJson(ScanResultSchema, call.result) : undefined;
  });
  protected readonly total = computed(() => (this.scan()?.subscriptions ?? []).reduce((sum, subscription) => sum + subscription.perMonth, 0));
}
