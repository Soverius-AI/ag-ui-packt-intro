import { Component, input } from '@angular/core';
import { CopilotChat } from '@copilotkit/angular';

@Component({
  selector: 'app-copilot-page',
  // @live 4 begin: CopilotKit's chat component
  imports: [CopilotChat],
  // @live 4 stub: imports: [],
  // @live 4 end
  template: `
    <!-- @live 4 begin: the whole chat UI, for the agent named in the route -->
    <copilot-chat [agentId]="agentId()" />
    <!-- @live 4 stub: <p class="placeholder">Step 4: CopilotKit</p> -->
    <!-- @live 4 end -->
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
