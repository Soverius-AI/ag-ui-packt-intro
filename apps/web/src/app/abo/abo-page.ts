import { Component, computed, effect, signal } from '@angular/core';
import {
  CopilotChat,
  injectAgentStore,
  registerHumanInTheLoop,
  registerRenderActivityMessage,
  registerRenderToolCall,
} from '@copilotkit/angular';
import { z } from 'zod';
import { lightBadges } from '../badges';
import { ApprovalCard } from './approval-card';
import { CancellationLane } from './cancellation-lane';
import { ChooseCard } from './choose-card';
import { ScanProgress } from './scan-progress';
import { ChooseArgsSchema, LaneSchema, ScanProgressSchema } from './subscription';
import { SubscriptionsCard } from './subscriptions-card';

@Component({
  selector: 'app-abo-page',
  imports: [CopilotChat, ApprovalCard],
  template: `
    <!-- ▶ step 9: how many subagents are running -->
    @if (laneSummary()) {
      <p class="lanes">{{ laneSummary() }}</p>
    }
    <!-- ◀ step 9 -->
    <copilot-chat agentId="abo" />
    <abo-approval-card />
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 8px; height: 100%; }
    copilot-chat { display: block; flex: 1; min-height: 0; }
    .lanes { margin: 0; font-size: 13px; color: var(--sv-muted); }
  `,
})
export class AboPage {
  constructor() {
    // ▶ step 6: SEE, show the scan while it runs (activity) and its result (tool call)
    registerRenderActivityMessage({ activityType: 'scan', content: ScanProgressSchema, component: ScanProgress, agentId: 'abo' });
    registerRenderToolCall({ name: 'scan_statements', args: z.object({ months: z.number() }), component: SubscriptionsCard, agentId: 'abo' });
    lightBadges('SEE');
    // ◀ step 6

    // ▶ step 7: ASK, the agent proposes in the tool arguments, the human decides
    registerHumanInTheLoop({
      name: 'choose_subscriptions',
      description: 'Propose which subscriptions to cancel, each with a short reason. The user reviews and decides.',
      parameters: ChooseArgsSchema,
      component: ChooseCard,
      agentId: 'abo',
    });
    lightBadges('ASK');
    // ◀ step 7

    // ▶ step 8: DECIDE, <abo-approval-card> answers the interrupt
    lightBadges('DECIDE');
    // ◀ step 8

    // ▶ step 9: DELEGATE, every subagent reports in its own lane
    registerRenderActivityMessage({ activityType: 'cancellation', content: LaneSchema, component: CancellationLane, agentId: 'abo' });
    lightBadges('DELEGATE');
    // ◀ step 9
  }

  // ▶ step 9: CopilotKit has no subagent UI, but the AG-UI client hands us every SUBAGENT_* event
  private readonly store = injectAgentStore('abo');
  private readonly subagents = signal<Record<string, 'running' | 'done' | 'failed'>>({});
  protected readonly laneSummary = computed(() => {
    const states = Object.values(this.subagents());
    if (!states.length) return '';
    const count = (state: string) => states.filter((value) => value === state).length;
    return `Subagents: ${count('running')} running · ${count('done')} done · ${count('failed')} failed`;
  });

  private readonly listen = effect((onCleanup) => {
    const set = (id: string, state: 'running' | 'done' | 'failed') => this.subagents.update((all) => ({ ...all, [id]: state }));
    const subscription = this.store().agent.subscribe({
      onRunStartedEvent: () => this.subagents.set({}),
      onSubagentStartedEvent: ({ event }) => set(event.subagentRunId, 'running'),
      onSubagentFinishedEvent: ({ event }) => set(event.subagentRunId, 'done'),
      onSubagentErrorEvent: ({ event }) => set(event.subagentRunId, 'failed'),
    });
    onCleanup(() => subscription.unsubscribe());
  });
  // ◀ step 9
}
