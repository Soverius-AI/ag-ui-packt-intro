import { Component } from '@angular/core';
import { injectInterrupt } from '@copilotkit/angular';

/**
 * DECIDE: the agent ended its run with an interrupt. Nothing happens until a human answers;
 * the answer starts a new run carrying RunAgentInput.resume.
 */
@Component({
  selector: 'abo-approval-card',
  template: `
    <!-- ▶ step 8: show the question, send the answer -->
    <!-- ◀ step 8 -->
  `,
  styles: `
    .approval { display: flex; align-items: center; gap: 10px; border: 2px solid var(--sv-orange); border-radius: 12px; padding: 10px 16px; background: #fff8f2; color: var(--sv-text); }
    p { flex: 1; margin: 0; line-height: 1.4; }
    button { padding: 8px 16px; border: 1px solid var(--sv-line); border-radius: 8px; background: #fff; font: inherit; cursor: pointer; }
    button.primary { border-color: var(--sv-orange); background: var(--sv-orange); color: #fff; }
  `,
})
export class ApprovalCard {
  // ▶ step 8: the interrupt of the abo agent, as signals
  // ◀ step 8
}
