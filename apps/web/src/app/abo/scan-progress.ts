import { DecimalPipe } from '@angular/common';
import { Component, input } from '@angular/core';
import type { AbstractAgent, ActivityMessage } from '@ag-ui/client';
import type { ScanProgressContent } from './subscription';

/** SEE: renders the "scan" activity while the agent works, patch by patch. */
@Component({
  selector: 'abo-scan-progress',
  imports: [DecimalPipe],
  template: `
    <div class="card">
      <div class="row">
        <strong>Scanning bank statements</strong>
        <span>{{ content().done }} / {{ content().total }} months</span>
      </div>
      <progress [value]="content().done" [max]="content().total"></progress>
      <div class="meta">
        {{ content().month || 'starting…' }} · {{ content().transactions | number }} transactions ·
        {{ content().found }} subscriptions found
      </div>
    </div>
  `,
  styles: `
    .card { border: 1px solid var(--sv-line); border-radius: 12px; padding: 12px 14px; background: #fff; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    progress { width: 100%; height: 8px; margin: 10px 0 6px; accent-color: var(--sv-blue); }
    .meta { color: var(--sv-muted); font-size: 13px; }
  `,
})
export class ScanProgress {
  readonly activityType = input.required<string>();
  readonly content = input.required<ScanProgressContent>();
  readonly message = input.required<ActivityMessage>();
  readonly agent = input<AbstractAgent>();
}
