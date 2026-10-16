import { Component, computed, input } from '@angular/core';
import type { AbstractAgent, ActivityMessage } from '@ag-ui/client';
import type { LaneContent } from './subscription';

/** DELEGATE: one subagent's lane. Its activity events carry the subagent's subagentRunId. */
@Component({
  selector: 'abo-cancellation-lane',
  template: `
    <div class="lane" [attr.data-status]="content().status">
      <div class="row">
        <strong>{{ content().provider }}</strong>
        <span class="status">{{ label() }}</span>
      </div>
      <p class="letter">{{ content().letter || '…' }}</p>
      @if (content().confirmation) {
        <p class="ok">Confirmation {{ content().confirmation }}</p>
      }
      @if (content().error) {
        <p class="error">{{ content().error }}</p>
      }
    </div>
  `,
  styles: `
    .lane { border: 1px solid var(--sv-line); border-left: 4px solid var(--sv-blue); border-radius: 10px; padding: 8px 12px; background: #fff; margin: 6px 0; }
    .lane[data-status='cancelled'] { border-left-color: var(--sv-green); }
    .lane[data-status='failed'] { border-left-color: #b42318; }
    .row { display: flex; justify-content: space-between; gap: 12px; }
    .status { font-size: 12px; font-weight: 750; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sv-muted); }
    p { margin: 4px 0 0; font-size: 14px; }
    .letter { color: var(--sv-muted); font-style: italic; }
    .ok { color: var(--sv-green); }
    .error { color: #b42318; }
  `,
})
export class CancellationLane {
  readonly activityType = input.required<string>();
  readonly content = input.required<LaneContent>();
  readonly message = input.required<ActivityMessage>();
  readonly agent = input<AbstractAgent>();

  protected readonly label = computed(() => ({ writing: 'writing…', cancelled: 'cancelled', failed: 'failed' })[this.content().status]);
}
