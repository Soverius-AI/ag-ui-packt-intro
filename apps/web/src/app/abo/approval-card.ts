import { Component } from '@angular/core';
import { injectInterrupt } from '@copilotkit/angular';

/**
 * DECIDE: the agent ended its run with an interrupt. Nothing happens until a human answers;
 * the answer starts a new run carrying RunAgentInput.resume.
 */
@Component({
  selector: 'abo-approval-card',
  template: `
    <!-- @live 8 begin: show the question, send the answer -->
    @if (approval.interrupt(); as request) {
      <section class="approval">
        <p><strong>Approval needed</strong><br />{{ request.message }}</p>
        <button class="primary" (click)="approval.resolve({ approved: true })">Approve</button>
        <button (click)="approval.cancel()">Cancel</button>
      </section>
    }
    <!-- @live 8 end -->
  `,
  styles: `
    .approval { display: flex; align-items: center; gap: 10px; border: 2px solid var(--sv-orange); border-radius: 12px; padding: 10px 16px; background: #fff8f2; color: var(--sv-text); }
    p { flex: 1; margin: 0; line-height: 1.4; }
    button { padding: 8px 16px; border: 1px solid var(--sv-line); border-radius: 8px; background: #fff; font: inherit; cursor: pointer; }
    button.primary { border-color: var(--sv-orange); background: var(--sv-orange); color: #fff; }
  `,
})
export class ApprovalCard {
  // @live 8 begin: the interrupt of the abo agent, as signals
  protected readonly approval = injectInterrupt('abo');
  // @live 8 end
}
