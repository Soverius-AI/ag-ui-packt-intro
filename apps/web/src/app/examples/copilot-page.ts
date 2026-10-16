import { Component, input } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

@Component({
  selector: 'app-copilot-page',
  // ▶ step 4: CopilotKit's chat component
  imports: [],
  // ◀ step 4
  template: `
    <!-- ▶ step 4: the whole chat UI, for the agent named in the route -->
    <p class="placeholder">Step 4: CopilotKit</p>
    <!-- ◀ step 4 -->
  `,
  styles: `
    :host,
    copilot-chat {
      display: block;
      height: 100%;
    }

    .placeholder {
      color: var(--sv-muted);
    }
  `,
})
export class CopilotPage {
  /** From the route: "default" speaks SSE, "protobuf" speaks protobuf. Same agent behind both. */
  readonly agentId = input('default');
}
