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
    // ◀ step 7

    // ▶ step 8: DECIDE, <abo-approval-card> answers the interrupt
    // ◀ step 8

    // ▶ step 9: DELEGATE, every subagent reports in its own lane
    // ◀ step 9
  }

  // ▶ step 9: CopilotKit has no subagent UI, but the AG-UI client hands us every SUBAGENT_* event
  // ◀ step 9
}
